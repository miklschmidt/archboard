// Which variants a content diagnostic runs over: current and draft.
//
// A content diagnostic names a repair from the board as it reads today. A
// historical variant changes only through an explicit correction pinned to the
// Git commits it describes (TASK-509), so a warning there would drive a
// correction that no commit supports. A shelved proposal refuses content edits
// (ADR 0030). The rule names what it admits, so a lifecycle added later stays
// outside the checks until somebody decides that it belongs.
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
