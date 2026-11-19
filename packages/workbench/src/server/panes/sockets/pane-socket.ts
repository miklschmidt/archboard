// One pane's socket, for its whole life: registered, told which model it is on, given the pane's
// authority, admitted to broadcasts and heard for its Codex requests. The server owns the
// listener and admits the upgrade; this owns what happens on the socket after that.

import type { IncomingMessage } from "http";
import { WebSocket, type RawData } from "ws";
import { logger } from "@archboard/diagnostics/logger";
import { parsePaneKey } from "@archboard/model-contract";
import {
	createServerCodexBrowserSocketSend,
	parseTabSessionId,
} from "@archboard/codex-realtime-voice/server";
import { repositoryOfVault } from "@archboard/workspace/repository-listing";

import type { WebSocketMessage } from "#shared/protocol/pane-messages.ts";
import { agentActivity } from "#server/panes/services/agent-activity.ts";
import {
	admitSocket,
	registerSocket,
	type RegisteredSocket,
} from "#server/panes/services/pane-sockets.ts";
import { paneKeyForNewPane, paneVaultOf } from "#server/panes/services/registry.ts";
import { isRecord } from "#server/request/services/request-fields.ts";
import { resolveVault } from "@archboard/server-requests/server";
import { handleCodexBrowserMessage } from "#server/workbench-host/services/wiring-hooks.ts";

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
			.catch((error) => logger().error("Codex browser response send failed:", error));
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
		void handling.catch((error) => logger().error("Codex browser request failed:", error));
	});
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
	const readable = resolveVault(held);
	return readable.ok ? readable.vault : named;
}

/**
 * Own one accepted pane socket for its whole life: register it, present its
 * opening scene, transfer pane authority to it, admit it to broadcasts, hold its
 * vault's model activity open and route its Codex requests.
 * @param ws The accepted socket.
 * @param req The upgrade request, whose `?clientId=` names the pane, `?tabSession=` its tab and
 *   `?vault=` its vault.
 * @param named The vault the upgrade named, already checked.
 * @returns Resolves once the socket is admitted, or has been turned away.
 */
async function acceptPaneSocket(ws: WebSocket, req: IncomingMessage, named: string): Promise<void> {
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
	logger().info(
		`New WebSocket connection established${socket.clientId === null ? "" : ` (client ${socket.clientId})`}`,
	);
	listenForCodexRequests(ws, socket);
}

export { acceptPaneSocket };
