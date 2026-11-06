import { useContext } from "react";
import {
	PaneChromeContext,
	type PaneChrome,
} from "#ui/architecture-drawing/canvas/presentation/components/PaneChrome.tsx";

/**
 * The shell's parts of the header of the pane being drawn.
 * @returns The letter, the controls and the notice.
 */
function usePaneChrome(): PaneChrome {
	return useContext(PaneChromeContext);
}

export { usePaneChrome };
