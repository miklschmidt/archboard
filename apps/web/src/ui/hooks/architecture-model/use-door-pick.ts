import { useCallback } from "react";
import type { AcceptedScene } from "#ui/rules/architecture-model/scene.ts";
import { isOpenDoor } from "#ui/rules/architecture-model/selected-subject.ts";

/**
 * What a press does to a door: one click opens it. A click with Ctrl still selects it, a door that
 * the state no longer holds has nowhere to open, and a presented step opens nothing. The rest of a
 * double click on a door does nothing, so it never ends the flight that its first click started.
 * @param scene The accepted scene.
 * @param open Open a module.
 * @param select Pick a subject out.
 * @returns The pick for the picture, and what a double click opens.
 */
function useDoorPick(
	scene: AcceptedScene,
	open: (id: string | null) => void,
	select: (id: string | null, toggle?: boolean) => void,
) {
	const { projection, presentation } = scene;
	const opens = useCallback(
		(id: string | null): id is string =>
			presentation === undefined && id !== null && isOpenDoor(projection, id),
		[presentation, projection],
	);
	const pick = useCallback(
		(id: string | null, toggle?: boolean, repeated?: boolean): void => {
			if (toggle === true || !opens(id)) select(id, toggle);
			else if (repeated !== true) open(id);
		},
		[opens, open, select],
	);
	const openDown = useCallback(
		(id: string | null): void => {
			if (!opens(id)) open(id);
		},
		[opens, open],
	);
	return { pick, openDown };
}

export { useDoorPick };
