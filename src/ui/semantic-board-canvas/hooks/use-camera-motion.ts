// Driving a camera's zooms, eases and thrown drags, one frame at a time.
//
// The loop runs only while the camera is moving: a wheel starts it, rest ends
// it, and an idle page carries no timer (TASK-385). Each frame is drawn through
// the camera's store, so everything that listens to the camera, the far view
// included, hears the camera as it is drawn and not only where it will land.
// It runs on the frame clock, like every glide, so a stepped clock can drive it.
//
// A person who asked for reduced motion gets none of it: a zoom or a move lands
// at once and a thrown drag stops where it is let go.

import { useCallback, useEffect, useMemo, useRef } from "react";

import { EXPLORING_MS } from "@/shared/timing/timing";
import { frameClock } from "@/ui/frame-clock";
import { panCamera, zoomCameraAbout, type Camera } from "@/ui/semantic-board-canvas/lib/camera";
import {
	STILL,
	easeMotion,
	flingMotion,
	stepMotion,
	zoomMotion,
	type Motion,
	type Pair,
} from "@/ui/semantic-board-canvas/lib/camera-motion";

/** Where the camera is drawn, and how to draw it somewhere else. */
interface CameraStage {
	/**
	 * Where the camera is drawn now.
	 * @returns The camera.
	 */
	readonly read: () => Camera;
	/**
	 * Draw the camera somewhere.
	 * @param camera Where.
	 * @param instant Whether the surface lands there at once, rather than easing there itself.
	 * @param byHand Whether a hand is still moving the camera: a wheel or a key, and not a
	 * thrown drag coasting on after the hand let go of it.
	 */
	readonly draw: (camera: Camera, instant: boolean, byHand: boolean) => void;
}

/** The moves of a camera that run over many frames. */
interface CameraMotion {
	/**
	 * Zoom about a point of the viewport, on top of any zoom under way.
	 * @param factor How much to magnify by; above 1 comes closer.
	 * @param at The point of the viewport that holds still.
	 */
	readonly zoomAt: (factor: number, at: Pair) => void;
	/**
	 * Move the diagram under the viewport, on top of any move under way.
	 * @param dx How far across, in viewport pixels.
	 * @param dy How far down, in viewport pixels.
	 */
	readonly ease: (dx: number, dy: number) => void;
	/**
	 * Carry on at the speed a drag was let go at.
	 * @param speed How fast, in pixels per millisecond.
	 */
	readonly fling: (speed: Pair) => void;
	/** Stop where the camera is drawn, so whatever moves next starts from what was seen. */
	readonly halt: () => void;
}

/**
 * The frame loop behind a camera's zooms, eases and thrown drags.
 * @param stage Where the camera is drawn.
 * @param reducedMotion Whether the person asked for no motion.
 * @returns How to start a move, and how to stop one.
 */
function useCameraMotion(stage: CameraStage, reducedMotion: boolean): CameraMotion {
	const motion = useRef<Motion | null>(null);
	const frame = useRef<number | null>(null);
	const lastAt = useRef(0);

	const halt = useCallback((): void => {
		if (frame.current !== null) {
			frameClock().cancelFrame(frame.current);
			frame.current = null;
		}
		motion.current = null;
	}, []);

	const run = useCallback(
		(next: Motion): void => {
			motion.current = next;
			if (frame.current !== null) {
				return;
			}
			const clock = frameClock();
			lastAt.current = clock.now();
			/**
			 * Draw one frame, and ask for the next while the camera is still moving.
			 * @param now The frame's time.
			 */
			function tick(now: number): void {
				frame.current = null;
				const current = motion.current;
				if (current === null) {
					return;
				}
				const dt = Math.min(EXPLORING_MS.cameraFrameLongest, Math.max(0, now - lastAt.current));
				lastAt.current = now;
				const stepped = stepMotion(stage.read(), current, dt);
				motion.current = stepped.motion;
				stage.draw(stepped.camera, true, current.fling === null);
				if (stepped.motion !== null) {
					frame.current = clock.requestFrame(tick);
				}
			}
			frame.current = clock.requestFrame(tick);
		},
		[stage],
	);

	// A camera that goes away takes its frame with it.
	useEffect(() => halt, [halt]);

	const zoomAt = useCallback(
		(factor: number, at: Pair): void => {
			if (reducedMotion || !frameClock().animates) {
				stage.draw(zoomCameraAbout(stage.read(), factor, at.x, at.y), false, true);
				return;
			}
			const before = motion.current ?? STILL;
			const next = zoomMotion(stage.read(), before, factor, at);
			if (next !== before) {
				run(next);
			}
		},
		[reducedMotion, run, stage],
	);

	const ease = useCallback(
		(dx: number, dy: number): void => {
			if (reducedMotion || !frameClock().animates) {
				stage.draw(panCamera(stage.read(), dx, dy), false, true);
				return;
			}
			run(easeMotion(motion.current ?? STILL, dx, dy));
		},
		[reducedMotion, run, stage],
	);

	const fling = useCallback(
		(speed: Pair): void => {
			if (!reducedMotion && frameClock().animates) {
				run(flingMotion(speed));
			}
		},
		[reducedMotion, run],
	);

	return useMemo(() => ({ zoomAt, ease, fling, halt }), [zoomAt, ease, fling, halt]);
}

export { useCameraMotion, type CameraMotion, type CameraStage };
