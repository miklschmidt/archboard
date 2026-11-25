import { forgetSemanticPaneContext } from "#server/panes/services/context.ts";
import { clientIds, paneVaults, panes, socketVaults } from "#server/panes/services/registry.ts";

/**
 * Move a pane into another vault (ADR 0050). The server decides which vault a
 * pane is in, as it decides which model it holds: a show into another
 * repository moves it, and so does choosing another checkout of the repository
 * it shows. Its sockets carry the news of the new vault from now on, and its
 * registration says the new vault until the pane next reports. What it said it
 * was reading is of the vault it left, so it is forgotten. The conversation its tab's agent dock
 * shows stays as it is: only the person's own act in the browser changes that.
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
}

export { movePaneVault };
