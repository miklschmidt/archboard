// What a variant differs from now by, worked out for the picture being drawn.
//
// Nothing on a board says a node is new. A variant states its architecture and
// how it differs is read against another variant, every time, out of the
// identities the two share (ADR 0023). Which other variant is the one rule
// here, decided by the user on 2026-09-27: the current variant is now, and
// every other variant — history behind it, proposals ahead of it, shelved ones
// beside it — is read against it, so its marks say how it differs from what
// exists. The current variant is the reference and carries nothing. A board
// with no current variant has no now to read against, so each of its drafts is
// read against the one it came from, and its root draft carries nothing.
// Reconciliation and adoption never read this: they follow the parent.
// A caller can name the variant to read against instead (`--against`, TASK-478.01),
// which is how a stacked proposal is drawn against the one below it.
//
// That reading happens on the way to a picture, so no tombstone is ever
// written. It is shared because whatever draws — the server's render route,
// the CLI, or a browser drawing from the board it has read (TASK-247) — has to
// give the renderer the same content for the same variant.
//
// Restore the comparison before applying the shared view scope. A selected
// subject can exist only on the other side; narrowing the variant first loses
// that selection and makes a whole removed flow disappear.

import {
	currentVariant,
	type SemanticBoard,
	type SemanticVariant,
} from "@/shared/semantic-board/lib/aggregate";
import {
	compareVariants,
	withRemoved,
	type ChangeKind,
	type VariantComparison,
} from "@/shared/semantic-board/lib/compare";
import type { VariantContent } from "@/shared/semantic-board/lib/content";
import { scopedContent } from "@/shared/semantic-board/lib/scope";
import type { ViewScope } from "@/shared/semantic-board/lib/views";

/** What the answer says about a variant read against another, or nothing for the reference. */
interface DrawnChanges {
	/** The variant it is read against. */
	readonly against: { id: string; name: string; lifecycle: SemanticVariant["lifecycle"] };
	readonly standing: Record<string, ChangeKind>;
}

/** The picture to draw, and what it says about the proposal it is of. */
interface DrawnProposal {
	/** The content to draw: what the variant says, plus what it lacks of the other side. */
	readonly content: VariantContent;
	/** How it differs, or null when there is nothing to read it against. */
	readonly changes: DrawnChanges | null;
}

/**
 * The variant another is read against: the board's current variant, or, on a
 * board with none, the one it came from.
 * @param board The board.
 * @param variant The variant being read.
 * @returns The variant to read it against, or undefined for the current
 * variant itself and for a draft that came from nothing on a board with no
 * current variant.
 */
function comparedWith(board: SemanticBoard, variant: SemanticVariant): SemanticVariant | undefined {
	const current = currentVariant(board);
	if (current !== undefined) {
		return current.id === variant.id ? undefined : current;
	}
	return variant.parent === undefined
		? undefined
		: board.variants.find((one) => one.id === variant.parent);
}

/**
 * The picture to draw for one variant, and how it differs.
 *
 * A variant's picture is not simply the variant. What the other side has and
 * this one lacks is half of what a reader came to see, so it is put back here
 * — never on the board, which keeps saying what the architecture is or would
 * be. The renderer is told how each subject stands and draws a restored one as
 * absent rather than as part of the variant.
 * @param board The board.
 * @param variant The variant being drawn.
 * @param scope The shared view selection, applied to both sides of the change.
 * @param named The variant to read it against when the caller named one, in place of
 * `comparedWith`.
 * @returns The content to draw and the changes to mark on it.
 */
function drawingOf(
	board: SemanticBoard,
	variant: SemanticVariant,
	scope: ViewScope = { kind: "all" },
	named?: SemanticVariant,
): DrawnProposal {
	const base = named ?? comparedWith(board, variant);
	if (base === undefined) {
		return { content: scopedContent(variant.content, scope), changes: null };
	}
	// Compared whole, before any view narrowed it: a view that hides a node is a
	// narrower reading of the variant, never a variant that lost one.
	const comparison = compareVariants(base.content, variant.content);
	const content = scopedContent(withRemoved(base.content, variant.content, comparison), scope);
	return {
		content,
		// Read off the picture rather than off the comparison, so what the answer
		// says and what the picture holds can never disagree: everything restored
		// above is in the content and reads as removed here, and a removal the
		// picture had no context for is in neither.
		changes: {
			against: { id: base.id, name: base.name, lifecycle: base.lifecycle },
			standing: standingOfDrawn(comparison, content),
		},
	};
}

/**
 * How every subject the picture shows stands against the other side.
 * @param comparison What the variant changed.
 * @param drawn The content being drawn.
 * @returns The standing of each drawn subject, by id.
 */
function standingOfDrawn(
	comparison: VariantComparison,
	drawn: VariantContent,
): Record<string, ChangeKind> {
	return {
		...against(comparison.nodes, drawn.nodes),
		...against(comparison.edges, drawn.edges),
		...against(comparison.flows, drawn.flows),
		...against(
			comparison.steps,
			drawn.flows.flatMap((flow) => [...flow.steps]),
		),
	};
}

/**
 * How each of one kind of drawn subject stands.
 *
 * A subject the comparison never saw stands unchanged: it is drawn, so it is on
 * this variant, and the only way it can be absent from the comparison is that
 * both variants have it and neither touched it.
 * @param changes That kind's comparison.
 * @param drawn The subjects of that kind in the picture.
 * @returns Their standing, by id.
 */
function against(
	changes: ReadonlyMap<string, { readonly kind: ChangeKind }>,
	drawn: readonly { readonly id: string }[],
): Record<string, ChangeKind> {
	const standing: Record<string, ChangeKind> = {};
	for (const subject of drawn) {
		standing[subject.id] = changes.get(subject.id)?.kind ?? "unchanged";
	}
	return standing;
}

export { drawingOf, comparedWith, type DrawnChanges, type DrawnProposal };
