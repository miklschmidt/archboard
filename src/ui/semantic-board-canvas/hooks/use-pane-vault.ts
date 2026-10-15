import { use } from "react";

import { PaneVaultContext } from "@/ui/semantic-board-canvas/lib/pane-vault";

/**
 * The vault of the pane this reader is drawn in.
 * @returns The vault, as the server names it.
 * @throws {Error} Outside a pane, where no read can say which vault it means.
 */
function usePaneVault(): string {
	const vault = use(PaneVaultContext);
	if (vault === null) {
		throw new Error("A board reader was drawn outside a pane, so it cannot name a vault.");
	}
	return vault;
}

export { usePaneVault };
