import { useCallback } from "react";
import type { AcceptedScene } from "#ui/rules/architecture-model/scene.ts";
import { isOpenDoor } from "#ui/rules/architecture-model/selected-subject.ts";

/**
 * What a press does to a door: one click opens it. A click on the control that a door or a frame
 * wears expands or collapses it instead. A click with Ctrl still selects, a door that the state no
 * longer holds has nowhere to open, and a presented step opens nothing. The rest of a double click
 * does nothing, so it never ends the flight or the expansion that its first click started.
 * @param scene The accepted scene.
 * @param open Open a module.
 * @param select Pick a subject out.
 * @param onToggle Expand a door or collapse a frame.
 * @returns The pick for the picture, and what a double click opens.
 */
function useDoorPick(
	scene: AcceptedScene,
	open: (id: string | null) => void,
	select: (id: string | null, toggle?: boolean) => void,
	onToggle?: (id: string) => void,
) {
	const { projection, presentation } = scene;
	const opens = useCallback(
		(id: string | null): id is string =>
			presentation === undefined && id !== null && isOpenDoor(projection, id),
		[presentation, projection],
	);
	const pickCard = useCallback(
		(id: string | null, toggle?: boolean, repeated?: boolean): void => {
			if (toggle === true || !opens(id)) select(id, toggle);
			else if (repeated !== true) open(id);
		},
		[opens, open, select],
	);
	const pick = useCallback(
		(id: string | null, toggle?: boolean, repeated?: boolean, control?: boolean): void => {
			if (id === null || control !== true || toggle === true) pickCard(id, toggle, repeated);
			else if (repeated !== true) onToggle?.(id);
		},
		[pickCard, onToggle],
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
