// A subject picked out is explained in a panel laid over the picture's right
// edge. When that panel would cover the subject, the picture glides left just
// far enough to show it, once, in the time the panel takes to arrive; anywhere
// else, nothing moves. A subject wider than the room that the panel leaves keeps
// its left end in view. The stage makes this move and not a hand, so the traffic
// of the picture runs on (use-traffic-rest.ts). Once it lands the camera counts
// as the person's, as after a reveal, so a refit does not put the subject back
// under the panel.

import { useLayoutEffect, type RefObject } from "react";

import { SIDEBAR_MS } from "@archboard/timing";
import type { BoardCamera } from "#ui/hooks/semantic-board-canvas/use-board-camera.ts";
import { panCamera } from "#ui/rules/semantic-board-canvas/camera/camera.ts";

/** How far from the panel's edge the part is kept. */
const CLEARANCE = 24;

/**
 * How far a subject reaches under the panel, past the clearance kept from its edge.
 * @param root The picture's area.
 * @param selection The subject.
 * @param width How wide the panel is.
 * @returns The distance in viewport pixels, or zero when the subject is clear of it or not drawn.
 */
function underPanel(root: HTMLElement, selection: string, width: number): number {
	const part = root.querySelector(`[data-semantic-id="${CSS.escape(selection)}"]`);
	if (part === null) return 0;
	const area = root.getBoundingClientRect();
	const box = part.getBoundingClientRect();
	const under = box.right - (area.right - width - CLEARANCE);
	return Math.max(0, Math.min(under, box.left - area.left - CLEARANCE));
}

/**
 * Keep the subject picked out clear of the panel laid over the picture.
 * @param picture The picture's area, whose right edge the panel is laid against.
 * @param floating Whether the panel is laid over the picture.
 * @param selection The subject picked out, or null.
 * @param camera The camera that moves the picture.
 * @param reducedMotion Whether the person asked for no motion, which lands the camera at once.
 * @param width How wide the panel is, which the picture's area can narrow.
 */
function useClearOfPanel(
	picture: RefObject<HTMLElement | null>,
	floating: boolean,
	selection: string | null,
	camera: Pick<BoardCamera, "view" | "glide">,
	reducedMotion: boolean,
	width: (area: number) => number,
): void {
	const { view, glide } = camera;
	useLayoutEffect(() => {
		const root = picture.current;
		if (!floating || selection === null || root === null) return;
		const under = underPanel(root, selection, width(root.clientWidth));
		if (under > 0) {
			glide(panCamera(view().camera, -under, 0), reducedMotion ? 0 : SIDEBAR_MS.floatIn, true);
		}
	}, [picture, floating, selection, view, glide, reducedMotion, width]);
}

export { useClearOfPanel };
