// Bringing a part into view, moving the camera no further than it must.
//
// When a part is picked out from somewhere other than the picture (a row of the
// list, the part search, an agent), it may be out of the pane. The camera then
// moves once, just far enough to show it, and shows the part the reader was on
// with it when the two are wired together, so the relationship between them is in
// view. A part already in view moves nothing. A pick on the picture is never
// brought into view at all: the reader's hand put it there (use-reveal.ts).
//
// Pure, like the rest of the camera.

import type { Camera, Rect, Size } from "#ui/rules/semantic-board-canvas/camera/camera.ts";

/** How far a box may stand outside the viewport and still count as in view, in pixels. */
const IN_VIEW_SLACK = 6;

/** A box in the viewport, in pixels. */
interface Box {
	readonly left: number;
	readonly top: number;
	readonly right: number;
	readonly bottom: number;
}

/**
 * Where a rectangle of the diagram stands in the viewport.
 * @param camera Where the pane is looking.
 * @param rect The rectangle, in diagram units.
 * @returns The box.
 */
function boxOf(camera: Camera, rect: Rect): Box {
	const left = rect.x * camera.scale + camera.x;
	const top = rect.y * camera.scale + camera.y;
	return {
		left,
		top,
		right: left + rect.width * camera.scale,
		bottom: top + rect.height * camera.scale,
	};
}

/**
 * The one box that holds all of them.
 * @param boxes The boxes, at least one.
 * @returns The box around them.
 */
function around(boxes: readonly Box[]): Box {
	return {
		left: Math.min(...boxes.map((box) => box.left)),
		top: Math.min(...boxes.map((box) => box.top)),
		right: Math.max(...boxes.map((box) => box.right)),
		bottom: Math.max(...boxes.map((box) => box.bottom)),
	};
}

/**
 * Whether a box stands in the viewport, give or take a little.
 * @param box The box.
 * @param room How big the viewport is.
 * @returns True when it does.
 */
function inView(box: Box, room: Size): boolean {
	return (
		box.left >= -IN_VIEW_SLACK &&
		box.top >= -IN_VIEW_SLACK &&
		box.right <= room.width + IN_VIEW_SLACK &&
		box.bottom <= room.height + IN_VIEW_SLACK
	);
}

/**
 * How far to move so that a span stands inside an area, as little as possible.
 * @param from Where the span starts.
 * @param to Where it ends.
 * @param low Where the area starts.
 * @param high Where it ends.
 * @returns The move; a span longer than the area is centred in it.
 */
function shiftInto(from: number, to: number, low: number, high: number): number {
	if (to - from > high - low) {
		return (low + high) / 2 - (from + to) / 2;
	}
	if (from < low) {
		return low - from;
	}
	return to > high ? high - to : 0;
}

/**
 * The camera that shows some rectangles of the diagram comfortably, or nothing
 * when they are all in view already. Their union is brought in when it fits
 * inside the margins at the camera's own scale; when it does not, the last one
 * alone is.
 * @param camera Where the pane is looking.
 * @param room How big the pane's window on the diagram is.
 * @param rects What to show, the one that matters most last.
 * @param margin How far inside the viewport's edge to bring them, in pixels.
 * @returns The camera to move to, or null when everything is in view.
 */
function revealCamera(
	camera: Camera,
	room: Size,
	rects: readonly Rect[],
	margin: number,
): Camera | null {
	const boxes = rects.map((rect) => boxOf(camera, rect));
	if (boxes.every((box) => inView(box, room))) {
		return null;
	}
	const together = around(boxes);
	const fits =
		together.right - together.left <= room.width - 2 * margin &&
		together.bottom - together.top <= room.height - 2 * margin;
	const shown = fits ? together : (boxes.at(-1) ?? together);
	return {
		...camera,
		x: camera.x + shiftInto(shown.left, shown.right, margin, room.width - margin),
		y: camera.y + shiftInto(shown.top, shown.bottom, margin, room.height - margin),
	};
}

export { revealCamera };
