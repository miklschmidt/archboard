// The layout engine this browser draws with, as React state.

import { useSyncExternalStore } from "react";

import type { LayoutEngineName } from "@archboard/board/render-reply";
import {
	layoutEngineNow,
	onLayoutEngineChange,
} from "@/ui/semantic-board-canvas/lib/layout-engine";

/**
 * The engine pictures are drawn with, redrawing whoever reads it when it changes.
 * @returns The engine.
 */
function useLayoutEngine(): LayoutEngineName {
	return useSyncExternalStore(onLayoutEngineChange, layoutEngineNow, layoutEngineNow);
}

export { useLayoutEngine };
