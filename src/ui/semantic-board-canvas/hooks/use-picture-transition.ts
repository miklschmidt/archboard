// Owning what is on the surface: the picture, and the moments between one
// picture and the next.
//
// The surface element is React's; what is inside it is this hook's. React
// never templates the picture, because a picture that is being carried from
// one state to another is not a string a render could produce — it is the next
// picture, with the last one's geometry borrowed for a few hundred milliseconds.
// So the markup is written here, once per picture, and a picture that arrives
// while the last is still in flight lands the last one first: the surface is
// never left somewhere between three pictures.
//
// What is on the surface is an external fact as far as React is concerned —
// the DOM was written behind its back — so it is read back through a store the
// writes publish to, the way any other external system is.

import { useLayoutEffect, useRef, useSyncExternalStore } from "react";

import { PICTURE_ENTRY_MS, PICTURE_TRANSITION_MS } from "@/shared/timing/timing";
import type { SemanticDrawing } from "@/ui/semantic-board-canvas/api/semantic-boards";
import { ghostPicture, type Departure } from "@/ui/semantic-board-canvas/lib/picture-departure";
import { enterPicture } from "@/ui/semantic-board-canvas/lib/picture-entrance";
import {
	continuousPictures,
	sameReading,
	sharedShift,
	stagePicture,
	transitionPicture,
	type PictureTransition,
	type Shift,
} from "@/ui/semantic-board-canvas/lib/picture-transition";

/** The picture on the surface, as something to mark up. */
interface StagedPicture {
	/** The element the picture is in, which carries the marks about the whole picture. */
	readonly surface: HTMLElement;
	/** The picture's own root, which holds the groups that are marked one by one. */
	readonly root: Element;
}

/** A transition being driven, and the way to stop driving it. */
interface Flight {
	readonly transition: PictureTransition;
	readonly stop: () => void;
}

/** What the surface was last given, and on which element. */
interface Shown {
	readonly surface: HTMLElement;
	readonly drawing: SemanticDrawing;
}

/** How pictures move on the surface, and what the camera is told as they do. */
interface PictureMotion {
	/** Whether the person asked for no motion; then every picture is a cut. */
	readonly reducedMotion: boolean;
	/**
	 * Told, before the next picture of the same board is first painted, how far
	 * the cards the two share moved on the page, so the camera can move with
	 * them and keep them where the reader was looking.
	 */
	readonly keepStill: (shift: Shift) => void;
	/** Where the reader went from the last picture, when they went somewhere; null otherwise. */
	readonly heading?: Departure | null | undefined;
	/**
	 * Whether a walkthrough is being presented. A step read through another view
	 * of the same board is then carried into, not brought in afresh, and the
	 * camera glides to the step instead of following the shared cards.
	 */
	readonly presenting?: boolean | undefined;
}

/**
 * What the surface carries while a picture is still moving into place, and
 * loses once it has landed: the picture at rest is the one a reader reads, and
 * the one anything outside that wants to look at what was drawn should wait for.
 */
const PICTURE_MOTION_ATTRIBUTE = "data-picture-motion";

/** What has been written to the surface, for React to read back. */
interface PictureStore {
	picture: StagedPicture | null;
	readonly listeners: Set<() => void>;
}

/**
 * Whether this browser can animate at all: the frame clock the flight runs on.
 * @returns True when frames can be asked for.
 */
function canAnimate(): boolean {
	return typeof requestAnimationFrame === "function" && typeof performance === "object";
}

/**
 * Whether the next picture is the last one carried on, rather than another.
 * @param last The picture on the surface.
 * @param next The picture that arrived.
 * @param presenting Whether a walkthrough is presented, which carries across views of one board.
 * @returns True when the two are pictures of one board read one way, or of one
 * board in one presentation, and differ.
 */
function carriedOn(last: SemanticDrawing, next: SemanticDrawing, presenting = false): boolean {
	if (last.svg === next.svg) {
		return false;
	}
	return (
		continuousPictures(last, next) ||
		(presenting && last.board === next.board && last.theme === next.theme)
	);
}

/**
 * The picture the next one is carried from, when it is carried rather than cut to.
 * @param last What the surface was last given, if anything.
 * @param surface The surface the picture goes on.
 * @param drawing The picture.
 * @param motion Whether the person asked for no motion, and whether a walkthrough is presented.
 * @returns The last picture, or null when this one is simply shown.
 */
function carriedFrom(
	last: Shown | null,
	surface: HTMLElement,
	drawing: SemanticDrawing,
	motion: Pick<PictureMotion, "reducedMotion" | "presenting">,
): SemanticDrawing | null {
	if (last?.surface !== surface || motion.reducedMotion || !canAnimate()) {
		return null;
	}
	return carriedOn(last.drawing, drawing, motion.presenting === true) ? last.drawing : null;
}

/**
 * Whether the next picture comes in part by part: one with nothing on this
 * surface to be carried from — the first, or another board or view. A picture
 * of the same board read the same way is carried instead, and one that only
 * changed theme is cut to, since the same board simply took other colours.
 * @param last What the surface was last given, if anything.
 * @param surface The surface the picture goes on.
 * @param drawing The picture.
 * @param reducedMotion Whether the person asked for no motion.
 * @returns True for an entrance.
 */
function entersAfresh(
	last: Shown | null,
	surface: HTMLElement,
	drawing: SemanticDrawing,
	reducedMotion: boolean,
): boolean {
	if (reducedMotion || !canAnimate()) {
		return false;
	}
	return last?.surface !== surface || !sameReading(last.drawing, drawing);
}

/**
 * Drive a transition from now to its end, one frame at a time.
 * @param transition The transition.
 * @param duration How long it takes.
 * @param onLanded What to do once it has finished.
 * @returns The flight, with the way to stop it.
 */
function fly(transition: PictureTransition, duration: number, onLanded: () => void): Flight {
	const started = performance.now();
	let frame = 0;
	/**
	 * Draw one frame, and ask for the next until the last.
	 * @param now The frame's time.
	 */
	function tick(now: number): void {
		const progress = (now - started) / duration;
		if (progress < 1) {
			transition.seek(progress);
			frame = requestAnimationFrame(tick);
			return;
		}
		transition.finish();
		onLanded();
	}
	frame = requestAnimationFrame(tick);
	/** Stop asking for frames. */
	function stop(): void {
		cancelAnimationFrame(frame);
	}
	return { transition, stop };
}

/**
 * Land a flight where it was going, at once.
 * @param flight The flight, if one is up.
 */
function land(flight: Flight | null): void {
	if (flight !== null) {
		flight.stop();
		flight.transition.finish();
	}
}

/**
 * How far the cards the last picture and the next share moved, when the next is
 * the same board carried on, with or without motion.
 * @param last What the surface was showing, if anything.
 * @param surface The surface.
 * @param drawing The next picture.
 * @param presenting Whether a walkthrough is presented, when the camera goes to the step instead.
 * @returns The shift, or nothing when the next picture is another board or reading.
 */
function shiftFrom(
	last: Shown | null,
	surface: HTMLElement,
	drawing: SemanticDrawing,
	presenting: boolean,
): Shift | undefined {
	return !presenting && last?.surface === surface && carriedOn(last.drawing, drawing)
		? sharedShift(last.drawing, drawing)
		: undefined;
}

/** What the next picture is, where it goes, and how it may move. */
interface NextPicture extends PictureMotion {
	readonly heading: Departure | null;
	readonly surface: HTMLElement;
	readonly last: Shown | null;
	readonly drawing: SemanticDrawing;
	/** Where the surface's pane was on screen when the last picture was last seen. */
	readonly seenAt: Point | null;
}

/** A point on screen, in pixels. */
interface Point {
	readonly x: number;
	readonly y: number;
}

/**
 * Where the pane a surface is in sits on screen.
 * @param surface The surface.
 * @returns Its pane's top left corner, or null when it is in none.
 */
function paneAt(surface: HTMLElement | null): Point | null {
	const box = surface?.parentElement?.getBoundingClientRect();
	return box === undefined ? null : { x: box.left, y: box.top };
}

/**
 * How far a pane has moved since it was seen.
 * @param seenAt Where it was.
 * @param surface Its surface, where it is now.
 * @returns The distance, nothing when either is unknown.
 */
function movedSince(seenAt: Point | null, surface: HTMLElement): Point {
	const now = paneAt(surface);
	return seenAt === null || now === null
		? { x: 0, y: 0 }
		: { x: seenAt.x - now.x, y: seenAt.y - now.y };
}

/**
 * Put the next picture on the surface: cut to it, carry the last one into it,
 * or bring it in part by part when there is nothing to carry it from. Either
 * way, a picture of the same board tells the camera how far the shared cards
 * moved before anything is painted.
 * @param next What to show, where, and how it may move.
 * @param onLanded What to do once a flight has landed.
 * @returns The flight, or null for a cut.
 */
function showPicture(next: NextPicture, onLanded: () => void): Flight | null {
	const { surface, last, drawing, reducedMotion, keepStill, heading, seenAt } = next;
	const shift = shiftFrom(last, surface, drawing, next.presenting === true);
	const from = carriedFrom(last, surface, drawing, next);
	if (shift !== undefined) keepStill(shift);
	if (from !== null) {
		return fly(transitionPicture(surface, from, drawing, shift), PICTURE_TRANSITION_MS, onLanded);
	}
	if (entersAfresh(last, surface, drawing, reducedMotion)) {
		if (last?.surface === surface) ghostPicture(surface, heading, movedSince(seenAt, surface));
		return fly(enterPicture(surface, drawing), PICTURE_ENTRY_MS, onLanded);
	}
	stagePicture(surface, drawing.svg);
	return null;
}

/**
 * Tell the store what the surface now holds.
 * @param store The store.
 * @param surface The surface.
 */
function publish(store: PictureStore, surface: HTMLElement | null): void {
	const root = surface?.querySelector("svg") ?? null;
	store.picture = surface === null || root === null ? null : { surface, root };
	for (const listener of store.listeners) {
		listener();
	}
}

/**
 * Keep the surface showing the drawing, carrying it from the last one when
 * the two are pictures of one board read the same way.
 * @param surface The element the picture goes in, or null before it exists.
 * @param drawing The picture to show.
 * @param motion How pictures move, and what the camera is told as they do.
 * @returns The picture as it is now on the surface, a new value each time the
 * markup was written, for whatever marks that markup up to run again over it.
 */
function usePictureTransition(
	surface: HTMLElement | null,
	drawing: SemanticDrawing,
	motion: PictureMotion,
): StagedPicture | null {
	const { reducedMotion, keepStill } = motion;
	const heading = motion.heading ?? null;
	const presenting = motion.presenting === true;
	const shown = useRef<Shown | null>(null);
	const flight = useRef<Flight | null>(null);
	const seen = useRef<Point | null>(null);
	const store = useRef<PictureStore>({ picture: null, listeners: new Set() });
	const picture = useSyncExternalStore(
		(listener) => {
			store.current.listeners.add(listener);
			return (): void => {
				store.current.listeners.delete(listener);
			};
		},
		() => store.current.picture,
	);
	useLayoutEffect(() => {
		const last = shown.current;
		// The same picture again, as another answer: a picture read twice while
		// it is on its way arrives twice. Nothing on the surface changes, so a
		// flight carrying it keeps flying rather than being landed by itself.
		if (surface === null || (last?.surface === surface && last.drawing.svg === drawing.svg)) {
			if (surface !== null) shown.current = { surface, drawing };
			return;
		}
		// A picture arriving mid-flight lands the flight first, so the surface
		// is showing exactly the picture the new transition is told it is.
		land(flight.current);
		shown.current = { surface, drawing };
		const next = {
			surface,
			last,
			drawing,
			reducedMotion,
			keepStill,
			heading,
			presenting,
			seenAt: seen.current,
		};
		flight.current = showPicture(next, () => {
			flight.current = null;
			surface.toggleAttribute(PICTURE_MOTION_ATTRIBUTE, false);
			publish(store.current, surface);
		});
		surface.toggleAttribute(PICTURE_MOTION_ATTRIBUTE, flight.current !== null);
		publish(store.current, surface);
	}, [surface, drawing, reducedMotion, keepStill, heading, presenting]);
	// Where the pane is after every commit, so the next picture knows where the
	// last one was seen. After the picture is written, and read only when motion
	// is allowed: nothing else needs it.
	useLayoutEffect(() => {
		seen.current = reducedMotion ? null : paneAt(surface);
	});
	// Leaving the surface stops asking for frames; what it showed does not matter any more.
	useLayoutEffect(
		() => (): void => {
			flight.current?.stop();
			flight.current = null;
		},
		[],
	);
	return picture;
}

export { PICTURE_MOTION_ATTRIBUTE, usePictureTransition, type PictureMotion, type StagedPicture };
