// One pane's socket, for its whole life: registered, told which model it is on, given the pane's
// authority, admitted to broadcasts and heard for its Codex requests. The server owns the
// listener and admits the upgrade; this owns what happens on the socket after that.

import type { IncomingMessage } from "http";
import { WebSocket } from "ws";
import { logger } from "@archboard/diagnostics/logger";
import { parsePaneKey } from "@archboard/model-contract";
import { parseTabSessionId } from "@archboard/codex-realtime-voice/server";
import { placeOfVault } from "@archboard/workspace/vault";

import type { WebSocketMessage } from "#shared/protocol/pane-messages.ts";
import { agentActivity } from "#server/panes/services/agent-activity.ts";
import { admitSocket, registerSocket } from "#server/panes/services/pane-sockets.ts";
import {
	paneKeyForNewPane,
	paneVaultOf,
	voiceConnections,
} from "#server/panes/services/registry.ts";
import { resolveVault } from "@archboard/server-requests/server";

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
		repository: placeOfVault(vault).repository,
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
 * Hand the socket's voice requests to its voice connection, which answers them, a refusal
 * included. Every other frame is the pane's.
 * @param ws The socket.
 */
function listenForCodexRequests(ws: WebSocket): void {
	ws.on("message", (raw) => {
		const connection = voiceConnections.get(ws);
		if (connection === undefined) return;
		// ws hands every frame over as one buffer while nothing changes its binaryType.
		if (!Buffer.isBuffer(raw)) return;
		let frame: unknown;
		try {
			frame = JSON.parse(raw.toString("utf8"));
		} catch {
			return;
		}
		const handling = connection.receive(frame);
		if (handling === false) return;
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
	listenForCodexRequests(ws);
}

export { acceptPaneSocket };
