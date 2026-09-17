// The camera as one pane's state: what it is, and the three ways it moves.
//
// The state lives here rather than in the stage so that a refetch cannot
// disturb it. A new drawing arriving is a new prop, not a new component, and
// this hook holds nothing derived from the drawing's content — so a board that
// changes under somebody leaves them looking exactly where they were. That is
// also why a fit is told the diagram's size rather than remembering it: the
// camera knows where the person is looking and nothing about what they see.

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

import { useCameraGlide } from "@/ui/semantic-board-canvas/hooks/use-camera-glide";
import {
	IDENTITY_CAMERA,
	ZOOM_STEP,
	cameraFor,
	panCamera,
	zoomCameraAbout,
	type Camera,
	type FitTarget,
	type Size,
} from "@/ui/semantic-board-canvas/lib/camera";

/** How a person moves the camera, and where it is now. */
interface BoardCamera {
	/** Where the pane is looking. */
	readonly camera: Camera;
	/**
	 * How big the window on the diagram is, or null before the stage has been
	 * laid out. A caller that wants to fit something watches this: the first
	 * paint of a pane can happen before it has a size, and a fit computed then
	 * would be a fit to nothing.
	 */
	readonly room: Size | null;
	/** Attach the viewport: the window the diagram is seen through. */
	readonly attachViewport: (element: HTMLElement | null) => void;
	/**
	 * Move the diagram.
	 * @param dx How far right, in viewport pixels.
	 * @param dy How far down, in viewport pixels.
	 */
	readonly panBy: (dx: number, dy: number) => void;
	/**
	 * Zoom about the middle of the viewport, which is where a keypress means.
	 * @param direction 1 to come closer, -1 to pull back.
	 */
	readonly zoomCentre: (direction: number) => void;
	/**
	 * Show the whole diagram, or one region of it, centred.
	 * @param target What to show: the whole diagram, or a region of it.
	 * @param instant Land at once rather than easing there: a fit the pane makes for a
	 * picture it has only just put up, where an eased move would show the picture sliding into place.
	 * @returns False when the stage has not been laid out yet, and nothing moved.
	 */
	readonly fit: (target: FitTarget, instant?: boolean) => boolean;
	/**
	 * Whether the person has moved the camera themselves since the last fit.
	 *
	 * What it is for: a stage keeps fitting itself while nobody has said where
	 * to look, and stops the moment somebody does. Without it a pane that is
	 * widened would either throw away the person's camera or stay fitted to a
	 * size it no longer has.
	 * @returns True once a pan or a zoom has happened.
	 */
	readonly handled: () => boolean;
	/**
	 * Move with the picture: when the next picture of a board places the cards
	 * the last one shared elsewhere on its page, the camera moves by as much,
	 * at once, so those cards stay where the reader was looking. Nobody moved
	 * the camera, so this hands nothing back and leaves a fit free to happen.
	 * @param shift How far the shared cards moved, in picture units.
	 * @param shift.x Across.
	 * @param shift.y Down.
	 */
	readonly followPicture: (shift: { readonly x: number; readonly y: number }) => void;
	/** Whether the last move was one that must land at once, rather than be eased. */
	readonly instant: boolean;
	/**
	 * Glide to a fit or to a camera along a path that pulls back to cross a long
	 * distance, and land there. Nobody moved the camera, so a fit stays free to
	 * happen unless the glide is giving a person back the camera they had.
	 * @param to What to show, or the camera to return to.
	 * @param duration How long, in milliseconds; zero lands at once.
	 * @param handledAfter Whether the camera counts as the person's once it lands.
	 * @returns False when the stage has not been laid out yet, and nothing moved.
	 */
	readonly glide: (to: FitTarget | Camera, duration: number, handledAfter?: boolean) => boolean;
	/**
	 * Keep the bottom of the viewport clear of what a fit shows, for something
	 * laid over it there.
	 * @param bottom How many pixels to keep clear; zero for none.
	 */
	readonly reserve: (bottom: number) => void;
}

/**
 * The most of a viewport's height a reserve may keep clear: past this, what the
 * reserve is for would be crowding out the picture it is laid over.
 */
const MOST_RESERVED = 0.4;

/**
 * The part of a viewport a fit may use, once the reserve at its bottom is kept clear.
 * @param size The viewport's size, or null.
 * @param bottom The reserve.
 * @returns The usable size, or null before the viewport has one.
 */
function usable(size: Size | null, bottom: number): Size | null {
	if (size === null || bottom <= 0) {
		return size;
	}
	return { width: size.width, height: size.height - Math.min(bottom, size.height * MOST_RESERVED) };
}

/**
 * Where a glide is going: a fit worked out for the room, or a camera as given.
 * @param size The room, or null before there is one.
 * @param to A fit, or a camera.
 * @returns The camera to land at, or null when it cannot be worked out yet.
 */
function destinationIn(size: Size | null, to: FitTarget | Camera): Camera | null {
	if (size === null) {
		return null;
	}
	return "kind" in to ? cameraFor(size, to) : to;
}

/**
 * The element a viewport's camera moves.
 * @param viewport The viewport, or null.
 * @returns The surface, or null when there is none.
 */
function surfaceIn(viewport: HTMLElement | null): HTMLElement | null {
	return viewport?.querySelector<HTMLElement>("[data-slot='semantic-board-surface']") ?? null;
}

/**
 * How big an element is right now, or nothing before it is laid out.
 * @param element The element.
 * @returns Its size, or null when it has none yet.
 */
function sizeOf(element: HTMLElement | null): Size | null {
	if (element === null) {
		return null;
	}
	const box = element.getBoundingClientRect();
	return box.width > 0 && box.height > 0 ? { width: box.width, height: box.height } : null;
}

/**
 * Whether two sizes are the same, so a resize that changed nothing is not news.
 * @param one A size, or none.
 * @param other Another size, or none.
 * @returns True when they are the same size.
 */
function sameSize(one: Size | null, other: Size | null): boolean {
	return one?.width === other?.width && one?.height === other?.height;
}

/**
 * Where in the viewport a wheel event happened.
 * @param element The viewport.
 * @param event The event.
 * @returns The point, relative to the viewport's top left.
 */
function pointIn(element: HTMLElement, event: WheelEvent): readonly [number, number] {
	const box = element.getBoundingClientRect();
	return [event.clientX - box.left, event.clientY - box.top];
}

/**
 * The camera for one diagram.
 * @returns The camera and the ways it moves.
 */
function useBoardCamera(): BoardCamera {
	const [camera, setCamera] = useState<Camera>(IDENTITY_CAMERA);
	const [instant, setInstant] = useState(false);
	const [viewport, setViewport] = useState<HTMLElement | null>(null);
	const [measured, setRoom] = useState<Size | null>(null);
	const [bottom, setBottom] = useState(0);
	const room = useMemo(() => usable(measured, bottom), [measured, bottom]);
	const flight = useCameraGlide();
	// Where the camera is, for a glide to start from; read after commit.
	const at = useRef<Camera>(camera);
	useLayoutEffect(() => {
		at.current = camera;
	}, [camera]);
	/** Stop a glide where it is drawn, so whatever moves next starts from what was seen. */
	const settle = useCallback((): void => {
		const stopped = flight.stop();
		if (stopped !== null) {
			setCamera(stopped);
		}
	}, [flight]);
	// Whether the person has said where to look since the last fit. A ref rather
	// than state: nothing is drawn from it, and it must be true for the very next
	// gesture rather than for the next render.
	const moved = useRef(false);

	// A pane can paint before it has been laid out, and a stage that fitted to
	// nothing then would stay unfitted for as long as nobody touched it. So the
	// size is watched rather than read once: the moment the stage has one, the
	// caller's fit can happen.
	// Measured before paint, so a fit made for the first picture lands before it is seen.
	useLayoutEffect(() => {
		const element = viewport;
		if (element === null) {
			return undefined;
		}
		/** Take the viewport's size, when it is a size it did not have before. */
		function measure(): void {
			const next = sizeOf(element);
			setRoom((current) => (sameSize(current, next) ? current : next));
		}
		measure();
		if (typeof ResizeObserver !== "function") {
			return undefined;
		}
		const observer = new ResizeObserver(measure);
		observer.observe(element);
		return (): void => observer.disconnect();
	}, [viewport]);

	const panBy = useCallback(
		(dx: number, dy: number): void => {
			settle();
			moved.current = true;
			setInstant(false);
			setCamera((current) => panCamera(current, dx, dy));
		},
		[settle],
	);

	const zoomCentre = useCallback(
		(direction: number): void => {
			const size = usable(sizeOf(viewport), bottom);
			if (size === null) {
				return;
			}
			settle();
			const factor = direction > 0 ? ZOOM_STEP : 1 / ZOOM_STEP;
			moved.current = true;
			setInstant(false);
			setCamera((current) => zoomCameraAbout(current, factor, size.width / 2, size.height / 2));
		},
		[viewport, bottom, settle],
	);

	const fit = useCallback(
		(target: FitTarget, atOnce = false): boolean => {
			const size = usable(sizeOf(viewport), bottom);
			const fitted = size === null ? null : cameraFor(size, target);
			if (fitted === null) {
				return false;
			}
			flight.stop();
			// A fit is the stage saying where to look, so it hands the camera back.
			moved.current = false;
			setInstant(atOnce);
			setCamera(fitted);
			return true;
		},
		[viewport, bottom, flight],
	);

	const glide = useCallback(
		(to: FitTarget | Camera, duration: number, handledAfter = false): boolean => {
			const size = usable(sizeOf(viewport), bottom);
			const destination = destinationIn(size, to);
			const surface = surfaceIn(viewport);
			if (size === null || destination === null || surface === null) {
				return false;
			}
			const from = flight.stop() ?? at.current;
			moved.current = handledAfter;
			setInstant(true);
			flight.start(from, destination, {
				duration,
				viewport: size,
				surface,
				land: setCamera,
			});
			return true;
		},
		[viewport, bottom, flight],
	);

	const reserve = useCallback((pixels: number): void => {
		setBottom(Math.max(0, Math.round(pixels)));
	}, []);

	// The wheel is listened for natively because a zoom has to stop the page
	// from scrolling, and React's own wheel listener is passive.
	useEffect(() => {
		const element = viewport;
		if (element === null) {
			return undefined;
		}
		/**
		 * Zoom about the pointer.
		 * @param event The wheel event.
		 */
		function onWheel(event: WheelEvent): void {
			if (element === null) {
				return;
			}
			event.preventDefault();
			settle();
			const [x, y] = pointIn(element, event);
			const factor = event.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP;
			moved.current = true;
			setInstant(false);
			setCamera((current) => zoomCameraAbout(current, factor, x, y));
		}
		element.addEventListener("wheel", onWheel, { passive: false });
		return (): void => element.removeEventListener("wheel", onWheel);
	}, [viewport, settle]);

	const handled = useCallback((): boolean => moved.current, []);
	const followPicture = useCallback((shift: { readonly x: number; readonly y: number }): void => {
		if (shift.x === 0 && shift.y === 0) return;
		setInstant(true);
		// Known at once, not only after the commit: a glide asked for in the same
		// commit starts from where the camera follows to, not from where it was.
		const current = at.current;
		const followed = panCamera(current, shift.x * current.scale, shift.y * current.scale);
		at.current = followed;
		setCamera(followed);
	}, []);
	return useMemo(
		() => ({
			camera,
			room,
			attachViewport: setViewport,
			panBy,
			zoomCentre,
			fit,
			handled,
			followPicture,
			instant,
			glide,
			reserve,
		}),
		[camera, room, panBy, zoomCentre, fit, handled, followPicture, instant, glide, reserve],
	);
}

export { useBoardCamera, type BoardCamera };
