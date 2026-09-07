import type { IncomingMessage } from "http";
import { WebSocket, WebSocketServer } from "ws";
import logger from "@/runtime/engine/logger";
import { selectionState } from "@/runtime/engine/types";
import type { ExcalidrawFile, InitialElementsMessage, WebSocketMessage } from "@/runtime/engine/types";
import { boards, SCRATCH_KEY } from "@/runtime/engine/board-store";
import type { BoardState } from "@/runtime/engine/board-store";
import { boardFilesMessage, emptyContent, readBoardContent } from "@/runtime/engine/board-io";
import type { BoardContent } from "@/runtime/engine/board-io";
import { releaseHold } from "@/runtime/engine/board-lock";
import type { BoardIdentity } from "@/runtime/engine/board";
import { codeBindingsOf, presentElements } from "@/runtime/engine/presentation";
import { snapshotCheckoutAccess, type CheckoutSnapshot } from "@/runtime/code-target";
import type { RenderGeometryError } from "@/runtime/engine/geometry";
import type { NativeElementValidationError } from "@/runtime/engine/native-element";
import { createCanvasCodexBrowserSocketSend } from "@/server/canvas/codex-workbench-browser";
import type { BrowserConnectionInstance } from "@/server/canvas/codex-workbench-browser";
import {
	agentActivity,
	isUnrenderableNote,
	tellPaneAboutLock,
} from "@/server/canvas/lib/board-announcements";
import { server } from "@/server/canvas/lib/canvas-app";
import { codexWiring } from "@/server/canvas/lib/canvas-codex-host";
import { checkoutWork } from "@/server/canvas/lib/canvas-owners";
import {
	acceptedSockets,
	boardForNewPane,
	broadcastSelection,
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

/** The scene a pane starts on, or the refusal that stands in for it. */
interface StartingScene {
	content: BoardContent;
	renderError: RenderGeometryError | NativeElementValidationError | null;
}

/**
 * Read a board's note for a pane, or start with no scene when the note is
 * present but malformed: nothing of it is sent to Excalidraw, the refusal goes
 * on screen and the note stays untouched.
 * @param board The board.
 * @returns The content and any render refusal.
 */
function readStartingScene(board: BoardState): StartingScene {
	try {
		return { content: readBoardContent(board), renderError: null };
	} catch (error) {
		if (!isUnrenderableNote(error)) {
			throw error;
		}
		return { content: emptyContent(), renderError: error };
	}
}

/**
 * Retire the client-id keyed state of a socket that owned its pane identity:
 * selection, hold, registration and any layout request waiting on it.
 * @param closingId The pane's client id.
 */
function retirePaneOwner(closingId: string): void {
	currentSocketsByClient.delete(closingId);
	selectionState.byClient.delete(closingId);
	const held = paneBoards.get(closingId);
	if (held) {
		releaseHold(held, closingId);
	}
	panes.delete(closingId);
	notePaneClosed(closingId);
	if (selectionState.current?.clientId === closingId) {
		selectionState.current = null;
		broadcastSelection();
		logger.info(`Selection cleared: owning client ${closingId} disconnected`);
	}
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
 * Capture the checkout snapshot for a pane's opening scene, re-reading the
 * board until its binding set is stable across the async capture. Reads and
 * broadcasts share this event loop, so once the bindings are stable the read,
 * send, authority transfer and broadcast admission form one synchronous
 * sequence with no lost delta.
 * @param ws The socket, checked for closure between captures.
 * @param board The board.
 * @param first The scene read before the first capture.
 * @param signal Aborts the capture when the socket closes.
 * @returns The stable scene and its snapshot, or null when the socket closed.
 */
async function presentableScene(
	ws: WebSocket,
	board: BoardState,
	first: StartingScene,
	signal: AbortSignal,
): Promise<{ scene: StartingScene; checkoutSnapshot: CheckoutSnapshot } | null> {
	let scene = first;
	let bindings = codeBindingsOf(scene.content.elements.values());
	for (;;) {
		// oxlint-disable-next-line eslint(no-await-in-loop) -- each capture must cover the bindings the previous read found
		const checkoutSnapshot = await checkoutWork.track(
			"WebSocket checkout presentation",
			signal,
			(ownedSignal) => snapshotCheckoutAccess({ signal: ownedSignal, bindings }),
		);
		if (ws.readyState !== WebSocket.OPEN) {
			return null;
		}
		scene = readStartingScene(board);
		const refreshedBindings = codeBindingsOf(scene.content.elements.values());
		if (JSON.stringify(refreshedBindings) === JSON.stringify(bindings)) {
			return { scene, checkoutSnapshot };
		}
		bindings = refreshedBindings;
	}
}

/**
 * Send a pane its whole opening scene and wait for the socket to take it.
 * @param ws The socket.
 * @param startingKey The board key.
 * @param board The board.
 * @param content Its content.
 * @param checkoutSnapshot The snapshot the presentation overlays.
 */
function sendInitialScene(
	ws: WebSocket,
	startingKey: string,
	board: BoardState,
	content: BoardContent,
	checkoutSnapshot: CheckoutSnapshot,
): Promise<void> {
	const initialMessage: InitialElementsMessage & {
		files?: Record<string, ExcalidrawFile>;
		identity: BoardIdentity;
	} = {
		type: "initial_elements",
		board: startingKey,
		identity: board.identity,
		elements: presentElements(content.elements.values(), { boardKey: startingKey, checkoutSnapshot }),
		// The version the pane states on its first write (ADR 0022).
		version: content.version ?? null,
		...boardFilesMessage(content),
	};
	return new Promise<void>((resolve, reject) => {
		try {
			ws.send(JSON.stringify(initialMessage), (error) => (error ? reject(error) : resolve()));
		} catch (error) {
			reject(error);
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
	startingKey: string,
): boolean {
	if (latestSocketAcceptanceByClient.get(clientId) !== acceptanceToken) {
		ws.terminate();
		return false;
	}
	const previous = currentSocketsByClient.get(clientId);
	paneBoards.set(clientId, startingKey);
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
 * Parse one socket frame as a Codex workbench request, ignoring everything else.
 * @param raw The frame.
 * @returns The request, or null when the frame is not one.
 */
function codexRequestOf(raw: { toString(): string }): Record<string, unknown> | null {
	let message: unknown;
	try {
		message = JSON.parse(raw.toString());
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
 * Tell a freshly admitted pane what it needs to know beyond its scene: a
 * malformed note's refusal, where its board's lock stands, and which boards
 * an agent has across the vault.
 * @param ws The socket.
 * @param clientId The pane's client id, or null for an anonymous socket.
 * @param startingKey The board the pane starts on.
 * @param board The board.
 * @param renderError The note's render refusal, if any.
 */
function announceToNewPane(
	ws: WebSocket,
	clientId: string | null,
	startingKey: string,
	board: BoardState,
	renderError: StartingScene["renderError"],
): void {
	if (renderError) {
		ws.send(
			JSON.stringify({
				type: "board_error",
				board: startingKey,
				error:
					`Could not open "${startingKey}" from ${board.file}. ${renderError.message} ` +
					`The note was left unchanged. Correct it, then run \`browser show ${startingKey} --pane <spec> --reload\`.`,
			} satisfies WebSocketMessage),
		);
	}
	// And where its lock stands. A broadcast only reaches panes that were already
	// connected, so a tab that has just arrived — or come back from a dropped
	// socket — is told outright rather than left assuming the board is free.
	if (clientId !== null) {
		tellPaneAboutLock(clientId, startingKey);
	}
	// And which boards an agent has right now, across the whole vault (ADR
	// 0022): the same reasoning, for the navigator rather than the pane.
	ws.send(JSON.stringify(agentActivity.snapshot()));
}

/**
 * Own one accepted socket for its whole life: register it, present its
 * opening scene, transfer pane authority to it, admit it to broadcasts and
 * route its Codex requests. The lifecycle creates and closes the server.
 * @param ws The accepted socket.
 * @param req The upgrade request, whose `?clientId=` names the pane.
 */
async function acceptWebSocketConnection(ws: WebSocket, req: IncomingMessage): Promise<void> {
	const codexSocketInstance = Object.freeze({});
	codexSocketInstances.set(ws, codexSocketInstance);
	const clientId = new URL(req.url ?? "/", "http://localhost").searchParams.get("clientId");
	const acceptanceToken = clientId === null ? null : Object.freeze({});
	if (clientId !== null && acceptanceToken !== null) {
		clientIds.set(ws, clientId);
		latestSocketAcceptanceByClient.set(clientId, acceptanceToken);
	}
	const checkoutController = new AbortController();
	ws.on("close", () => {
		checkoutController.abort(new Error("WebSocket closed during checkout presentation."));
		forgetClosedSocket(ws, acceptanceToken);
	});
	ws.on("error", (error) => {
		checkoutController.abort(error);
		logger.error("WebSocket error:", error);
		clients.delete(ws);
	});
	// Which board this pane gets, and it is a board *for this pane* — not "the"
	// board, which no longer exists as a single thing. A pane that has been here
	// before (a dropped socket, not a new tab) resumes what it was holding,
	// because a reconnect must not undo a user's scene arrangement.
	const startingKey = clientId === null ? SCRATCH_KEY : boardForNewPane(clientId);
	const board = boards.get(startingKey);
	if (board === undefined) {
		throw new Error(`Board "${startingKey}" is not open`);
	}
	// Read out of the note, like everything else that sends a pane a whole board.
	// Scratch is registered before the listener binds.
	const presentable = await presentableScene(
		ws,
		board,
		readStartingScene(board),
		checkoutController.signal,
	);
	if (presentable === null) {
		return;
	}
	const { scene, checkoutSnapshot } = presentable;
	await sendInitialScene(ws, startingKey, board, scene.content, checkoutSnapshot);
	if (ws.readyState !== WebSocket.OPEN) {
		return;
	}
	if (
		clientId !== null &&
		acceptanceToken !== null &&
		!takePaneAuthority(ws, clientId, acceptanceToken, startingKey)
	) {
		return;
	}
	// Ownership is registered before the checkout await, but content admission
	// begins only after the initial scene is on the wire. A concurrent delta can
	// therefore never overtake initialization and then be replaced by it.
	clients.add(ws);
	if (clientId !== null) {
		try {
			codexWiring.codex.acceptBrowser?.(codexSocketInstance, clientId);
		} catch (error) {
			logger.error("Codex browser acceptance failed:", error);
		}
	}
	// There is a screen again, so the lock files of what is on it are worth
	// reading (ADR 0016).
	syncLockWatch();
	logger.info(`New WebSocket connection established${clientId ? ` (client ${clientId})` : ""}`);
	announceToNewPane(ws, clientId, startingKey, board, scene.renderError);
	listenForCodexRequests(ws, clientId, codexSocketInstance);
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
			logger.error("WebSocket checkout presentation failed:", error);
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
