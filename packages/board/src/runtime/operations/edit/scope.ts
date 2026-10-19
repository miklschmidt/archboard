// What an edit batch changes about the variant it lands on.
//
// A batch can change the variant's content, its summary and its documents, or
// none of them (views and level belong to the board). The edit transition asks
// these questions to decide whether a historical or shelved variant must refuse
// the batch, whether the change reaches the drafts under it, and what the
// variant's summary and documents are afterwards.

import type { DocumentReference } from "@archboard/code-binding/code-binding";
import type { SemanticVariant } from "#shared/schemas/board-document.ts";
import type { VariantEditInput } from "#shared/protocol/board-input.ts";

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
 * Whether a stated batch changes the variant it lands on at all: its content,
 * its summary or its documents, as opposed to the board's views or level alone.
 * @param input The batch as stated.
 * @returns True when the batch changes the variant.
 */
function editsVariant(input: VariantEditInput): boolean {
	return editsContent(input) || input.summary !== undefined || input.documents !== undefined;
}

/**
 * The family with the edited variant's summary and documents restated, where
 * the edit states them.
 *
 * A summary says what one variant is for, and its documents what that reading
 * draws (ADR 0054), so each lands on that variant alone: nothing inherits it
 * and no comparison counts it. An empty list of documents removes the field.
 * @param variants The family after the edit.
 * @param edited The edited variant's id.
 * @param input The batch as stated.
 * @returns The family.
 */
function restated(
	variants: readonly SemanticVariant[],
	edited: string,
	input: Pick<VariantEditInput, "summary" | "documents">,
): SemanticVariant[] {
	const { summary, documents } = input;
	return variants.map((one) => {
		if (one.id !== edited) return one;
		const { documents: _stated, ...rest } = one;
		const listed = documents === undefined ? one : { ...rest, ...documentsField(documents) };
		return summary === undefined ? listed : { ...listed, summary };
	});
}

/**
 * A variant's `documents` field as the board stores it: absent when the list
 * is empty or not stated, since an empty list says nothing (ADR 0054).
 * @param documents The list.
 * @returns The field, or nothing.
 */
function documentsField(
	documents: readonly DocumentReference[] | undefined,
): Pick<SemanticVariant, "documents"> {
	return documents === undefined || documents.length === 0 ? {} : { documents: [...documents] };
}

export { documentsField, editsContent, editsVariant, restated };
