// What a variant differs from now by, worked out for the picture being drawn.
//
// Nothing on a model says a node is new. A variant states its architecture and
// how it differs is read against another variant, every time, out of the
// identities the two share (ADR 0023). Which other variant is the one rule
// here, decided by the user on 2026-09-27: the current variant is now, and
// every other variant — history behind it, proposals ahead of it, shelved ones
// beside it — is read against it, so its marks say how it differs from what
// exists. The current variant is the reference and carries nothing. A model
// with no current variant has no now to read against, so each of its drafts is
// read against the one it came from, and its root draft carries nothing.
// Reconciliation and adoption never read this: they follow the parent.
// A caller can name the variant to read against instead (`--against`, TASK-478.01),
// which is how a stacked proposal is drawn against the one below it.
//
// That reading happens on the way to a picture, so no tombstone is ever
// written. It is shared because whatever draws — the server's render route,
// the CLI, or a browser drawing from the model it has read (TASK-247) — has to
// give the renderer the same content for the same variant.
//
// Restore the comparison before applying the shared view scope. A selected
// subject can exist only on the other side; narrowing the variant first loses
// that selection and makes a whole removed flow disappear.

import {
	readFlow,
	resolveVariant,
	type ArchitectureModel,
	type ArchitectureModelRead,
	type LegacyBoard,
	type SemanticVariant,
	type VariantContent,
} from "@archboard/model-contract";
import {
	defaultComparisonReference,
	type ComparisonReference,
} from "#shared/compare/rules/default-reference.ts";
import {
	compareContents,
	withRemoved,
	type ChangeKind,
	type VariantComparison,
} from "#shared/compare/rules/variants.ts";
import { scopedContent, type ReadingScope } from "#shared/rules/scope.ts";

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
 * Resolve a canonical reading's default reference, or a retained legacy variant's base.
 * @param selected The selected canonical architecture.
 * @param current The working reading or refusal.
 * @returns Its default state or checkpoint reference. A retained legacy reading returns its base variant.
 */
function comparedWith(
	selected: ArchitectureModel,
	current: ArchitectureModelRead,
): ComparisonReference | undefined;
function comparedWith(
	model: Pick<LegacyBoard, "name" | "current" | "variants">,
	variant: SemanticVariant,
): SemanticVariant | undefined;
function comparedWith(
	selected: ArchitectureModel | Pick<LegacyBoard, "name" | "current" | "variants">,
	reading: ArchitectureModelRead | SemanticVariant,
): ComparisonReference | SemanticVariant | undefined {
	if ("success" in selected && "success" in reading)
		return defaultComparisonReference(selected, reading);
	if ("variants" in selected && "content" in reading) return legacyReference(selected, reading);
	throw new TypeError("Select a model and its current reading, or a legacy board and its variant.");
}

/**
 * Resolve the comparison of a retained legacy variant.
 * @param model The legacy board.
 * @param variant The selected variant.
 * @returns Its current variant or retained parent.
 */
function legacyReference(
	model: Pick<LegacyBoard, "name" | "current" | "variants">,
	variant: SemanticVariant,
): SemanticVariant | undefined {
	const current = resolveVariant(model);
	if (current !== undefined) return current.id === variant.id ? undefined : current;
	return variant.parent === undefined
		? undefined
		: model.variants.find((one) => one.id === variant.parent);
}

/** A complete comparison picture, independent of legacy board ownership. */
interface ComparedContent {
	readonly content: VariantContent;
	readonly standing: DrawnChanges["standing"];
}

/**
 * Read one variant against another: two contents give what the later changed, with a
 * scope the picture to draw, and a model with one of its variants the picture and its base.
 * @param base The earlier content, or the model whose `comparedWith` chooses the base.
 * @param content The later content, or the variant being drawn.
 * @param scope The reading applied after the comparison, on the picture readings.
 * @param reference The variant to read a model's variant against, in place of `comparedWith`.
 * @returns The comparison, or the content to draw with how it stands or what it is read against.
 */
function compareVariants(
	base: Pick<LegacyBoard, "name" | "current" | "variants">,
	content: SemanticVariant,
	scope?: ReadingScope,
	reference?: SemanticVariant,
): DrawnProposal;
function compareVariants(base: VariantContent, content: VariantContent): VariantComparison;
function compareVariants(
	base: VariantContent,
	content: VariantContent,
	scope: ReadingScope,
): ComparedContent;
function compareVariants(
	base: Pick<LegacyBoard, "name" | "current" | "variants"> | VariantContent,
	content: SemanticVariant | VariantContent,
	scope?: ReadingScope,
	reference?: SemanticVariant,
): VariantComparison | ComparedContent | DrawnProposal {
	if ("nodes" in base && "nodes" in content) {
		return scope === undefined
			? compareContents(base, content)
			: comparedContent(base, content, scope);
	}
	if ("variants" in base && "content" in content) {
		return modelDrawing(base, content, scope, reference);
	}
	throw new TypeError("Compare two complete contents, or a model and its variant.");
}

/**
 * One comparison mechanism restores content for both legacy and canonical readers.
 * @param base Complete reference meaning.
 * @param selected Complete selected meaning.
 * @param scope The reading applied after removed definitions return.
 * @returns Only the temporary depiction and its semantic standing.
 */
function comparedContent(
	base: VariantContent,
	selected: VariantContent,
	scope: ReadingScope = { kind: "all" },
): ComparedContent {
	const comparison = compareContents(base, selected);
	const content = scopedContent(withRemoved(base, selected, comparison), scope);
	return { content, standing: standingOfDrawn(comparison, content) };
}

/**
 * The picture to draw for one variant, and how it differs.
 *
 * A variant's picture is not simply the variant. What the other side has and
 * this one lacks is half of what a reader came to see, so it is put back here
 * — never on the legacy board, which keeps saying what the architecture is or would
 * be. The renderer is told how each subject stands and draws a restored one as
 * absent rather than as part of the variant.
 * @param model The legacy board.
 * @param variant The variant being drawn.
 * @param scope The shared reading, applied to both sides of the change.
 * @param named The variant to read it against when the caller named one, in place of
 * `comparedWith`.
 * @returns The content to draw and the changes to mark on it.
 */
function modelDrawing(
	model: Pick<LegacyBoard, "name" | "current" | "variants">,
	variant: SemanticVariant,
	scope: ReadingScope = { kind: "all" },
	named?: SemanticVariant,
): DrawnProposal {
	const base = named ?? comparedWith(model, variant);
	if (base === undefined) {
		return { content: scopedContent(variant.content, scope), changes: null };
	}
	// Compared whole, before any view narrowed it: a view that hides a node is a
	// narrower reading of the variant, never a variant that lost one.
	const { content, standing } = comparedContent(base.content, variant.content, scope);
	return {
		content,
		// Read off the picture rather than off the comparison, so what the answer
		// says and what the picture holds can never disagree: everything restored
		// above is in the content and reads as removed here, and a removal the
		// picture had no context for is in neither.
		changes: {
			against: { id: base.id, name: base.name, lifecycle: base.lifecycle },
			standing,
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
			drawn.flows.flatMap((flow) => readFlow(flow.steps).every),
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

export { comparedContent, comparedWith, compareVariants };
