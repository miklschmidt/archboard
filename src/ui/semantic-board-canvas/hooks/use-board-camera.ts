// The camera as one pane's state: what it is, and the three ways it moves.
//
// The state lives here rather than in the stage so that a refetch cannot
// disturb it. A new drawing arriving is a new prop, not a new component, and
// this hook holds nothing derived from the drawing's content — so a board that
// changes under somebody leaves them looking exactly where they were. That is
// also why a fit is told the diagram's size rather than remembering it: the
// camera knows where the person is looking and nothing about what they see.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

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
	 * @returns False when the stage has not been laid out yet, and nothing moved.
	 */
	readonly fit: (target: FitTarget) => boolean;
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
	const [viewport, setViewport] = useState<HTMLElement | null>(null);
	const [room, setRoom] = useState<Size | null>(null);
	// Whether the person has said where to look since the last fit. A ref rather
	// than state: nothing is drawn from it, and it must be true for the very next
	// gesture rather than for the next render.
	const moved = useRef(false);

	// A pane can paint before it has been laid out, and a stage that fitted to
	// nothing then would stay unfitted for as long as nobody touched it. So the
	// size is watched rather than read once: the moment the stage has one, the
	// caller's fit can happen.
	useEffect(() => {
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

	const panBy = useCallback((dx: number, dy: number): void => {
		moved.current = true;
		setCamera((current) => panCamera(current, dx, dy));
	}, []);

	const zoomCentre = useCallback(
		(direction: number): void => {
			const size = sizeOf(viewport);
			if (size === null) {
				return;
			}
			const factor = direction > 0 ? ZOOM_STEP : 1 / ZOOM_STEP;
			moved.current = true;
			setCamera((current) => zoomCameraAbout(current, factor, size.width / 2, size.height / 2));
		},
		[viewport],
	);

	const fit = useCallback(
		(target: FitTarget): boolean => {
			const size = sizeOf(viewport);
			const fitted = size === null ? null : cameraFor(size, target);
			if (fitted === null) {
				return false;
			}
			// A fit is the stage saying where to look, so it hands the camera back.
			moved.current = false;
			setCamera(fitted);
			return true;
		},
		[viewport],
	);

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
			const [x, y] = pointIn(element, event);
			const factor = event.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP;
			moved.current = true;
			setCamera((current) => zoomCameraAbout(current, factor, x, y));
		}
		element.addEventListener("wheel", onWheel, { passive: false });
		return (): void => element.removeEventListener("wheel", onWheel);
	}, [viewport]);

	const handled = useCallback((): boolean => moved.current, []);
	return useMemo(
		() => ({ camera, room, attachViewport: setViewport, panBy, zoomCentre, fit, handled }),
		[camera, room, panBy, zoomCentre, fit, handled],
	);
}

export { useBoardCamera, type BoardCamera };
