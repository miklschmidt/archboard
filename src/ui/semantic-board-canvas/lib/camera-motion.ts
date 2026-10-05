// How the camera moves between a gesture and rest, as arithmetic.
//
// A wheel, a pinch or a key does not put the camera somewhere: it changes where
// the camera is going, and the camera runs toward it. Every input adds to what
// is left of the last, so a hard flick of the wheel is one long ease and not a
// row of short ones. A zoom keeps one part of the diagram under one point of the
// viewport all the way, so it never drifts sideways on the way in. A thrown drag
// carries on with the speed it was let go at and slows to rest.
//
// Pure, like the rest of the camera: a step is a function from the camera as it
// was drawn, what it is still doing and how long the frame was, to the camera as
// it is drawn next. Whoever drives it owns the clock (`use-camera-motion`).

import { EXPLORING_MS } from "@/shared/timing/timing";
import { ZOOM_STEP, clampScale, type Camera } from "@/ui/semantic-board-canvas/lib/camera";

/** Two numbers: a point of the viewport in pixels, or a speed in pixels per millisecond. */
interface Pair {
	readonly x: number;
	readonly y: number;
}

/** A zoom under way: where it is going, and what stays still on the way. */
interface Zoom {
	/** The magnification it is easing to. */
	readonly scale: number;
	/** The point of the viewport that holds still, in pixels. */
	readonly keep: Pair;
	/** The point of the diagram that stays under it, in diagram units. */
	readonly under: Pair;
}

/** What the camera is still doing after its last gesture. */
interface Motion {
	readonly zoom: Zoom | null;
	/** How far across and down it has still to move, in viewport pixels. */
	readonly ease: Pair | null;
	/** How fast a thrown drag is moving, in pixels per millisecond. */
	readonly fling: Pair | null;
}

/** Nothing under way. */
const STILL: Motion = Object.freeze({ zoom: null, ease: null, fling: null });

/** How far a wheel turns for one notch, in the pixels a browser reports for a mouse wheel. */
const WHEEL_NOTCH = 100;

/** What a line is worth in pixels, for a wheel that reports its turn in lines: three to a notch. */
const LINE_PIXELS = 33;

/** What a page is worth in pixels, for a wheel that reports its turn in pages. */
const PAGE_PIXELS = 400;

/** A pinch on a trackpad arrives as a wheel with Control held, in turns this much smaller than a notch. */
const PINCH_GAIN = 10;

/** The most one event may turn, in pixels, so a device that reports a huge jump zooms by a few notches at most. */
const MOST_PER_EVENT = 3 * WHEEL_NOTCH;

/** Below this many pixels an ease is as good as over, and lands. */
const EASE_REST = 0.05;

/** Below this much change of the logarithm of the scale a zoom is as good as over, and lands. */
const ZOOM_REST = 0.0004;

/** Below this speed, in pixels per millisecond, a thrown drag has stopped. */
const FLING_REST = 0.02;

/** How the wheel turned, as far as a zoom is concerned. */
interface WheelTurn {
	/** How far it turned; negative comes closer. */
	readonly deltaY: number;
	/** Whether it counts pixels (0), lines (1) or pages (2). */
	readonly deltaMode: number;
	/** Whether Control is held, which is how a trackpad says it is pinching. */
	readonly ctrlKey: boolean;
}

/**
 * How much one turn of the wheel magnifies by: in proportion to how far it
 * turned, so that a gentle pinch zooms gently, and one notch of a mouse wheel
 * is the step a key zooms by.
 * @param turn How the wheel turned.
 * @returns The factor; above 1 comes closer.
 */
function wheelZoomFactor(turn: WheelTurn): number {
	const unit = turn.deltaMode === 1 ? LINE_PIXELS : turn.deltaMode === 2 ? PAGE_PIXELS : 1;
	const gain = turn.ctrlKey ? PINCH_GAIN : 1;
	const turned = Math.max(-MOST_PER_EVENT, Math.min(MOST_PER_EVENT, turn.deltaY * unit * gain));
	return Math.exp((-turned * Math.log(ZOOM_STEP)) / WHEEL_NOTCH);
}

/**
 * Add a zoom to what the camera is doing: the target moves on from where the
 * last zoom was going, and the part of the diagram under the pointer now is the
 * part that stays under it.
 * @param camera The camera as it is drawn.
 * @param motion What it is doing now.
 * @param factor How much to magnify by, on top of where it is going.
 * @param at The point of the viewport to zoom about.
 * @returns What it does now; the same motion when it is at the limit already.
 */
function zoomMotion(camera: Camera, motion: Motion, factor: number, at: Pair): Motion {
	const from = motion.zoom?.scale ?? camera.scale;
	const scale = clampScale(from * factor);
	if (scale === from) {
		return motion;
	}
	const under = { x: (at.x - camera.x) / camera.scale, y: (at.y - camera.y) / camera.scale };
	return { ...motion, zoom: { scale, keep: at, under }, fling: null };
}

/**
 * Add a move to what the camera is doing: it still has this much further to go.
 * @param motion What it is doing now.
 * @param dx How much further across, in viewport pixels.
 * @param dy How much further down, in viewport pixels.
 * @returns What it does now.
 */
function easeMotion(motion: Motion, dx: number, dy: number): Motion {
	const left = motion.ease ?? { x: 0, y: 0 };
	return { ...motion, ease: { x: left.x + dx, y: left.y + dy }, fling: null };
}

/**
 * A thrown drag: the camera carries on at the speed it was let go with.
 * @param speed How fast, in pixels per millisecond.
 * @returns What the camera does now.
 */
function flingMotion(speed: Pair): Motion {
	return { zoom: null, ease: null, fling: speed };
}

/** What one frame of an ease moved, and what it has left. */
interface EaseStep {
	readonly move: Pair;
	readonly left: Pair | null;
}

/**
 * One frame of the ease: a share of what is left, and all of it once it is nearly nothing.
 * @param ease What is left, or null.
 * @param share How much of it this frame covers, 0 to 1.
 * @returns What moved, and what is left.
 */
function easeStep(ease: Pair | null, share: number): EaseStep {
	if (ease === null) {
		return { move: { x: 0, y: 0 }, left: null };
	}
	const move = { x: ease.x * share, y: ease.y * share };
	const left = { x: ease.x - move.x, y: ease.y - move.y };
	return Math.hypot(left.x, left.y) < EASE_REST
		? { move: { x: ease.x, y: ease.y }, left: null }
		: { move, left };
}

/** What one frame of a fling moved, and the speed it has left. */
interface FlingStep {
	readonly move: Pair;
	readonly speed: Pair | null;
}

/**
 * One frame of a thrown drag: it moves at its speed, and loses some of it.
 * @param fling How fast it moves, or null.
 * @param dt How long the frame was, in milliseconds.
 * @returns What moved, and the speed left.
 */
function flingStep(fling: Pair | null, dt: number): FlingStep {
	if (fling === null) {
		return { move: { x: 0, y: 0 }, speed: null };
	}
	const keep = Math.exp(-dt / EXPLORING_MS.cameraFling);
	const speed = { x: fling.x * keep, y: fling.y * keep };
	return {
		move: { x: fling.x * dt, y: fling.y * dt },
		speed: Math.hypot(speed.x, speed.y) < FLING_REST ? null : speed,
	};
}

/** The camera after a frame of zoom and move, and the zoom that is left. */
interface ZoomStep {
	readonly camera: Camera;
	readonly zoom: Zoom | null;
}

/**
 * One frame of the zoom, with the frame's move applied to the part that holds still.
 * @param camera The camera as it was drawn.
 * @param zoom The zoom under way, or null.
 * @param move How far the camera moved this frame for other reasons.
 * @param share How much of the way to the target this frame covers, 0 to 1.
 * @returns The camera now, and the zoom left.
 */
function zoomStep(camera: Camera, zoom: Zoom | null, move: Pair, share: number): ZoomStep {
	if (zoom === null) {
		return { camera: { ...camera, x: camera.x + move.x, y: camera.y + move.y }, zoom: null };
	}
	const keep = { x: zoom.keep.x + move.x, y: zoom.keep.y + move.y };
	const ratio = zoom.scale / camera.scale;
	const done = Math.abs(Math.log(ratio)) < ZOOM_REST;
	const scale = done ? zoom.scale : camera.scale * ratio ** share;
	return {
		camera: { scale, x: keep.x - zoom.under.x * scale, y: keep.y - zoom.under.y * scale },
		zoom: done ? null : { ...zoom, keep },
	};
}

/** The camera after a frame, and what it is still doing; null once it is at rest. */
interface Stepped {
	readonly camera: Camera;
	readonly motion: Motion | null;
}

/**
 * Run the camera one frame on.
 * @param camera The camera as it was drawn.
 * @param motion What it is doing.
 * @param dt How long the frame was, in milliseconds.
 * @returns The camera to draw, and what it is still doing.
 */
function stepMotion(camera: Camera, motion: Motion, dt: number): Stepped {
	const share = 1 - Math.exp(-dt / EXPLORING_MS.cameraEase);
	const eased = easeStep(motion.ease, share);
	const flung = flingStep(motion.fling, dt);
	const move = { x: eased.move.x + flung.move.x, y: eased.move.y + flung.move.y };
	const zoomed = zoomStep(camera, motion.zoom, move, share);
	const resting = zoomed.zoom === null && eased.left === null && flung.speed === null;
	return {
		camera: zoomed.camera,
		motion: resting ? null : { zoom: zoomed.zoom, ease: eased.left, fling: flung.speed },
	};
}

/** One place the pointer was, and when. */
interface Sample {
	readonly t: number;
	readonly x: number;
	readonly y: number;
}

/** The slowest drag, in pixels per millisecond, that is thrown at all. */
const THROW_MIN = 0.25;

/** The fastest a drag is thrown, in pixels per millisecond, however hard it was flicked. */
const THROW_MAX = 3;

/**
 * Keep a place the pointer was, and forget the places too old to tell its speed.
 * @param trail The places so far, oldest first.
 * @param sample The latest.
 * @returns The places that still count.
 */
function trailWith(trail: readonly Sample[], sample: Sample): Sample[] {
	return [...trail.filter((older) => sample.t - older.t <= EXPLORING_MS.throwTrail), sample];
}

/**
 * How fast a drag was going when it was let go, or null when it should stop
 * where it is: too slow, or the pointer had come to rest before it was released.
 * @param trail The places the pointer was, oldest first.
 * @param releasedAt When it was let go, on the same clock.
 * @returns The speed to carry on at, in pixels per millisecond.
 */
function throwOf(trail: readonly Sample[], releasedAt: number): Pair | null {
	const first = trail[0];
	const last = trail.at(-1);
	if (first === undefined || last === undefined || releasedAt - last.t > EXPLORING_MS.throwRest) {
		return null;
	}
	const span = last.t - first.t;
	if (span < EXPLORING_MS.throwSpan) {
		return null;
	}
	const speed = { x: (last.x - first.x) / span, y: (last.y - first.y) / span };
	const fast = Math.hypot(speed.x, speed.y);
	if (fast < THROW_MIN) {
		return null;
	}
	const capped = Math.min(1, THROW_MAX / fast);
	return { x: speed.x * capped, y: speed.y * capped };
}

export {
	STILL,
	easeMotion,
	flingMotion,
	stepMotion,
	throwOf,
	trailWith,
	wheelZoomFactor,
	zoomMotion,
	type Motion,
	type Pair,
	type Sample,
	type WheelTurn,
};
