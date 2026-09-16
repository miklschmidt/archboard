// Where a pane is looking at a diagram, as arithmetic.
//
// The camera is presentation state and nothing else: it is never written down,
// never sent to the server and never part of an address (ADR 0023, and the
// same rule the workspace search already keeps). Keeping the arithmetic pure
// and out of the component is what lets "a refetch did not move the camera" be
// a fact about one function rather than a claim about a render.

import { FIT_MARGIN, fitScale, type Size } from "@/shared/shell-geometry/index";

/** Where the pane is looking: the diagram's origin, and how magnified it is. */
interface Camera {
	readonly x: number;
	readonly y: number;
	readonly scale: number;
}

/**
 * A region of the diagram, in the drawing's own units.
 *
 * Structurally the atlas's box, and deliberately not imported from it: the
 * arithmetic here works on rectangles and has no opinion about where one came
 * from. Every rectangle a caller passes does come from the atlas the server
 * returned — this module invents no geometry and has nothing to invent it from.
 */
interface Rect extends Size {
	readonly x: number;
	readonly y: number;
}

/** What a fit is being asked to show. */
type FitTarget =
	/** The whole diagram, centred: what a pane shows when nothing is singled out. */
	| { readonly kind: "whole"; readonly content: Size }
	/** One region of it, centred: what a narrative beat's subjects occupy. */
	| { readonly kind: "focus"; readonly rect: Rect };

/**
 * How far in and out a diagram can be taken.
 *
 * Large renderings are expected and fitting one in a viewport is not a success
 * criterion (ADR 0023), so the floor is low enough to see a whole system at
 * once and the ceiling high enough to read a card's smallest type.
 */
const MIN_SCALE = 0.05;
const MAX_SCALE = 8;

/** One notch of the wheel, one press of `+`: a tenth either way. */
const ZOOM_STEP = 1.1;

/** How far one arrow key moves the diagram, in viewport pixels. */
const PAN_STEP = 64;

/**
 * How far in a fit to one region may go.
 *
 * A beat about a single card would otherwise fill an 1800-pixel pane with one
 * card at eight times the size it was drawn at, which is not attention but a
 * wall. Stopping half again past the drawn size keeps the subject unmistakably
 * the thing being talked about while leaving what is around it in sight, which
 * is the whole point of pointing at part of an architecture.
 */
const FOCUS_MAX_SCALE = 1.5;

/** The camera a diagram starts at before anything has been fitted. */
const IDENTITY_CAMERA: Camera = Object.freeze({ x: 0, y: 0, scale: 1 });

/**
 * A magnification inside the range a person can get back from.
 * @param scale The magnification asked for.
 * @returns The nearest allowed magnification.
 */
function clampScale(scale: number): number {
	return Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale));
}

/**
 * Move the diagram under the viewport.
 * @param camera Where the pane is looking.
 * @param dx How far right the diagram moves, in viewport pixels.
 * @param dy How far down the diagram moves, in viewport pixels.
 * @returns The moved camera.
 */
function panCamera(camera: Camera, dx: number, dy: number): Camera {
	return { ...camera, x: camera.x + dx, y: camera.y + dy };
}

/**
 * Zoom about a point of the viewport, so that whatever is under that point
 * stays under it. The pointer is the natural anchor for a wheel; the middle of
 * the viewport is the natural one for a keypress.
 * @param camera Where the pane is looking.
 * @param factor How much to magnify by, relative to now.
 * @param anchorX The viewport x to keep still.
 * @param anchorY The viewport y to keep still.
 * @returns The zoomed camera.
 */
function zoomCameraAbout(camera: Camera, factor: number, anchorX: number, anchorY: number): Camera {
	const scale = clampScale(camera.scale * factor);
	// Nothing moved, so nothing is re-anchored: a camera already at the limit
	// must not drift sideways every time somebody keeps scrolling.
	if (scale === camera.scale) {
		return camera;
	}
	const ratio = scale / camera.scale;
	return {
		scale,
		x: anchorX - (anchorX - camera.x) * ratio,
		y: anchorY - (anchorY - camera.y) * ratio,
	};
}

/**
 * The camera that shows one rectangle of the diagram, centred, with a margin.
 *
 * A viewport or a rectangle with no size cannot be fitted to; the caller is
 * told so with null rather than being given a camera computed from a zero,
 * because a stage that has not been laid out yet must keep the camera it has.
 * @param viewport How big the pane's window on the diagram is.
 * @param rect The region to show, in the diagram's own units.
 * @param ceiling How far in this fit may magnify.
 * @returns The fitted camera, or null when there is nothing to fit.
 */
function fitRect(viewport: Size, rect: Rect, ceiling: number): Camera | null {
	const room = { width: viewport.width - FIT_MARGIN * 2, height: viewport.height - FIT_MARGIN * 2 };
	if (room.width <= 0 || room.height <= 0 || rect.width <= 0 || rect.height <= 0) {
		return null;
	}
	// The same arithmetic the layout suite measures a drawing's fit with
	// (`fitIn` beside `fitScale`), so a fit there is a fit here.
	const scale = Math.min(ceiling, clampScale(fitScale(room, rect)));
	return {
		scale,
		x: viewport.width / 2 - (rect.x + rect.width / 2) * scale,
		y: viewport.height / 2 - (rect.y + rect.height / 2) * scale,
	};
}

/**
 * The camera that shows a whole diagram, centred, with a margin.
 *
 * A viewport or a diagram with no size cannot be fitted to; the caller is told
 * so with null rather than being given a camera computed from a zero, because
 * a stage that has not been laid out yet must keep the camera it has.
 * @param viewport How big the pane's window on the diagram is.
 * @param content How big the diagram is, in its own units.
 * @returns The fitted camera, or null when there is nothing to fit.
 */
function fitCamera(viewport: Size, content: Size): Camera | null {
	return fitRect(viewport, { x: 0, y: 0, ...content }, MAX_SCALE);
}

/**
 * The one rectangle that holds all of them.
 * @param rects The rectangles, typically the atlas boxes of a beat's subjects.
 * @returns The rectangle around them, or null when there were none.
 */
function unionRect(rects: readonly Rect[]): Rect | null {
	const first = rects[0];
	if (first === undefined) {
		return null;
	}
	let left = first.x;
	let top = first.y;
	let right = first.x + first.width;
	let bottom = first.y + first.height;
	for (const rect of rects.slice(1)) {
		left = Math.min(left, rect.x);
		top = Math.min(top, rect.y);
		right = Math.max(right, rect.x + rect.width);
		bottom = Math.max(bottom, rect.y + rect.height);
	}
	return { x: left, y: top, width: right - left, height: bottom - top };
}

/**
 * The camera that shows whatever is being fitted to.
 *
 * The whole diagram and one region of it are the same arithmetic with two
 * ceilings: a whole picture may be magnified as far as the camera goes, and a
 * region stops at `FOCUS_MAX_SCALE` so that pointing at one card does not
 * become a wall of card.
 * @param viewport How big the pane's window on the diagram is.
 * @param target What is being shown: the whole diagram, or a region of it.
 * @returns The fitted camera, or null when there is nothing to fit.
 */
function cameraFor(viewport: Size, target: FitTarget): Camera | null {
	return target.kind === "whole"
		? fitCamera(viewport, target.content)
		: fitRect(viewport, target.rect, FOCUS_MAX_SCALE);
}

/**
 * The CSS transform one camera draws with.
 * @param camera Where the pane is looking.
 * @returns The transform, for a surface whose origin is its top left.
 */
function cameraTransform(camera: Camera): string {
	return `translate(${camera.x}px, ${camera.y}px) scale(${camera.scale})`;
}

export {
	FIT_MARGIN,
	FOCUS_MAX_SCALE,
	IDENTITY_CAMERA,
	MAX_SCALE,
	MIN_SCALE,
	PAN_STEP,
	ZOOM_STEP,
	cameraFor,
	cameraTransform,
	clampScale,
	fitCamera,
	panCamera,
	unionRect,
	zoomCameraAbout,
	type Camera,
	type FitTarget,
	type Rect,
	type Size,
};
