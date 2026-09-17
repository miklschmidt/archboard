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

import { PICTURE_TRANSITION_MS } from "@/shared/timing/timing";
import type { SemanticDrawing } from "@/ui/semantic-board-canvas/api/semantic-boards";
import {
	continuousPictures,
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
 * @returns True when the two are pictures of one board read one way, and differ.
 */
function carriedOn(last: SemanticDrawing, next: SemanticDrawing): boolean {
	return last.svg !== next.svg && continuousPictures(last, next);
}

/**
 * The picture the next one is carried from, when it is carried rather than cut to.
 * @param last What the surface was last given, if anything.
 * @param surface The surface the picture goes on.
 * @param drawing The picture.
 * @param reducedMotion Whether the person asked for no motion.
 * @returns The last picture, or null when this one is simply shown.
 */
function carriedFrom(
	last: Shown | null,
	surface: HTMLElement,
	drawing: SemanticDrawing,
	reducedMotion: boolean,
): SemanticDrawing | null {
	if (last?.surface !== surface || reducedMotion || !canAnimate()) {
		return null;
	}
	return carriedOn(last.drawing, drawing) ? last.drawing : null;
}

/**
 * Drive a transition from now to its end, one frame at a time.
 * @param transition The transition.
 * @param onLanded What to do once it has finished.
 * @returns The flight, with the way to stop it.
 */
function fly(transition: PictureTransition, onLanded: () => void): Flight {
	const started = performance.now();
	let frame = 0;
	/**
	 * Draw one frame, and ask for the next until the last.
	 * @param now The frame's time.
	 */
	function tick(now: number): void {
		const progress = (now - started) / PICTURE_TRANSITION_MS;
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
 * @returns The shift, or nothing when the next picture is another board or reading.
 */
function shiftFrom(
	last: Shown | null,
	surface: HTMLElement,
	drawing: SemanticDrawing,
): Shift | undefined {
	return last?.surface === surface && carriedOn(last.drawing, drawing)
		? sharedShift(last.drawing, drawing)
		: undefined;
}

/**
 * Put the next picture on the surface: cut to it, or carry the last one into
 * it. Either way, a picture of the same board tells the camera how far the
 * shared cards moved before anything is painted.
 * @param next What to show and how.
 * @param next.surface The surface.
 * @param next.last What the surface was showing, if anything.
 * @param next.drawing The picture.
 * @param next.reducedMotion Whether the person asked for no motion.
 * @param next.keepStill Told how far the shared cards moved.
 * @param onLanded What to do once a flight has landed.
 * @returns The flight, or null for a cut.
 */
function showPicture(
	next: {
		surface: HTMLElement;
		last: Shown | null;
		drawing: SemanticDrawing;
		reducedMotion: boolean;
		keepStill: (shift: Shift) => void;
	},
	onLanded: () => void,
): Flight | null {
	const { surface, last, drawing, reducedMotion, keepStill } = next;
	const shift = shiftFrom(last, surface, drawing);
	const from = carriedFrom(last, surface, drawing, reducedMotion);
	const flight =
		from === null ? null : fly(transitionPicture(surface, from, drawing, shift), onLanded);
	if (from === null) stagePicture(surface, drawing.svg);
	if (shift !== undefined) keepStill(shift);
	return flight;
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
 * @param reducedMotion Whether the person asked for no motion; then every picture is a cut.
 * @param keepStill Told, before the next picture of the same board is first
 * painted, how far the cards the two share moved on the page, so the camera can
 * move with them and keep them where the reader was looking.
 * @returns The picture as it is now on the surface, a new value each time the
 * markup was written, for whatever marks that markup up to run again over it.
 */
function usePictureTransition(
	surface: HTMLElement | null,
	drawing: SemanticDrawing,
	reducedMotion: boolean,
	keepStill: (shift: Shift) => void,
): StagedPicture | null {
	const shown = useRef<Shown | null>(null);
	const flight = useRef<Flight | null>(null);
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
		flight.current = showPicture({ surface, last, drawing, reducedMotion, keepStill }, () => {
			flight.current = null;
			publish(store.current, surface);
		});
		publish(store.current, surface);
	}, [surface, drawing, reducedMotion, keepStill]);
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

export { usePictureTransition, type StagedPicture };
