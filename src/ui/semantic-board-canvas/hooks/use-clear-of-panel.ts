// A part picked out while the sidebar rests is explained in a panel laid over
// the picture's right edge. When that panel would cover the part itself, the
// picture moves left just far enough to show it, once; anywhere else, nothing
// moves.

import { useLayoutEffect, type RefObject } from "react";

import { SIDEBAR_WIDTH } from "@/shared/shell-geometry/index";

/** How far from the panel's edge the part is kept. */
const CLEARANCE = 24;

/**
 * Keep the part picked out clear of the panel laid over the picture.
 * @param picture The picture's area, whose right edge the panel is laid against.
 * @param floating Whether the panel is laid over the picture.
 * @param selection The part picked out, or null.
 * @param panBy Move the picture, in viewport pixels.
 */
function useClearOfPanel(
	picture: RefObject<HTMLElement | null>,
	floating: boolean,
	selection: string | null,
	panBy: (dx: number, dy: number) => void,
): void {
	useLayoutEffect(() => {
		const root = picture.current;
		if (!floating || selection === null || root === null) return;
		const part = root.querySelector(`[data-semantic-id="${CSS.escape(selection)}"]`);
		if (part === null) return;
		const edge = root.getBoundingClientRect().right - SIDEBAR_WIDTH - CLEARANCE;
		const right = part.getBoundingClientRect().right;
		if (right > edge) panBy(edge - right, 0);
	}, [picture, floating, selection, panBy]);
}

export { useClearOfPanel };
