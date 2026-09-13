// What a proposal changed, worked out for the picture being drawn.
//
// Nothing on a board says a node is new. A proposal states its architecture and
// what it changed is read against the variant it came from, every time, out of
// the identities the two share (ADR 0023). That reading happens here, on the way
// out, so no tombstone is ever written and a variant with no predecessor simply
// carries nothing.
//
// Restore the comparison before applying the shared view scope. A selected
// subject can exist only in the predecessor; narrowing the proposal first
// loses that selection and makes a whole removed flow disappear.

import {
	compareVariants,
	withRemoved,
	scopedContent,
	type ChangeKind,
	type SemanticBoard,
	type SemanticVariant,
	type VariantComparison,
	type VariantContent,
	type ViewScope,
} from "@/shared/semantic-board/index";

/** What the answer says about a proposal, or nothing for a variant with no predecessor. */
interface DrawnChanges {
	readonly predecessor: { id: string; name: string; lifecycle: SemanticVariant["lifecycle"] };
	readonly standing: Record<string, ChangeKind>;
}

/** The picture to draw, and what it says about the proposal it is of. */
interface DrawnProposal {
	/** The content to draw: what the proposal says, plus what it took away. */
	readonly content: VariantContent;
	/** What it changed, or null when this variant came from nothing. */
	readonly changes: DrawnChanges | null;
}

/**
 * The variant this one was derived from, when it was derived from one on this
 * board.
 * @param board The board.
 * @param variant The variant being drawn.
 * @returns The predecessor, or undefined when there is none.
 */
function predecessorOf(
	board: SemanticBoard,
	variant: SemanticVariant,
): SemanticVariant | undefined {
	return variant.parent === undefined
		? undefined
		: board.variants.find((one) => one.id === variant.parent);
}

/**
 * The picture to draw for one variant, and what it changed.
 *
 * A proposal's picture is not simply the proposal. What a change took away is
 * half of what a reader came to see, so it is put back here — never on the
 * board, which keeps saying what the architecture would be. The renderer is
 * told how each subject stands and draws a restored one as absent rather than
 * as part of the proposal.
 * @param board The board.
 * @param variant The variant being drawn.
 * @param scope The shared view selection, applied to both sides of the change.
 * @returns The content to draw and the changes to mark on it.
 */
function drawingOf(
	board: SemanticBoard,
	variant: SemanticVariant,
	scope: ViewScope = { kind: "all" },
): DrawnProposal {
	const parent = predecessorOf(board, variant);
	if (parent === undefined) {
		return { content: scopedContent(variant.content, scope), changes: null };
	}
	// Compared whole, before any view narrowed it: a view that hides a node is a
	// narrower reading of the variant, never a variant that lost one.
	const comparison = compareVariants(parent.content, variant.content);
	const content = scopedContent(withRemoved(parent.content, variant.content, comparison), scope);
	return {
		content,
		// Read off the picture rather than off the comparison, so what the answer
		// says and what the picture holds can never disagree: everything restored
		// above is in the content and reads as removed here, and a removal the
		// picture had no context for is in neither.
		changes: {
			predecessor: { id: parent.id, name: parent.name, lifecycle: parent.lifecycle },
			standing: standingOfDrawn(comparison, content),
		},
	};
}

/**
 * How every subject the picture shows stands against the predecessor.
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

export { drawingOf, predecessorOf, type DrawnChanges, type DrawnProposal };
