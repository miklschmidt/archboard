import { useContext, useLayoutEffect, useRef } from "react";
import { PRESENTATION_MS } from "@archboard/timing";
import type { PictureCamera } from "#ui/architecture-drawing/canvas/picture/camera/hooks/use-picture-camera.ts";
import {
	ModelPaneContext,
	type CameraHandover,
} from "#ui/state/architecture-model/presentation.ts";

/**
 * Carry the camera between the reader and a presentation of one legacy board. Each has its own
 * surface and keeps its own camera, so the one that comes into sight starts where the
 * other stood and glides to its own rest. Another legacy board has no such correspondence,
 * and the change stays plain.
 * @param camera The camera of this surface.
 * @param model The legacy board on this surface.
 * @param reducedMotion Whether the person asked for no motion.
 */
function useCameraHandover(camera: PictureCamera, model: string, reducedMotion: boolean): void {
	const handover = useContext(ModelPaneContext)?.handover ?? null;
	const measured = camera.room !== null;
	const leaves = useRef({ model, camera });
	useLayoutEffect(() => {
		leaves.current = { model, camera };
	}, [model, camera]);
	// Only going out of sight runs this cleanup: a new camera object is the same camera.
	useLayoutEffect(
		() => () => {
			const left = leaves.current;
			handover?.give({ model: left.model, camera: left.camera.view().camera });
		},
		[handover],
	);
	useLayoutEffect(() => {
		if (measured && handover !== null && !reducedMotion) {
			startFrom(handover, leaves.current.model, camera);
		}
	}, [camera, handover, measured, reducedMotion]);
}

/**
 * Start from the camera another surface left, when it stood on this legacy board.
 * @param handover The pane's handover.
 * @param model The legacy board on this surface.
 * @param camera The camera of this surface.
 */
function startFrom(handover: CameraHandover, model: string, camera: PictureCamera): void {
	const left = handover.take();
	if (left?.model !== model) return;
	const { rest } = camera.view();
	const handled = camera.handled();
	if (camera.glide(left.camera, 0, handled)) camera.glide(rest, PRESENTATION_MS.step, handled);
	else handover.give(left);
}

export { useCameraHandover };
