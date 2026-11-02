import { useCallback, useLayoutEffect, useRef } from "react";
import type { HeldCamera } from "#ui/hooks/canvas/use-auto-fit.ts";
import type { BoardCamera } from "#ui/hooks/canvas/use-picture-camera.ts";
import type { AcceptedScene } from "#ui/rules/architecture-model/scene.ts";

/**
 * Where a camera is remembered: under the history entry, because Up, Back and a new visit to one
 * module are different moves and only a move through history finds a camera here, and under the
 * engine, because each engine draws its own picture of that entry.
 * @param scene The accepted scene.
 * @returns The key, or nothing for a scene in no entry.
 */
function placeOf(scene: AcceptedScene): string | undefined {
	return scene.entry === undefined ? undefined : `${scene.entry} ${scene.layout}`;
}

/**
 * Remember where the camera stood on each history entry, so Back and Forward return it.
 * @param camera The pane's camera.
 * @param scene The accepted scene.
 * @returns What to ask for the camera of the entry the scene now lives in.
 */
function useCameraMemory(camera: BoardCamera, scene: AcceptedScene): () => HeldCamera | null {
	const memory = useRef(new Map<string, HeldCamera>());
	const place = placeOf(scene);
	const entry = useRef(place);
	useLayoutEffect(() => {
		const left = entry.current;
		entry.current = place;
		if (left === undefined || left === place) return;
		// A flight holds the rest at its takeoff, which is the camera the reader had.
		const { moving, camera: drawn, rest } = camera.view();
		memory.current.set(left, { camera: moving ? drawn : rest, handled: camera.handled() });
	}, [camera, place]);
	return useCallback(() => {
		const held = entry.current === undefined ? undefined : memory.current.get(entry.current);
		return held ?? null;
	}, []);
}

export { useCameraMemory };
