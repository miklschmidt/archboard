// Which vault a pane is in, when that changes (ADR 0050). A pane is in one
// vault at a time, and the server moves it: a show of another repository's
// board, or a new chosen checkout of the repository it shows. News about the
// machine rather than one vault goes to every tab.

import { WebSocket } from "ws";
import { logger } from "@/runtime/engine/logger";
import type { WebSocketMessage } from "@/runtime/engine/types";
import {
	clientIds,
	clients,
	paneVaults,
	panes,
	socketVaults,
	syncLockWatch,
} from "@/server/archboard/lib/pane-registry";

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
 * registration says the new vault until the pane next reports.
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
	syncLockWatch();
}

export { broadcastEverywhere, movePaneVault };
