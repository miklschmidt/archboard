import { agentActivity } from "#server/wiring/server-owners.ts";
import type { IncomingMessage } from "http";
import { WebSocket, WebSocketServer } from "ws";
import { checkBrowserCsrf } from "@archboard/code-opener/browser-origin";
import type { RawData } from "ws";
import { logger } from "@archboard/diagnostics/logger";
import type { WebSocketMessage } from "@archboard/server-lifecycle/pane-messages";
import { parsePaneKey } from "@archboard/model/legacy-address";
import {
	createServerCodexBrowserSocketSend,
	parseTabSessionId,
} from "@archboard/codex-realtime-voice/server";
import { handleCodexBrowserMessage } from "@archboard/workbench/server";

import {
	isArchitectureFeed,
	serveArchitectureFeed,
} from "#server/panes/connections/sockets/architecture-feed.ts";
import { frameText } from "#server/panes/connections/sockets/frame-text.ts";
import { server } from "#server/http/listener/wiring/server-app.ts";
import {
	admitSocket,
	paneKeyForNewPane,
	paneVaultOf,
	registerSocket,
	trackAcceptedSocket,
	type RegisteredSocket,
} from "@archboard/workbench/panes";
import { isRecord, namedVault, vaultOfUpgrade } from "@archboard/workbench/host";
import { repositoryOfVault } from "@archboard/workspace/repository-listing";

/**
 * Tell a pane which model it is on.
 *
 * The whole of what a semantic pane needs to start: the model is a file the
 * server reads and draws, so the pane is named a model rather than handed one
 * (ADR 0023). The picture is a separate read the pane makes for itself.
 *
 * Sent even when there is no model to name, because "there is nothing here
 * yet" is news a pane has to be told rather than infer from silence — an empty
 * vault would otherwise be indistinguishable from a socket that never
 * finished, both on screen and to anything waiting on this message.
 *
 * Waited on, and that is the point: a socket takes its pane's authority only
 * after this has actually reached the wire. A send that failed would otherwise
 * leave a transport owning a pane it can say nothing to, having retired the
 * live one it replaced.
 * @param ws The socket.
 * @param startingKey The model key, or null when the vault holds no model.
 * @param vault The vault the pane is in, with the name the navigator lists it under.
 * @returns Resolves once the socket has taken the message.
 */
function sendStartingPlace(
	ws: WebSocket,
	startingKey: string | null,
	vault: string,
): Promise<void> {
	const message: WebSocketMessage = {
		type: "pane_place",
		vault,
		repository: repositoryOfVault(vault),
		...(startingKey === null
			? { paneKey: null, identity: null }
			: { paneKey: startingKey, identity: parsePaneKey(startingKey) }),
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
 * @param socket What it is registered as: its pane, its tab and its Codex connection instance.
 */
function listenForCodexRequests(ws: WebSocket, socket: RegisteredSocket): void {
	const { clientId, tabSessionId, codexInstance: codexSocketInstance } = socket;
	const codexTransport = createServerCodexBrowserSocketSend(ws);
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
		if (tabSessionId === null) {
			send(codexRefusal(message, "The Codex workbench requires the browser tab session identity."));
			return;
		}
		const handling = handleCodexBrowserMessage(
			codexSocketInstance,
			clientId,
			message,
			codexTransport.send,
		);
		if (handling === null) {
			send(codexRefusal(message, "The Codex workbench is unavailable."));
			return;
		}
		void handling.catch((error) => logger.error("Codex browser request failed:", error));
	});
}

/**
 * Own one accepted socket for its whole life: register it, present its
 * opening scene, transfer pane authority to it, admit it to broadcasts and
 * route its Codex requests. Creating and closing the server itself belongs to
 * startWebSocketServer and closeWebSocketServer; this owns one socket only.
 * @param ws The accepted socket.
 * @param req The upgrade request, whose `?clientId=` names the pane, `?tabSession=` its tab and
 *   `?vault=` its vault.
 * @param named The vault the upgrade named, already checked.
 */
async function acceptWebSocketConnection(
	ws: WebSocket,
	req: IncomingMessage,
	named: string,
): Promise<void> {
	const vault = vaultOfReturningPane(req, named);
	const query = new URL(req.url ?? "/", "http://localhost").searchParams;
	const socket = registerSocket(ws, {
		vault,
		clientId: query.get("clientId"),
		tabSessionId: parseTabSessionId(query.get("tabSession")),
	});
	// Which model this pane gets, and it is a model *for this pane* — not "the"
	// model, which no longer exists as a single thing. A pane that has been here
	// before (a dropped socket, not a new tab) resumes what it was holding,
	// because a reconnect must not undo a user's scene arrangement.
	const startingKey = startingPaneKey(req, socket.clientId, vault);
	await sendStartingPlace(ws, startingKey, vault);
	if (ws.readyState !== WebSocket.OPEN || !admitSocket(ws, socket, startingKey)) {
		return;
	}
	ws.once("close", agentActivity.hold(vault));
	for (const snapshot of agentActivity.snapshots()) ws.send(JSON.stringify(snapshot));
	// There is a screen again, so the lock files of what is on it are worth
	// reading.
	logger.info(
		`New WebSocket connection established${socket.clientId === null ? "" : ` (client ${socket.clientId})`}`,
	);
	listenForCodexRequests(ws, socket);
}

/**
 * Canonical panes keep their own reading instead of inheriting a legacy board.
 * @param req The socket address and explicit reading mode.
 * @param clientId The admitted pane identity.
 * @param vault The pane's source vault.
 * @returns The legacy starting key, or no legacy reading.
 */
function startingPaneKey(
	req: IncomingMessage,
	clientId: string | null,
	vault: string,
): string | null {
	const canonical =
		new URL(req.url ?? "/", "http://localhost").searchParams.get("reading") === "canonical";
	return clientId === null || canonical ? null : paneKeyForNewPane(clientId, vault);
}

/**
 * The vault a pane's socket is in. The server moves a pane between vaults
 * (ADR 0050), and a pane whose socket was down when it was moved never heard,
 * so it comes back naming the vault it was in before. It goes back where the
 * server last put it, while that vault can still be read, and its first
 * message says so.
 * @param req The upgrade request, whose `?clientId=` names the pane.
 * @param named The vault the upgrade named, already checked.
 * @returns The vault the socket is in.
 */
function vaultOfReturningPane(req: IncomingMessage, named: string): string {
	const clientId = new URL(req.url ?? "/", "http://localhost").searchParams.get("clientId");
	const held = clientId === null ? undefined : paneVaultOf(clientId);
	if (held === undefined || held === named) {
		return named;
	}
	const readable = namedVault(held);
	return readable.ok ? readable.vault : named;
}

let wss: WebSocketServer | null = null;

/** The vault each upgrade named, checked when the upgrade was admitted. */
const upgradeVaults = new WeakMap<IncomingMessage, string>();

/**
 * Install the WebSocket server over the HTTP server and start accepting panes.
 */
function startWebSocketServer(): void {
	if (wss !== null) {
		throw new Error("The WebSocket server is already installed.");
	}
	const owner = new WebSocketServer({
		server,
		/**
		 * Refuse foreign pages before a socket can own a pane or a Codex session.
		 * @param info The HTTP upgrade request.
		 * @param done Answers the upgrade with the same origin policy as HTTP routes.
		 */
		verifyClient: (info, done) => {
			const { host, origin, referer } = info.req.headers;
			const secFetchSite = info.req.headers["sec-fetch-site"];
			const result = checkBrowserCsrf("request", {
				host,
				origin,
				referer,
				secFetchSite: Array.isArray(secFetchSite) ? secFetchSite.join(",") : secFetchSite,
			});
			if (!result.ok) {
				done(false, 403, result.code);
				return;
			}
			if (isArchitectureFeed(info.req)) {
				done(true);
				return;
			}
			// A pane belongs to one vault from its first message (ADR 0049), so a socket
			// that names none is turned away before it can own a pane.
			const vault = vaultOfUpgrade(info.req.url);
			if (!vault.ok) {
				done(false, vault.refusal.status, `${vault.refusal.code}: ${vault.refusal.error}`);
				return;
			}
			upgradeVaults.set(info.req, vault.vault);
			done(true);
		},
	});
	owner.on("connection", (socket, request) => {
		trackAcceptedSocket(socket);
		// A socket error with no listener would end the whole server, whichever socket it hit.
		socket.on("error", (error) => {
			logger.error("WebSocket error:", error);
			socket.terminate();
		});
		if (isArchitectureFeed(request)) {
			serveArchitectureFeed(socket);
			return;
		}
		const vault = upgradeVaults.get(request);
		if (vault === undefined) {
			socket.terminate();
			return;
		}
		void acceptWebSocketConnection(socket, request, vault).catch((error) => {
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
