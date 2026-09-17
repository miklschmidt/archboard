// Driving a camera glide, one frame at a time, on the surface itself.
//
// A glide writes the surface's transform directly for as long as it lasts and
// commits the camera to state once, at the end. Committing every frame would
// re-render the whole pane sixty times a second to move one transform. While
// it flies the surface carries `data-camera-motion`, which is how anything
// outside the pane can tell a step has not finished arriving.
//
// A gesture wins: a person who pans or zooms mid-glide stops it where it is,
// and their move starts from what they saw.

import { useCallback, useMemo, useRef } from "react";

import { cameraTransform, type Camera, type Size } from "@/ui/semantic-board-canvas/lib/camera";
import { glidePath } from "@/ui/semantic-board-canvas/lib/camera-glide";
import { easeInOut } from "@/ui/semantic-board-canvas/lib/picture-motion";

/** The attribute a surface carries while the camera is gliding. */
const CAMERA_MOTION_ATTRIBUTE = "data-camera-motion";

/** A glide under way. */
interface Flying {
	frame: number;
	/** Where the camera was drawn on the last frame. */
	at: Camera;
	readonly surface: HTMLElement;
}

/** How a camera glides, and how a glide is stopped. */
interface CameraGlide {
	/**
	 * Glide from one camera to another.
	 * @param from Where the camera is.
	 * @param to Where it is going.
	 * @param move How long, in which viewport, and what to commit at the end.
	 * @param move.duration How long, in milliseconds.
	 * @param move.viewport The viewport the cameras are for.
	 * @param move.surface The element the camera moves.
	 * @param move.land Commit the destination to state.
	 */
	readonly start: (
		from: Camera,
		to: Camera,
		move: {
			readonly duration: number;
			readonly viewport: Size;
			readonly surface: HTMLElement;
			readonly land: (camera: Camera) => void;
		},
	) => void;
	/**
	 * Stop a glide where it is.
	 * @returns Where the camera was drawn when it stopped, or null when nothing was gliding.
	 */
	readonly stop: () => Camera | null;
}

/**
 * Whether this browser can drive a glide at all.
 * @returns True when frames can be asked for.
 */
function canGlide(): boolean {
	return typeof requestAnimationFrame === "function" && typeof performance === "object";
}

/**
 * The frame loop behind a camera's glides.
 * @returns How to start and stop one.
 */
function useCameraGlide(): CameraGlide {
	const flying = useRef<Flying | null>(null);

	const stop = useCallback((): Camera | null => {
		const current = flying.current;
		if (current === null) {
			return null;
		}
		cancelAnimationFrame(current.frame);
		current.surface.removeAttribute(CAMERA_MOTION_ATTRIBUTE);
		current.surface.style.transition = "";
		flying.current = null;
		return current.at;
	}, []);

	const start = useCallback<CameraGlide["start"]>(
		(from, to, move) => {
			stop();
			if (!canGlide() || move.duration <= 0) {
				move.land(to);
				return;
			}
			const path = glidePath(from, to, move.viewport);
			const { surface } = move;
			surface.setAttribute(CAMERA_MOTION_ATTRIBUTE, "");
			// The surface's own short ease is for a keyed move; a glide draws every frame itself.
			surface.style.transition = "none";
			const began = performance.now();
			const glide: Flying = { frame: 0, at: from, surface };
			flying.current = glide;
			/**
			 * Draw one frame of the glide, and land it after the last.
			 * @param now The frame's time.
			 */
			function tick(now: number): void {
				const progress = Math.min(1, (now - began) / move.duration);
				glide.at = path(easeInOut(progress));
				surface.style.transform = cameraTransform(glide.at);
				if (progress < 1) {
					glide.frame = requestAnimationFrame(tick);
					return;
				}
				stop();
				move.land(to);
			}
			glide.frame = requestAnimationFrame(tick);
		},
		[stop],
	);

	return useMemo(() => ({ start, stop }), [start, stop]);
}

export { CAMERA_MOTION_ATTRIBUTE, useCameraGlide, type CameraGlide };
