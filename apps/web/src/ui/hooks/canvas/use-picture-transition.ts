// Owning what is on the surface: the picture, and the moments between one
// picture and the next.
//
// The surface element is React's; what is inside it is this hook's. The markup
// is written here, once per picture, and the stage is told how the picture
// arrives: cut to, carried from the last, or brought in part by part. A picture
// that arrives while the last is still in flight lands the last one first.
//
// What is on the surface is an external fact as far as React is concerned —
// the DOM was written behind its back — so it is read back through a store the
// writes publish to, the way any other external system is.

import { useLayoutEffect, useRef, useSyncExternalStore } from "react";

import { PICTURE_MS } from "@archboard/timing";
import { frameClock } from "@archboard/ui-kit/frame-clock";
import type { Departure } from "#ui/clients/canvas/picture/picture-departure.ts";
import {
	NO_SHIFT,
	continuousPictures,
	sharedShift,
	stagePicture,
	type MovingPicture,
	type Shift,
} from "#ui/clients/canvas/picture/picture-transition.ts";
import { stageOf } from "#ui/clients/canvas/picture/picture-stage.ts";

/** The picture on the surface, as something to mark up. */
interface StagedPicture {
	/** The element the picture is in, which carries the marks about the whole picture. */
	readonly surface: HTMLElement;
	/** The picture's own root, which holds the groups that are marked one by one. */
	readonly root: Element;
}

/** The way to stop waiting for a picture to move into place. */
type Flight = () => void;

/** What the surface was last given, and on which element. */
interface Shown {
	readonly surface: HTMLElement;
	readonly drawing: MovingPicture;
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
	/**
	 * The picture is the one a flight arrived at, which has already put the board
	 * where it belongs: it is put up as it is, with no entrance and nothing of
	 * the last picture carried into it.
	 */
	readonly cut?: boolean | undefined;
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
 * Whether the next picture is the last one carried on, rather than another.
 * @param last The picture on the surface.
 * @param next The picture that arrived.
 * @param presenting Whether a walkthrough is presented, which carries across views of one board.
 * @returns True when the two are pictures of one board read one way, or of one
 * board in one presentation, and differ.
 */
function carriedOn(last: MovingPicture, next: MovingPicture, presenting = false): boolean {
	if (last.svg === next.svg) {
		return false;
	}
	return continuousPictures(last, next) || (presenting && last.board === next.board);
}

/**
 * Whether the last picture is carried into the next, rather than cut from.
 * @param last What the surface was last given, if anything.
 * @param surface The surface the picture goes on.
 * @param drawing The picture.
 * @param motion Whether the person asked for no motion, and whether a walkthrough is presented.
 * @returns True when the last picture moves into this one.
 */
function carriesOn(
	last: Shown | null,
	surface: HTMLElement,
	drawing: MovingPicture,
	motion: Pick<PictureMotion, "reducedMotion" | "presenting">,
): boolean {
	if (last?.surface !== surface || motion.reducedMotion || !frameClock().animates) {
		return false;
	}
	return carriedOn(last.drawing, drawing, motion.presenting === true);
}

/**
 * Whether the next picture comes in part by part: one with nothing on this
 * surface to be carried from — the first, or another board or view. A picture
 * of the same board read the same way is carried instead. A theme switch is no
 * new picture at all: the one on the surface takes the page's colours, and an
 * empty reading has no parts to bring in.
 * @param last What the surface was last given, if anything.
 * @param surface The surface the picture goes on.
 * @param drawing The picture.
 * @param reducedMotion Whether the person asked for no motion.
 * @returns True for an entrance.
 */
function entersAfresh(
	last: Shown | null,
	surface: HTMLElement,
	drawing: MovingPicture,
	reducedMotion: boolean,
): boolean {
	if (reducedMotion || drawing.svg === "" || !frameClock().animates) {
		return false;
	}
	return last?.surface !== surface || !continuousPictures(last.drawing, drawing);
}

/**
 * Wait, frame by frame, for a picture to move into place.
 * @param duration How long that takes.
 * @param onLanded What to do once it has.
 * @returns The flight, with the way to stop it.
 */
function fly(duration: number, onLanded: () => void): Flight {
	const clock = frameClock();
	const landsAt = clock.now() + duration;
	let frame = 0;
	/**
	 * Land at the first frame past the end, or ask for the next.
	 * @param now The frame's time.
	 */
	function tick(now: number): void {
		if (now < landsAt) frame = clock.requestFrame(tick);
		else onLanded();
	}
	frame = clock.requestFrame(tick);
	return () => {
		clock.cancelFrame(frame);
	};
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
	drawing: MovingPicture,
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
	readonly drawing: MovingPicture;
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

/** How long each way of arriving takes to move into place. */
const ARRIVAL_MS = { carried: PICTURE_MS.transition, entered: PICTURE_MS.entry, cut: null };

/**
 * How a picture arrives.
 * @param next What to show, where, and how it may move.
 * @returns Carried from the last one, entered part by part when there is
 * nothing to carry it from, or cut to.
 */
function arrivalOf(next: NextPicture): keyof typeof ARRIVAL_MS {
	const { surface, last, drawing, reducedMotion } = next;
	if (carriesOn(last, surface, drawing, next)) return "carried";
	return entersAfresh(last, surface, drawing, reducedMotion) ? "entered" : "cut";
}

/**
 * Tell the stage how a picture arrives.
 * @param next What to show, where, and how it may move.
 * @param shift How far the shared cards moved.
 * @returns How long it takes to move into place, or null for a cut.
 */
function arrive(next: NextPicture, shift: Shift): number | null {
	const { surface, drawing, heading, seenAt } = next;
	const stage = stageOf(surface);
	const arrival = arrivalOf(next);
	if (arrival === "carried") stage?.carry(drawing.painting, shift);
	else if (arrival === "entered") {
		stage?.enter(drawing.painting, heading, movedSince(seenAt, surface));
	} else stage?.show(drawing.painting);
	return ARRIVAL_MS[arrival];
}

/**
 * Put the next picture on the surface. A picture of the same board tells the
 * camera how far the shared cards moved before anything is painted.
 * @param next What to show, where, and how it may move.
 * @param onLanded What to do once a flight has landed.
 * @returns The flight, or null for a cut.
 */
function showPicture(next: NextPicture, onLanded: () => void): Flight | null {
	const { surface, last, drawing, keepStill } = next;
	const shift = shiftFrom(last, surface, drawing, next.presenting === true);
	if (shift !== undefined) keepStill(shift);
	stagePicture(surface, drawing);
	const duration = arrive(next, shift ?? NO_SHIFT);
	return duration === null ? null : fly(duration, onLanded);
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
 * Whether a surface already shows a picture.
 * @param last What the surface was last given, if anything.
 * @param surface The surface.
 * @param drawing The picture.
 * @returns True when nothing on the surface would change.
 */
function standsOn(last: Shown | null, surface: HTMLElement, drawing: MovingPicture): boolean {
	return last?.surface === surface && last.drawing.svg === drawing.svg;
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
	drawing: MovingPicture,
	motion: PictureMotion,
): StagedPicture | null {
	const { reducedMotion, keepStill } = motion;
	const heading = motion.heading ?? null;
	const presenting = motion.presenting === true;
	// A picture a flight arrived at moves nowhere: it is put up as it is, as for a reader who asked for no motion.
	const still = reducedMotion || motion.cut === true;
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
		if (surface === null) return;
		if (standsOn(last, surface, drawing)) {
			shown.current = { surface, drawing };
			return;
		}
		// A picture arriving mid-flight stops the wait for the last one. The stage
		// carries on from what shows, so the reader sees no jump.
		flight.current?.();
		shown.current = { surface, drawing };
		const next = {
			surface,
			last,
			drawing,
			reducedMotion: still,
			keepStill,
			heading,
			presenting,
			seenAt: seen.current,
		};
		flight.current = showPicture(next, () => {
			flight.current = null;
			surface.toggleAttribute(PICTURE_MOTION_ATTRIBUTE, false);
		});
		surface.toggleAttribute(PICTURE_MOTION_ATTRIBUTE, flight.current !== null);
		publish(store.current, surface);
	}, [surface, drawing, still, keepStill, heading, presenting]);
	// Where the pane is after every commit, so the next picture knows where the
	// last one was seen. After the picture is written, and read only when motion
	// is allowed: nothing else needs it.
	useLayoutEffect(() => {
		seen.current = reducedMotion ? null : paneAt(surface);
	});
	// Leaving the surface stops waiting; what it showed does not matter any more.
	useLayoutEffect(
		() => (): void => {
			flight.current?.();
			flight.current = null;
		},
		[],
	);
	return picture;
}

export { PICTURE_MOTION_ATTRIBUTE, usePictureTransition, type PictureMotion, type StagedPicture };
