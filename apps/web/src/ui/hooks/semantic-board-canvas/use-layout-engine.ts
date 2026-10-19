// The layout engine this browser draws with, as React state.

import { useSyncExternalStore } from "react";

import type { LayoutEngineName } from "@archboard/board/render-reply";
import {
	layoutEngineNow,
	onLayoutEngineChange,
} from "#ui/clients/semantic-board-canvas/reads/layout-engine.ts";

/**
 * The engine pictures are drawn with, redrawing whoever reads it when it changes.
 * @returns The engine.
 */
function useLayoutEngine(): LayoutEngineName {
	return useSyncExternalStore(onLayoutEngineChange, layoutEngineNow, layoutEngineNow);
}

export { useLayoutEngine };
