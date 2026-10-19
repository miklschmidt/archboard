// A part picked out while the sidebar rests is explained in a panel laid over
// the picture's right edge. When that panel would cover the part itself, the
// picture glides left just far enough to show it, once, in the time the panel
// takes to arrive; anywhere else, nothing moves. The stage makes this move and
// not a hand, so the traffic of the picture runs on (use-traffic-rest.ts). Once
// it lands the camera counts as the person's, as after a reveal, so a refit does
// not put the part back under the panel.

import { useLayoutEffect, type RefObject } from "react";

import { SIDEBAR_WIDTH } from "@archboard/renderer/shell-geometry";
import { SIDEBAR_MS } from "@archboard/timing";
import type { BoardCamera } from "#ui/hooks/semantic-board-canvas/use-board-camera.ts";
import { panCamera } from "#ui/rules/semantic-board-canvas/camera/camera.ts";

/** How far from the panel's edge the part is kept. */
const CLEARANCE = 24;

/**
 * How far a part reaches under the panel, past the clearance kept from its edge.
 * @param root The picture's area.
 * @param selection The part.
 * @returns The distance in viewport pixels, or zero when the part is clear of it or not drawn.
 */
function underPanel(root: HTMLElement, selection: string): number {
	const part = root.querySelector(`[data-semantic-id="${CSS.escape(selection)}"]`);
	if (part === null) return 0;
	const edge = root.getBoundingClientRect().right - SIDEBAR_WIDTH - CLEARANCE;
	return Math.max(0, part.getBoundingClientRect().right - edge);
}

/**
 * Keep the part picked out clear of the panel laid over the picture.
 * @param picture The picture's area, whose right edge the panel is laid against.
 * @param floating Whether the panel is laid over the picture.
 * @param selection The part picked out, or null.
 * @param camera The camera that moves the picture.
 * @param reducedMotion Whether the person asked for no motion, which lands the camera at once.
 */
function useClearOfPanel(
	picture: RefObject<HTMLElement | null>,
	floating: boolean,
	selection: string | null,
	camera: Pick<BoardCamera, "view" | "glide">,
	reducedMotion: boolean,
): void {
	const { view, glide } = camera;
	useLayoutEffect(() => {
		const root = picture.current;
		if (!floating || selection === null || root === null) return;
		const under = underPanel(root, selection);
		if (under > 0) {
			glide(panCamera(view().camera, -under, 0), reducedMotion ? 0 : SIDEBAR_MS.floatIn, true);
		}
	}, [picture, floating, selection, view, glide, reducedMotion]);
}

export { useClearOfPanel };
