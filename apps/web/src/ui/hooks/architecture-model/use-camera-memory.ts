import { useCallback, useLayoutEffect, useRef } from "react";
import type { HeldCamera } from "#ui/hooks/semantic-board-canvas/use-auto-fit.ts";
import type { BoardCamera } from "#ui/hooks/semantic-board-canvas/use-board-camera.ts";
import type { AcceptedScene } from "#ui/rules/architecture-model/scene.ts";

/**
 * Remember where the camera stood on each history entry, so Back and Forward
 * return it. The entry is the memory's key because Up, Back and a new visit to
 * one module are different moves: only a move through history finds a camera here.
 * @param camera The pane's camera.
 * @param scene The accepted scene.
 * @returns What to ask for the camera of the entry the scene now lives in.
 */
function useCameraMemory(camera: BoardCamera, scene: AcceptedScene): () => HeldCamera | null {
	const memory = useRef(new Map<string, HeldCamera>());
	const entry = useRef(scene.entry);
	useLayoutEffect(() => {
		const left = entry.current;
		entry.current = scene.entry;
		if (left === undefined || left === scene.entry) return;
		// A flight holds the rest at its takeoff, which is the camera the reader had.
		const { moving, camera: drawn, rest } = camera.view();
		memory.current.set(left, { camera: moving ? drawn : rest, handled: camera.handled() });
	}, [camera, scene.entry]);
	return useCallback(() => {
		const held = entry.current === undefined ? undefined : memory.current.get(entry.current);
		return held ?? null;
	}, []);
}

export { useCameraMemory };
