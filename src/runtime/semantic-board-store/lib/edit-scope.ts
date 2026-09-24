// What an edit batch changes about the variant it lands on.
//
// A batch can change the variant's content, its summary, or neither (views and
// level belong to the board). The edit transition asks these questions to
// decide whether a historical or shelved variant must refuse the batch, whether
// the change reaches the drafts under it, and what the variant's summary is
// afterwards.

import type { SemanticVariant, VariantEditInput } from "@/shared/semantic-board/index";

/**
 * Whether a stated batch edits variant content at all, as opposed to the
 * board's views or level alone.
 * @param input The batch as stated.
 * @returns True when any content collection is stated or removed.
 */
function editsContent(input: VariantEditInput): boolean {
	return [
		input.nodes,
		input.edges,
		input.flows,
		input.walkthroughs,
		input.removeNodes,
		input.removeEdges,
		input.removeFlows,
		input.removeWalkthroughs,
	].some((entries) => entries.length > 0);
}

/**
 * Whether a stated batch changes the variant it lands on at all: its content or
 * its summary, as opposed to the board's views or level alone.
 * @param input The batch as stated.
 * @returns True when the batch changes the variant.
 */
function editsVariant(input: VariantEditInput): boolean {
	return editsContent(input) || input.summary !== undefined;
}

/**
 * The family with the edited variant's summary restated, when the edit states one.
 *
 * A summary says what one variant is for, so it lands on that variant alone:
 * nothing inherits it and no comparison counts it.
 * @param variants The family after the edit.
 * @param edited The edited variant's id.
 * @param summary The summary the edit states, or undefined to keep it.
 * @returns The family.
 */
function summarized(
	variants: readonly SemanticVariant[],
	edited: string,
	summary: string | undefined,
): SemanticVariant[] {
	return variants.map((one) =>
		summary === undefined || one.id !== edited ? one : { ...one, summary },
	);
}

export { editsContent, editsVariant, summarized };
