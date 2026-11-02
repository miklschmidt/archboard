// Whether the pointer lights what it rests on, as React state.

import { useSyncExternalStore } from "react";

import {
	hoverLightNow,
	onHoverLightChange,
	type HoverLight,
} from "#ui/clients/canvas/subjects/hover-light.ts";

/**
 * Whether the pointer lights what it rests on, redrawing whoever reads it when it changes.
 * @returns The choice.
 */
function useHoverLight(): HoverLight {
	return useSyncExternalStore(onHoverLightChange, hoverLightNow, hoverLightNow);
}

export { useHoverLight };
