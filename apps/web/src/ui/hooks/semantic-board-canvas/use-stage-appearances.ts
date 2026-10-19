// What the picture a pane shows draws each kind of subject with, for the key in
// its sidebar and the inspector's account of a selection.

import { useMemo } from "react";

import type { SemanticDrawing } from "#ui/clients/semantic-board-canvas/reads/semantic-boards.ts";
import type { Leaving } from "#ui/hooks/semantic-board-canvas/use-departure.ts";
import { pictureAppearances, type AppliedAppearance } from "@archboard/renderer/picture";

/** The key to a pane with no picture yet: nothing drawn, nothing to explain. */
const NO_APPEARANCES: ReadonlyMap<string, AppliedAppearance> = new Map();

/**
 * The appearances of the picture on screen, or of the one on its way out while
 * the next board is drawn, so the key does not empty for the length of a request.
 * @param drawn The picture on screen, or null.
 * @param leaving The picture leaving, or null.
 * @returns The appearances, empty before anything has been drawn.
 */
function useStageAppearances(
	drawn: SemanticDrawing | null,
	leaving: Leaving | null,
): ReadonlyMap<string, AppliedAppearance> {
	const pictured = drawn ?? leaving?.drawing;
	return useMemo(
		() => (pictured === undefined ? NO_APPEARANCES : pictureAppearances(pictured.svg)),
		[pictured],
	);
}

export { useStageAppearances };
