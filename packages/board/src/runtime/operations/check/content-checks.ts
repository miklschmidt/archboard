// Normal content diagnostics read current and draft variants. Historical
// corrections use an explicit, revision-pinned path (TASK-509), so checking
// history against today's files or boards would suggest changes to the wrong
// architecture. Shelved proposals also stay outside ordinary content repair.
//
// Vocabulary warnings still read every variant: defining a missing term in
// the vault configuration repairs how history is read without changing it.

import type { SemanticBoard, SemanticVariant } from "#shared/schemas/board-document.ts";

/**
 * Whether ordinary edits can change this variant's content.
 * @param variant One variant of a board.
 * @returns True for a current or draft variant.
 */
function acceptsContentEdits(variant: SemanticVariant): boolean {
	return variant.lifecycle === "current" || variant.lifecycle === "draft";
}

/**
 * The variants a content diagnostic is reported against: the ones somebody can
 * edit through the ordinary content path.
 * @param board The whole board family.
 * @returns Its current and draft variants, in the board's own order.
 */
function contentCheckedVariants(board: SemanticBoard): readonly SemanticVariant[] {
	return board.variants.filter(acceptsContentEdits);
}

export { acceptsContentEdits, contentCheckedVariants };
