import { useContext } from "react";
import {
	PaneChromeContext,
	type PaneChrome,
} from "#ui/components/semantic-board-canvas/PaneChrome.tsx";

/**
 * The shell's parts of the header of the pane being drawn.
 * @returns The letter, the controls and the notice.
 */
function usePaneChrome(): PaneChrome {
	return useContext(PaneChromeContext);
}

export { usePaneChrome };
