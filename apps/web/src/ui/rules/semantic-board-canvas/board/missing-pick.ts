// What the Selection tab says when the variant on screen does not hold the
// picked part (TASK-538.02). A part picked in the linked pane can be one that
// only the variant beside holds, such as a part a proposal adds. That part has
// not left the board, so the pane names the variant that holds it.

import {
	addressedVariant,
	type SemanticBoard,
	type SemanticVariant,
} from "@archboard/board/document";
import { subjectOf } from "#ui/rules/semantic-board-canvas/board/board-document.ts";
import type { VariantBeside } from "#ui/state/semantic-board-canvas/pane-beside.ts";

/**
 * The variant beside, when it is another variant and holds the part.
 * @param board The board.
 * @param shown The variant on screen.
 * @param beside What the linked pane shows, or null while the pane is not linked.
 * @param selection The picked id.
 * @returns The variant beside, or undefined when there is none or it lacks the part.
 */
function heldBeside(
	board: SemanticBoard,
	shown: SemanticVariant,
	beside: VariantBeside | null,
	selection: string,
): SemanticVariant | undefined {
	if (beside === null) {
		return undefined;
	}
	const there = addressedVariant(board, beside.variant ?? undefined);
	if (!there.ok || there.variant.id === shown.id) {
		return undefined;
	}
	return subjectOf(there.variant, selection) === undefined ? undefined : there.variant;
}

/**
 * What to say about a picked part the board on screen does not explain.
 * @param board The board.
 * @param shown The variant on screen.
 * @param beside What the linked pane shows, or null while the pane is not linked.
 * @param selection The picked id.
 * @returns The variant beside that holds it, or that it is gone from the board.
 */
function missingNotice(
	board: SemanticBoard,
	shown: SemanticVariant,
	beside: VariantBeside | null,
	selection: string,
): string {
	const there =
		subjectOf(shown, selection) === undefined
			? heldBeside(board, shown, beside, selection)
			: undefined;
	return there === undefined
		? "This is not on the board any more. It may have gone since the picture was drawn."
		: `Not on this variant. It is on ${there.name}, in the pane beside.`;
}

export { missingNotice };
