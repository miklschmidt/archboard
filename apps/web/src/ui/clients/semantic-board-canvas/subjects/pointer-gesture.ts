// A press on the diagram, and when it becomes a pan.
//
// A press that travels no further than a small tolerance is a click that picks
// what it landed on; one that travels further pans the diagram and picks
// nothing. The viewport takes the pointer only once a pan is under way.

import type { PointerEvent } from "react";

/** How far a pointer may travel and still be a click rather than a drag. */
const DRAG_SLOP = 4;

/** A gesture in progress: one pointer, from where it began to where it is. */
interface Drag {
	readonly pointerId: number;
	/** Where the press landed. How far the gesture has travelled is measured from here. */
	readonly fromX: number;
	readonly fromY: number;
	/** Where the pointer was last seen, which is what each pan step is measured against. */
	readonly x: number;
	readonly y: number;
	/** The subject the press landed on, decided before anything can move. */
	readonly pressed: string | null;
	/** Whether the viewport has taken the pointer, which it does only to pan. */
	readonly captured: boolean;
}

/**
 * Take or give back a pointer, tolerating a DOM that does not do capture.
 *
 * Pointer capture is what keeps a pan going when the pointer leaves the pane,
 * and it is also the first thing a lightweight DOM leaves out; a viewer that
 * threw without it would be untestable for the sake of an edge of a gesture.
 *
 * It is taken only once a pan is really under way. While an element holds the
 * pointer the browser dispatches the click to that element rather than to what
 * was under the pointer, so capturing on every press would mean every click
 * arriving at the viewport and every pick resolving to nothing.
 * @param element The viewport.
 * @param pointerId The pointer.
 * @param take True to take the pointer, false to give it back.
 */
function capturePointer(element: Element, pointerId: number, take: boolean): void {
	try {
		if (take) {
			element.setPointerCapture(pointerId);
		} else {
			element.releasePointerCapture(pointerId);
		}
	} catch {
		// A DOM without pointer capture still pans; only the gesture's edges differ.
	}
}

/**
 * Whether a gesture has gone far enough to be a pan rather than a press.
 *
 * Measured from where the gesture began, never from the last move: a slow drag
 * of a hundred one-pixel steps has travelled a hundred pixels, and counting
 * each step on its own would call the whole thing a click.
 * @param started The gesture, as it began.
 * @param x Where the pointer is now, across.
 * @param y Where the pointer is now, down.
 * @returns True once it has passed the tolerance.
 */
function hasTravelled(started: Drag, x: number, y: number): boolean {
	return Math.abs(x - started.fromX) + Math.abs(y - started.fromY) > DRAG_SLOP;
}

/**
 * Take the pointer once a press becomes a drag, and say whether it is held.
 *
 * A pan should keep tracking after the pointer leaves the pane, which is what
 * capture is for. A press must not be captured at all: while an element holds
 * the pointer the browser sends the click to that element rather than to what
 * was under it, so capturing every press would send every click to the viewport.
 * @param event The move.
 * @param started The gesture, as it began.
 * @param panned Whether this has become a pan.
 * @returns Whether the viewport now holds the pointer.
 */
function takePointerToDrag(
	event: PointerEvent<HTMLElement>,
	started: Drag,
	panned: boolean,
): boolean {
	if (panned && !started.captured) {
		capturePointer(event.currentTarget, event.pointerId, true);
	}
	return started.captured || panned;
}

export { capturePointer, hasTravelled, takePointerToDrag, type Drag };
