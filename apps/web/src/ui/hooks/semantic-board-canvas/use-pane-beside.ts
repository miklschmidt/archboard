import { use } from "react";

import {
	PaneBesideContext,
	type VariantBeside,
} from "#ui/state/semantic-board-canvas/pane-beside.ts";

/**
 * What the pane linked to this reader's pane shows.
 * @returns The variant beside, or null while the pane is not linked.
 */
function usePaneBeside(): VariantBeside | null {
	return use(PaneBesideContext);
}

export { usePaneBeside };
