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
	stagePicture,
	transitionPicture,
	type PictureTransition,
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
 * @returns The picture as it is now on the surface, a new value each time the
 * markup was written, for whatever marks that markup up to run again over it.
 */
function usePictureTransition(
	surface: HTMLElement | null,
	drawing: SemanticDrawing,
	reducedMotion: boolean,
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
		if (surface === null || (last?.surface === surface && last.drawing === drawing)) {
			return;
		}
		// A picture arriving mid-flight lands the flight first, so the surface
		// is showing exactly the picture the new transition is told it is.
		land(flight.current);
		flight.current = null;
		shown.current = { surface, drawing };
		const from = carriedFrom(last, surface, drawing, reducedMotion);
		if (from === null) {
			stagePicture(surface, drawing.svg);
			publish(store.current, surface);
			return;
		}
		flight.current = fly(transitionPicture(surface, from, drawing), () => {
			flight.current = null;
			publish(store.current, surface);
		});
		publish(store.current, surface);
	}, [surface, drawing, reducedMotion]);
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
