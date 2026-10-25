// Which vault a pane is in, when that changes (ADR 0050). A pane is in one
// vault at a time, and the server moves it: a show of another repository's
// board, or a new chosen checkout of the repository it shows. News about the
// machine rather than one vault goes to every tab.

import { WebSocket } from "ws";
import { logger } from "@archboard/diagnostics/logger";
import type { WebSocketMessage } from "@archboard/server-lifecycle/panes";
import {
	clientIds,
	clients,
	paneVaults,
	panes,
	socketVaults,
	syncLockWatch,
	forgetSemanticPaneContext,
} from "@archboard/workbench/panes";

/**
 * Broadcast something to every admitted client of every vault: news about the
 * machine rather than about one vault, such as a repository's chosen checkout,
 * or a vault's account of agent work, which names its vault (ADR 0022).
 * @param message The boardless message.
 */
function broadcastEverywhere(message: WebSocketMessage): void {
	const data = JSON.stringify(message);
	clients.forEach((client) => {
		try {
			if (client.readyState === WebSocket.OPEN) {
				client.send(data);
			}
		} catch {
			logger.warn("Failed to send to client, removing");
			clients.delete(client);
		}
	});
}

/**
 * Move a pane into another vault (ADR 0050). The server decides which vault a
 * pane is in, as it decides which board it holds: a show into another
 * repository moves it, and so does choosing another checkout of the repository
 * it shows. Its sockets carry the news of the new vault from now on, and its
 * registration says the new vault until the pane next reports. What it said it
 * was reading is of the vault it left, so it is forgotten. The conversation its tab's agent dock
 * shows stays as it is: only the person's own act in the browser changes that (ADR 0050).
 * @param clientId The pane's client id.
 * @param vault The vault it moves into.
 */
function movePaneVault(clientId: string, vault: string): void {
	if (paneVaults.get(clientId) === vault) {
		return;
	}
	paneVaults.set(clientId, vault);
	clientIds.forEach((id, socket) => {
		if (id === clientId) {
			socketVaults.set(socket, vault);
		}
	});
	const registration = panes.get(clientId);
	if (registration !== undefined) {
		panes.set(clientId, { ...registration, vault });
	}
	forgetSemanticPaneContext(clientId);
	syncLockWatch();
}

/**
 * The panes in one vault, by client id, whether or not their socket is open now.
 * @param vault The vault.
 * @returns Their client ids.
 */
function paneClientsOfVault(vault: string): string[] {
	return [...paneVaults].flatMap(([clientId, held]) => (held === vault ? [clientId] : []));
}

export { broadcastEverywhere, movePaneVault, paneClientsOfVault };
