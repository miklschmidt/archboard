import type { IncomingMessage } from "http";
import { WebSocket, WebSocketServer } from "ws";
import type { RawData } from "ws";
import { logger } from "@/runtime/engine/logger";
import type { WebSocketMessage } from "@/runtime/engine/types";
import { parseBoardKey } from "@/runtime/engine/board";
import { createCanvasCodexBrowserSocketSend } from "@/server/canvas/codex-workbench-browser";
import type { BrowserConnectionInstance } from "@/server/canvas/codex-workbench-browser";
import { agentActivity, tellPaneAboutLock } from "@/server/canvas/lib/board-announcements";
import { server } from "@/server/canvas/lib/canvas-app";
import { codexWiring } from "@/server/canvas/lib/canvas-codex-host";
import {
	acceptedSockets,
	boardForNewPane,
	clientIds,
	clients,
	codexSocketInstances,
	currentSocketsByClient,
	latestSocketAcceptanceByClient,
	notePaneClosed,
	paneBoards,
	panes,
	syncLockWatch,
} from "@/server/canvas/lib/pane-registry";
import { isRecord } from "@/server/canvas/lib/request-board";

/**
 * Retire the client-id keyed state of a socket that owned its pane identity:
 * its registration and any layout request waiting on it.
 * @param closingId The pane's client id.
 */
function retirePaneOwner(closingId: string): void {
	currentSocketsByClient.delete(closingId);
	panes.delete(closingId);
	notePaneClosed(closingId);
}

/**
 * Forget a socket that has closed. Exact Codex cleanup is safe for a replaced
 * socket. Client-id keyed canvas state is not: a replacement may already own
 * that pane identity, so only the socket that owns it retires it.
 * @param ws The closed socket.
 * @param acceptanceToken The token this socket's acceptance was stamped with.
 */
function forgetClosedSocket(ws: WebSocket, acceptanceToken: object | null): void {
	clients.delete(ws);
	const closingId = clientIds.get(ws);
	clientIds.delete(ws);
	const closingCodexInstance = codexSocketInstances.get(ws);
	codexSocketInstances.delete(ws);
	if (closingId === undefined) {
		syncLockWatch();
		logger.info("WebSocket connection closed");
		return;
	}
	if (latestSocketAcceptanceByClient.get(closingId) === acceptanceToken) {
		latestSocketAcceptanceByClient.delete(closingId);
	}
	if (closingCodexInstance !== undefined) {
		void codexWiring.codex
			.closeBrowser?.(closingCodexInstance, closingId)
			.catch((error) => logger.error("Codex browser cleanup failed:", error));
	}
	if (currentSocketsByClient.get(closingId) !== ws) {
		syncLockWatch();
		logger.info(`Replaced WebSocket connection closed (client ${closingId})`);
		return;
	}
	retirePaneOwner(closingId);
	syncLockWatch();
	logger.info("WebSocket connection closed");
}

/**
 * Tell a pane which board it is on.
 *
 * The whole of what a semantic pane needs to start: the board is a file the
 * server reads and draws, so the pane is named a board rather than handed one
 * (ADR 0023). The picture is a separate read the pane makes for itself.
 *
 * Sent even when there is no board to name, because "there is nothing here
 * yet" is news a pane has to be told rather than infer from silence — an empty
 * vault would otherwise be indistinguishable from a socket that never
 * finished, both on screen and to anything waiting on this message.
 *
 * Waited on, and that is the point: a socket takes its pane's authority only
 * after this has actually reached the wire. A send that failed would otherwise
 * leave a transport owning a pane it can say nothing to, having retired the
 * live one it replaced.
 * @param ws The socket.
 * @param startingKey The board key, or null when the vault holds no board.
 * @returns Resolves once the socket has taken the message.
 */
function sendStartingBoard(ws: WebSocket, startingKey: string | null): Promise<void> {
	const message: WebSocketMessage = {
		type: "pane_board",
		...(startingKey === null
			? { board: null, identity: null }
			: { board: startingKey, identity: parseBoardKey(startingKey) }),
	};
	return new Promise<void>((resolve, reject) => {
		try {
			ws.send(JSON.stringify(message), (error) => (error ? reject(error) : resolve()));
		} catch (error) {
			reject(error instanceof Error ? error : new Error(String(error)));
		}
	});
}

/**
 * Make this socket the one that owns its pane identity, terminating the
 * transport it replaces. A slower predecessor that finished initializing
 * after this one is refused by its stale acceptance token.
 * @param ws The socket.
 * @param clientId The pane's client id.
 * @param acceptanceToken The token this socket's acceptance was stamped with.
 * @param startingKey The board the pane starts on.
 * @returns False when this socket was superseded and has been terminated.
 */
function takePaneAuthority(
	ws: WebSocket,
	clientId: string,
	acceptanceToken: object,
	startingKey: string | null,
): boolean {
	if (latestSocketAcceptanceByClient.get(clientId) !== acceptanceToken) {
		ws.terminate();
		return false;
	}
	const previous = currentSocketsByClient.get(clientId);
	if (startingKey !== null) {
		paneBoards.set(clientId, startingKey);
	}
	currentSocketsByClient.set(clientId, ws);
	if (previous !== undefined && previous !== ws) {
		previous.terminate();
	}
	return true;
}

/**
 * The failure answer to a Codex workbench request that cannot be routed.
 * @param message The request as parsed.
 * @param error Why it cannot be served.
 * @returns The result message.
 */
function codexRefusal(message: Record<string, unknown>, error: string): Record<string, unknown> {
	const requestId = typeof message["requestId"] === "string" ? message["requestId"] : null;
	const action = typeof message["action"] === "string" ? message["action"] : null;
	return { type: "codex_workbench_result", requestId, action, ok: false, error };
}

/**
 * One socket frame as text. ws hands a frame over as a buffer, an array
 * buffer, or the buffers a fragmented message arrived in.
 * @param raw The frame.
 * @returns Its text.
 */
function frameText(raw: RawData): string {
	if (Array.isArray(raw)) {
		return Buffer.concat(raw).toString("utf8");
	}
	return Buffer.from(raw instanceof ArrayBuffer ? new Uint8Array(raw) : raw).toString("utf8");
}

/**
 * Parse one socket frame as a Codex workbench request, ignoring everything else.
 * @param raw The frame.
 * @returns The request, or null when the frame is not one.
 */
function codexRequestOf(raw: RawData): Record<string, unknown> | null {
	let message: unknown;
	try {
		message = JSON.parse(frameText(raw));
	} catch {
		return null;
	}
	return isRecord(message) && message["type"] === "codex_workbench_request" ? message : null;
}

/**
 * Route the socket's Codex workbench requests to the installed workbench,
 * refusing them while there is no workbench or no authoritative identity.
 * @param ws The socket.
 * @param clientId The pane's client id, or null for an anonymous socket.
 * @param codexSocketInstance The socket's Codex connection instance.
 */
function listenForCodexRequests(
	ws: WebSocket,
	clientId: string | null,
	codexSocketInstance: BrowserConnectionInstance,
): void {
	const codexTransport = createCanvasCodexBrowserSocketSend(ws);
	/**
	 * Send one response, logging a transport failure rather than throwing into `ws`.
	 * @param response The response.
	 */
	const send = (response: unknown): void => {
		void codexTransport
			.send(response)
			.catch((error) => logger.error("Codex browser response send failed:", error));
	};
	ws.on("message", (raw) => {
		const message = codexRequestOf(raw);
		if (message === null) {
			return;
		}
		if (clientId === null) {
			send(
				codexRefusal(
					message,
					"The Codex workbench requires an authoritative browser connection identity.",
				),
			);
			return;
		}
		const handle = codexWiring.codex.handleBrowserMessage;
		if (handle === null) {
			send(codexRefusal(message, "The Codex workbench is unavailable."));
			return;
		}
		void handle(codexSocketInstance, clientId, message, codexTransport.send).catch((error) =>
			logger.error("Codex browser request failed:", error),
		);
	});
}

/**
 * Tell a freshly admitted pane what it needs to know beyond its board: where
 * that board's lock stands, and which boards an agent has across the vault.
 * @param ws The socket.
 * @param clientId The pane's client id, or null for an anonymous socket.
 * @param startingKey The board the pane starts on, or null when it starts on none.
 */
function announceToNewPane(
	ws: WebSocket,
	clientId: string | null,
	startingKey: string | null,
): void {
	// Where its lock stands. A broadcast only reaches panes that were already
	// connected, so a tab that has just arrived — or come back from a dropped
	// socket — is told outright rather than left assuming the board is free.
	if (clientId !== null && startingKey !== null) {
		tellPaneAboutLock(clientId, startingKey);
	}
	// And which boards an agent has right now, across the whole vault (ADR
	// 0022): the same reasoning, for the navigator rather than the pane.
	ws.send(JSON.stringify(agentActivity.snapshot()));
}

/** What one accepted socket is registered as, before it is presented anything. */
interface RegisteredSocket {
	/** The pane it presents, or null for a socket that named none. */
	clientId: string | null;
	/** The token this acceptance is stamped with, so a predecessor cannot take authority back. */
	acceptanceToken: object | null;
	/** Its Codex browser connection instance. */
	codexInstance: BrowserConnectionInstance;
}

/**
 * Register one accepted socket and attach the listeners that retire it.
 * @param ws The socket.
 * @param req The upgrade request, whose `?clientId=` names the pane.
 * @returns What the socket is registered as.
 */
function registerSocket(ws: WebSocket, req: IncomingMessage): RegisteredSocket {
	const codexInstance = Object.freeze({});
	codexSocketInstances.set(ws, codexInstance);
	const clientId = new URL(req.url ?? "/", "http://localhost").searchParams.get("clientId");
	const acceptanceToken = clientId === null ? null : Object.freeze({});
	if (clientId !== null && acceptanceToken !== null) {
		clientIds.set(ws, clientId);
		latestSocketAcceptanceByClient.set(clientId, acceptanceToken);
	}
	ws.on("close", () => forgetClosedSocket(ws, acceptanceToken));
	ws.on("error", (error) => {
		logger.error("WebSocket error:", error);
		clients.delete(ws);
	});
	return { clientId, acceptanceToken, codexInstance };
}

/**
 * Take pane authority and admit the socket to broadcasts.
 *
 * Called only once the pane has been told which board it is on, so a socket
 * whose opening message never landed does not retire the live transport it was
 * replacing and then sit there owning a pane it cannot speak to.
 * @param ws The socket.
 * @param socket What it is registered as.
 * @param startingKey The board it starts on.
 * @returns False when a later socket had already taken this pane's authority.
 */
function admitSocket(ws: WebSocket, socket: RegisteredSocket, startingKey: string | null): boolean {
	const { clientId, acceptanceToken } = socket;
	if (clientId === null || acceptanceToken === null) {
		clients.add(ws);
		return true;
	}
	if (!takePaneAuthority(ws, clientId, acceptanceToken, startingKey)) {
		return false;
	}
	clients.add(ws);
	try {
		codexWiring.codex.acceptBrowser?.(socket.codexInstance, clientId);
	} catch (error) {
		logger.error("Codex browser acceptance failed:", error);
	}
	return true;
}

/**
 * Own one accepted socket for its whole life: register it, present its
 * opening scene, transfer pane authority to it, admit it to broadcasts and
 * route its Codex requests. Creating and closing the server itself belongs to
 * startWebSocketServer and closeWebSocketServer; this owns one socket only.
 * @param ws The accepted socket.
 * @param req The upgrade request, whose `?clientId=` names the pane.
 */
async function acceptWebSocketConnection(ws: WebSocket, req: IncomingMessage): Promise<void> {
	const socket = registerSocket(ws, req);
	// Which board this pane gets, and it is a board *for this pane* — not "the"
	// board, which no longer exists as a single thing. A pane that has been here
	// before (a dropped socket, not a new tab) resumes what it was holding,
	// because a reconnect must not undo a user's scene arrangement.
	const startingKey = socket.clientId === null ? null : boardForNewPane(socket.clientId);
	await sendStartingBoard(ws, startingKey);
	if (ws.readyState !== WebSocket.OPEN || !admitSocket(ws, socket, startingKey)) {
		return;
	}
	// There is a screen again, so the lock files of what is on it are worth
	// reading (ADR 0016).
	syncLockWatch();
	logger.info(
		`New WebSocket connection established${socket.clientId === null ? "" : ` (client ${socket.clientId})`}`,
	);
	announceToNewPane(ws, socket.clientId, startingKey);
	listenForCodexRequests(ws, socket.clientId, socket.codexInstance);
}

let wss: WebSocketServer | null = null;

/**
 * Install the WebSocket server over the HTTP server and start accepting panes.
 */
function startWebSocketServer(): void {
	if (wss !== null) {
		throw new Error("The WebSocket server is already installed.");
	}
	const owner = new WebSocketServer({ server });
	owner.on("connection", (socket, request) => {
		acceptedSockets.add(socket);
		socket.once("close", () => acceptedSockets.delete(socket));
		void acceptWebSocketConnection(socket, request).catch((error) => {
			logger.error("WebSocket pane acceptance failed:", error);
			socket.terminate();
		});
	});
	wss = owner;
}

/**
 * Close the WebSocket server, if one is installed.
 * @returns Resolves once it has closed.
 */
function closeWebSocketServer(): Promise<void> {
	const owner = wss;
	if (owner === null) {
		return Promise.resolve();
	}
	return new Promise((resolve, reject) => {
		owner.close((error) => {
			if (error) {
				reject(error);
				return;
			}
			owner.removeAllListeners();
			if (wss === owner) {
				wss = null;
			}
			resolve();
		});
	});
}

export { closeWebSocketServer, startWebSocketServer };
