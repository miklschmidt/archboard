// What the picture a pane shows draws each kind of subject with, for the key in
// its sidebar and the inspector's account of a selection. The renderer core
// read both off the picture it drew, and they arrive with it.

import { useMemo } from "react";

import type { AppliedAppearance, PictureKey } from "@archboard/board/render-reply";
import type { SemanticDrawing } from "#ui/clients/semantic-board-canvas/reads/semantic-boards.ts";
import type { Leaving } from "#ui/hooks/semantic-board-canvas/use-departure.ts";

/** What the picture on screen draws each subject with, and the key that lists its kinds. */
interface StageAppearances {
	/** How each subject is drawn, by id, in drawing order. */
	readonly appearances: ReadonlyMap<string, AppliedAppearance>;
	/** What the key lists, or null while nothing typed is drawn. */
	readonly key: PictureKey | null;
}

/** A pane with no picture yet: nothing drawn, nothing to explain. */
const NOTHING_DRAWN: StageAppearances = { appearances: new Map(), key: null };

/**
 * The appearances and key of the picture on screen, or of the one on its way
 * out while the next board is drawn, so the key does not empty for the length
 * of a request.
 * @param drawn The picture on screen, or null.
 * @param leaving The picture leaving, or null.
 * @returns The appearances and the key, empty before anything has been drawn.
 */
function useStageAppearances(
	drawn: SemanticDrawing | null,
	leaving: Leaving | null,
): StageAppearances {
	const pictured = drawn ?? leaving?.drawing;
	return useMemo(
		() =>
			pictured === undefined
				? NOTHING_DRAWN
				: {
						appearances: new Map(pictured.appearances.map((one) => [one.id, one])),
						key: pictured.key,
					},
		[pictured],
	);
}

export { useStageAppearances, type StageAppearances };
