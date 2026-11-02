import { useContext, useLayoutEffect, useRef } from "react";
import { PRESENTATION_MS } from "@archboard/timing";
import type { BoardCamera } from "#ui/hooks/canvas/use-picture-camera.ts";
import {
	ModelPaneContext,
	type CameraHandover,
} from "#ui/state/architecture-model/presentation.ts";

/**
 * Carry the camera between the reader and a presentation of one board. Each has its own
 * surface and keeps its own camera, so the one that comes into sight starts where the
 * other stood and glides to its own rest. Another board has no such correspondence,
 * and the change stays plain.
 * @param camera The camera of this surface.
 * @param board The board on this surface.
 * @param reducedMotion Whether the person asked for no motion.
 */
function useCameraHandover(camera: BoardCamera, board: string, reducedMotion: boolean): void {
	const handover = useContext(ModelPaneContext)?.handover ?? null;
	const measured = camera.room !== null;
	const leaves = useRef({ board, camera });
	useLayoutEffect(() => {
		leaves.current = { board, camera };
	}, [board, camera]);
	// Only going out of sight runs this cleanup: a new camera object is the same camera.
	useLayoutEffect(
		() => () => {
			const left = leaves.current;
			handover?.give({ board: left.board, camera: left.camera.view().camera });
		},
		[handover],
	);
	useLayoutEffect(() => {
		if (measured && handover !== null && !reducedMotion) {
			startFrom(handover, leaves.current.board, camera);
		}
	}, [camera, handover, measured, reducedMotion]);
}

/**
 * Start from the camera another surface left, when it stood on this board.
 * @param handover The pane's handover.
 * @param board The board on this surface.
 * @param camera The camera of this surface.
 */
function startFrom(handover: CameraHandover, board: string, camera: BoardCamera): void {
	const left = handover.take();
	if (left?.board !== board) return;
	const { rest } = camera.view();
	const handled = camera.handled();
	if (camera.glide(left.camera, 0, handled)) camera.glide(rest, PRESENTATION_MS.step, handled);
	else handover.give(left);
}

export { useCameraHandover };
