// Which variants a content diagnostic runs over.
//
// A historical variant is frozen on purpose: what was true then does not
// change, so the write boundary refuses every edit to its content
// (`VARIANT_HISTORICAL` in `transitions.ts`). A diagnostic whose only repair is
// a content edit to the variant that carries it therefore names, on frozen
// history, something no accepted write can put right — a standing warning the
// vault can never clear and an agent can only be refused for trying. Vault
// diagnostics exist to drive repair (ADR 0026), so a check that cannot be
// answered does not run there.
//
// This is about the repair, not about where the diagnostic points. A warning
// that happens to sit at a content path but is answered somewhere else keeps
// running over every variant: `UNKNOWN_VOCABULARY` says the vault
// configuration has no definition for a value boards still carry, and defining
// it in `.archboard/config.yaml` is an ordinary accepted write that clears it
// on current, draft and historical alike. Silencing it on history would hide a
// real gap in a vocabulary that history is still drawn with.
//
// The drill-down checks of ADR 0029 are the other case: every repair they name
// — draw the participant the link belongs on, point the link at another board,
// carry the level the target declares — rewrites the variant's own nodes.
// TASK-260's out-of-repository binding check is the same shape.

import type { SemanticBoard, SemanticVariant } from "@/shared/semantic-board/index";

/**
 * Whether an accepted write could still change this variant's content: the
 * architecture that exists, and the proposals still being argued about.
 *
 * Named as what it admits rather than what it excludes, so a lifecycle added
 * later for another kind of kept state is outside the checks until somebody
 * decides it belongs — the safe direction, because the cost of the other one
 * is a warning nobody can clear.
 *
 * `shelved` is the lifecycle that arrived that way, and it stays out
 * deliberately (ADR 0030): a proposal nobody intends to carry out refuses
 * content edits exactly as history does, so a diagnostic about its content
 * would name a repair the store would refuse.
 * @param variant One variant of a board.
 * @returns True for a current or draft variant.
 */
function acceptsContentEdits(variant: SemanticVariant): boolean {
	return variant.lifecycle === "current" || variant.lifecycle === "draft";
}

/**
 * The variants a content diagnostic is reported against: the ones somebody can
 * still edit, so every warning it raises names a repair the store would take.
 * @param board The whole board family.
 * @returns Its current and draft variants, in the board's own order.
 */
function contentCheckedVariants(board: SemanticBoard): readonly SemanticVariant[] {
	return board.variants.filter(acceptsContentEdits);
}

export { acceptsContentEdits, contentCheckedVariants };
