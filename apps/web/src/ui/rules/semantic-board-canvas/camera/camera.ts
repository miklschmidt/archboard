// Where a pane is looking at a diagram, as arithmetic.
//
// The camera is presentation state and nothing else: it is never written down,
// never sent to the server and never part of an address (ADR 0023, and the
// same rule the workspace search already keeps). Keeping the arithmetic pure
// and out of the component is what lets "a refetch did not move the camera" be
// a fact about one function rather than a claim about a render.

import { FIT_MARGIN, fitScale, type Size } from "@archboard/renderer/shell-geometry";

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
	/**
	 * One region of it, centred: what a narrative beat's subjects occupy. The
	 * context holds more around the region, and is shown in its place when it
	 * still reads nearly as large ({@link CONTEXT_SHARE}).
	 */
	| {
			readonly kind: "focus";
			readonly rect: Rect;
			readonly context?: Rect;
			/**
			 * Where the region stands in the viewport: centred, or at its top with
			 * whatever the room holds beyond it below, as a flow's rows are read.
			 */
			readonly anchor?: "top";
	  }
	/**
	 * A subject with the parts around it, centred: as many of them as still
	 * read ({@link READ_SCALE}), nearest first.
	 */
	| { readonly kind: "around"; readonly subject: Rect; readonly around: readonly Rect[] };

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

/**
 * How much of a focus's magnification a context may cost and still be shown
 * in its place, counted against the focus's own or the drawing's natural size,
 * whichever is smaller: magnifying past the size the drawing was set at helps
 * nobody read it, so a context that reads at nearly that size is worth more
 * than a closer look.
 *
 * A flow's subjects are whole columns and rows, so a fit to a beat about some
 * of them cut the columns either side through their words. More of the flow
 * shows those words, and the order they come in, for a little of the size.
 */
const CONTEXT_SHARE = 0.9;

/**
 * Below this magnification the picture is seen from far away: a card's
 * responsibility, drawn at 11 units, is under 8.25 px on screen and nobody
 * reads it, while its name, at 14, is still read with effort. The picture
 * then draws each card's name larger, with a larger tile for its kind and
 * the start of its responsibility set to read.
 */
const FAR_SCALE = 0.75;

/**
 * How far out a fit to a subject and the parts around it may go. Seen from far
 * away, a card draws its name at 15 to 20 units and the start of what it does
 * at 13 or 14 (far-card.ts): 7.5 to 10 px and 7 px at this size, read with
 * effort. Further out the names are seen and what each card does is not read.
 * So the fit leaves out the parts that would take it further, and the lines
 * that reach them lead past the edge.
 */
const READ_SCALE = 0.5;

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

/** A point of the viewport, in pixels. */
interface Point {
	readonly x: number;
	readonly y: number;
}

/** Two fingers on the viewport. */
type Fingers = readonly [Point, Point];

/**
 * Follow two fingers that pinch. The picture grows or shrinks by as much as the
 * distance between the fingers did, and the part of the diagram that was midway
 * between them stays midway between them, wherever they moved. So a pinch zooms
 * and pans in one move, and nothing is left for later frames to do.
 * @param camera Where the pane is looking.
 * @param before Where the fingers were.
 * @param after Where the fingers are now.
 * @returns The camera that follows them.
 */
function pinchCamera(camera: Camera, before: Fingers, after: Fingers): Camera {
	const was = Math.hypot(before[1].x - before[0].x, before[1].y - before[0].y);
	const now = Math.hypot(after[1].x - after[0].x, after[1].y - after[0].y);
	const scale = was > 0 && now > 0 ? clampScale(camera.scale * (now / was)) : camera.scale;
	const from = { x: (before[0].x + before[1].x) / 2, y: (before[0].y + before[1].y) / 2 };
	const to = { x: (after[0].x + after[1].x) / 2, y: (after[0].y + after[1].y) / 2 };
	return {
		scale,
		x: to.x - ((from.x - camera.x) / camera.scale) * scale,
		y: to.y - ((from.y - camera.y) / camera.scale) * scale,
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
 * @param anchor Where the region stands: centred, or at the top of the room.
 * @returns The fitted camera, or null when there is nothing to fit.
 */
function fitRect(viewport: Size, rect: Rect, ceiling: number, anchor?: "top"): Camera | null {
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
		y:
			anchor === "top"
				? FIT_MARGIN - rect.y * scale
				: viewport.height / 2 - (rect.y + rect.height / 2) * scale,
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
 * How far apart the middles of two rectangles are.
 * @param one A rectangle.
 * @param other Another.
 * @returns The distance, in the diagram's own units.
 */
function apart(one: Rect, other: Rect): number {
	return Math.hypot(
		one.x + one.width / 2 - (other.x + other.width / 2),
		one.y + one.height / 2 - (other.y + other.height / 2),
	);
}

/**
 * The camera that shows a subject with the parts around it: all of them while
 * they fit at {@link READ_SCALE} or closer. Otherwise the nearest part is taken
 * in first, each part while the region still fits at that size, so a far part
 * never pushes a near one out. That region is shown at that size, so as much
 * beyond it as reads is in sight too.
 * @param viewport How big the pane's window on the diagram is.
 * @param subject Where the subject lies.
 * @param around Where the parts around it lie.
 * @returns The fitted camera, or null when there is nothing to fit.
 */
function aroundCamera(viewport: Size, subject: Rect, around: readonly Rect[]): Camera | null {
	const whole = fitRect(viewport, unionRect([subject, ...around]) ?? subject, FOCUS_MAX_SCALE);
	if (whole === null || whole.scale >= READ_SCALE) {
		return whole;
	}
	const nearestFirst = around.toSorted((one, other) => apart(one, subject) - apart(other, subject));
	const region = nearestFirst.reduce((shown, box) => {
		const wider = unionRect([shown, box]) ?? shown;
		const fit = fitRect(viewport, wider, READ_SCALE);
		return fit !== null && fit.scale >= READ_SCALE ? wider : shown;
	}, subject);
	return fitRect(viewport, region, READ_SCALE);
}

/**
 * The camera that shows one region, or its context in its place when that
 * reads nearly as large.
 * @param viewport How big the pane's window on the diagram is.
 * @param target The region, with any context around it.
 * @returns The fitted camera, or null when there is nothing to fit.
 */
function focusCamera(viewport: Size, target: Extract<FitTarget, { kind: "focus" }>): Camera | null {
	const focus = fitRect(viewport, target.rect, FOCUS_MAX_SCALE, target.anchor);
	const context =
		target.context === undefined
			? null
			: fitRect(viewport, target.context, FOCUS_MAX_SCALE, target.anchor);
	// 1 is the size the drawing was set at.
	return focus !== null &&
		context !== null &&
		context.scale >= Math.min(focus.scale, 1) * CONTEXT_SHARE
		? context
		: focus;
}

/**
 * The camera that shows whatever is being fitted to.
 *
 * The whole diagram and one region of it are the same arithmetic with two
 * ceilings: a whole picture may be magnified as far as the camera goes, and a
 * region stops at `FOCUS_MAX_SCALE` so that pointing at one card does not
 * become a wall of card. A region's context is shown in its place when it
 * reads nearly as large. A subject takes in the parts around it as far out as
 * {@link READ_SCALE}.
 * @param viewport How big the pane's window on the diagram is.
 * @param target What is being shown: the whole diagram, or a region of it.
 * @returns The fitted camera, or null when there is nothing to fit.
 */
function cameraFor(viewport: Size, target: FitTarget): Camera | null {
	if (target.kind === "whole") {
		return fitCamera(viewport, target.content);
	}
	return target.kind === "around"
		? aroundCamera(viewport, target.subject, target.around)
		: focusCamera(viewport, target);
}

/**
 * The CSS transform one camera draws with.
 * @param camera Where the pane is looking.
 * @returns The transform, for a surface whose origin is its top left.
 */
function cameraTransform(camera: Camera): string {
	return `translate(${camera.x}px, ${camera.y}px) scale(${camera.scale})`;
}

/** One number as a transform writes it, a JavaScript number's own spelling included. */
const NUMBER = String.raw`(-?\d*\.?\d+(?:e[-+]?\d+)?)`;

/** The transform {@link cameraTransform} writes, read back. */
const CAMERA_TRANSFORM = new RegExp(
	String.raw`^translate\(${NUMBER}px, ${NUMBER}px\) scale\(${NUMBER}\)$`,
	"u",
);

/**
 * The camera a surface is drawn with, read back off its transform: whatever
 * moved it last, a glide's frame or a settled camera.
 * @param transform The surface's transform, as {@link cameraTransform} wrote it.
 * @returns The camera, or null for a transform it did not write.
 */
function cameraOf(transform: string): Camera | null {
	const said = CAMERA_TRANSFORM.exec(transform);
	return said === null ? null : { x: Number(said[1]), y: Number(said[2]), scale: Number(said[3]) };
}

export {
	FAR_SCALE,
	FOCUS_MAX_SCALE,
	IDENTITY_CAMERA,
	MAX_SCALE,
	MIN_SCALE,
	PAN_STEP,
	READ_SCALE,
	ZOOM_STEP,
	cameraFor,
	cameraOf,
	cameraTransform,
	clampScale,
	fitCamera,
	panCamera,
	pinchCamera,
	unionRect,
	zoomCameraAbout,
	type Camera,
	type Fingers,
	type FitTarget,
	type Point,
	type Rect,
	type Size,
};
