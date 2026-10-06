// Two fingers on a touch screen pinch the picture (TASK-405).
//
// The picture follows the fingers at once, with no ease, as it follows a drag:
// it grows or shrinks by as much as the distance between them did, and the part
// of the diagram midway between them stays midway between them. One finger is a
// press like a mouse's, and becomes a drag or a pick. A second finger turns the
// press into a pinch, which picks nothing. When either finger lifts, the pinch is
// over, and the camera stops where it is drawn.

import { useCallback, useMemo, useRef, type PointerEvent } from "react";

import type { BoardCamera } from "@/ui/semantic-board-canvas/hooks/use-board-camera";
import type { Fingers, Point } from "@/ui/semantic-board-canvas/lib/camera";
import { capturePointer } from "@/ui/semantic-board-canvas/lib/pointer-gesture";

/** The handlers a pinch listens with. Each says whether the event was the pinch's. */
interface TouchPinch {
	/**
	 * A finger went down.
	 * @param event The press.
	 * @returns True when it starts or joins a pinch: the press it joins picks nothing.
	 */
	readonly down: (event: PointerEvent<HTMLElement>) => boolean;
	/**
	 * A finger moved.
	 * @param event The move.
	 * @returns True when it moved a pinch.
	 */
	readonly move: (event: PointerEvent<HTMLElement>) => boolean;
	/**
	 * A finger lifted, or the browser took it away.
	 * @param event The release.
	 * @returns True when it ended a pinch.
	 */
	readonly up: (event: PointerEvent<HTMLElement>) => boolean;
}

/**
 * Where a pointer is in the viewport it is on.
 * @param event The pointer event, on the viewport.
 * @returns The point, from the viewport's top left.
 */
function inViewport(event: PointerEvent<HTMLElement>): Point {
	const box = event.currentTarget.getBoundingClientRect();
	return { x: event.clientX - box.left, y: event.clientY - box.top };
}

/**
 * The two fingers a pinch follows: the first two that went down.
 * @param fingers Every finger on the viewport.
 * @returns The two, or null while fewer than two are down.
 */
function pairOf(fingers: ReadonlyMap<number, Point>): Fingers | null {
	const [first, second] = fingers.values();
	return first === undefined || second === undefined ? null : [first, second];
}

/**
 * Pinch the picture with two fingers.
 * @param camera The camera the pinch moves.
 * @returns The handlers.
 */
function useTouchPinch(camera: Pick<BoardCamera, "pinch" | "stop">): TouchPinch {
	// Where each finger on the viewport is, by its pointer.
	const fingers = useRef(new Map<number, Point>());

	const down = useCallback(
		(event: PointerEvent<HTMLElement>): boolean => {
			if (event.pointerType !== "touch") return false;
			fingers.current.set(event.pointerId, inViewport(event));
			if (fingers.current.size < 2) return false;
			if (fingers.current.size === 2) {
				camera.stop();
				for (const finger of fingers.current.keys()) {
					capturePointer(event.currentTarget, finger, true);
				}
			}
			return true;
		},
		[camera],
	);

	const move = useCallback(
		(event: PointerEvent<HTMLElement>): boolean => {
			const before = pairOf(fingers.current);
			if (before === null || !fingers.current.has(event.pointerId)) return false;
			fingers.current.set(event.pointerId, inViewport(event));
			const after = pairOf(fingers.current);
			if (after !== null) camera.pinch(before, after);
			return true;
		},
		[camera],
	);

	const up = useCallback((event: PointerEvent<HTMLElement>): boolean => {
		const pinching = fingers.current.size >= 2;
		if (!fingers.current.delete(event.pointerId)) return false;
		capturePointer(event.currentTarget, event.pointerId, false);
		return pinching;
	}, []);

	return useMemo(() => ({ down, move, up }), [down, move, up]);
}

export { useTouchPinch, type TouchPinch };
