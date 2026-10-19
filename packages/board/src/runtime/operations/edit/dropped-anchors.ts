// A relationship or a flow step restated without the anchor it had.
//
// Every write replaces the subject it states, and a field left out is cleared,
// so restating a relationship to change its label without its anchor drops the
// author's proof of it. The write lands, because the board is valid without the
// anchor, and the answer says what went, with the anchor spelled out so the
// next write can put it back (ADR 0046). A subject the batch did not state
// keeps its anchor, so only a restatement can drop one.

import type { CodeAnchor } from "@archboard/code-binding/code-binding";
import { messagesOf } from "#shared/rules/flow-steps.ts";
import { type FlowMessage } from "#shared/schemas/views.ts";
import { type SemanticEdge, type VariantContent } from "#shared/schemas/content.ts";
import type { WriteNotice } from "#runtime/operations/edit/replaced-relationships.ts";

/**
 * What to write to restore an anchor.
 * @param anchor The anchor that was dropped.
 * @returns It as the payload spells it.
 */
function spelled(anchor: CodeAnchor): string {
	return `"anchor": ${JSON.stringify(anchor)}`;
}

/**
 * Relationships that kept their id and lost their anchor.
 * @param before The relationships as they stood.
 * @param after The relationships after the batch.
 * @returns One notice per dropped anchor.
 */
function droppedFromEdges(
	before: readonly SemanticEdge[],
	after: readonly SemanticEdge[],
): WriteNotice[] {
	const now = new Map(after.map((edge) => [edge.id, edge]));
	return before.flatMap((was) => {
		const edge = now.get(was.id);
		if (was.anchor === undefined || edge === undefined || edge.anchor !== undefined) return [];
		return [
			{
				code: "ANCHOR_DROPPED" as const,
				path: `edges.${edge.id}.anchor`,
				message: `relationship ${edge.id} (${edge.from} -> ${edge.to}, ${edge.kind}) was restated without its anchor, so the anchor is gone; to keep it, restate the relationship with ${spelled(was.anchor)}`,
			},
		];
	});
}

/**
 * Every step of a content, with the flow that tells it.
 * @param content A variant's content.
 * @returns The steps by id.
 */
function stepsById(content: VariantContent): Map<string, { flow: string; step: FlowMessage }> {
	return new Map(
		content.flows.flatMap((flow) =>
			messagesOf(flow.steps).map((step) => [step.id, { flow: flow.id, step }]),
		),
	);
}

/**
 * Steps that kept their id and lost their anchor.
 * @param before The content as it stood.
 * @param after The content after the batch.
 * @returns One notice per dropped anchor.
 */
function droppedFromSteps(before: VariantContent, after: VariantContent): WriteNotice[] {
	const now = stepsById(after);
	return [...stepsById(before).values()].flatMap(({ step: was }) => {
		const placed = now.get(was.id);
		if (was.anchor === undefined || placed === undefined || placed.step.anchor !== undefined) {
			return [];
		}
		return [
			{
				code: "ANCHOR_DROPPED" as const,
				path: `flows.${placed.flow}.steps.${was.id}.anchor`,
				message: `step ${was.id} ("${placed.step.label}") was restated without its anchor, so the anchor is gone; to keep it, restate the step with ${spelled(was.anchor)}`,
			},
		];
	});
}

/**
 * Every anchor a batch dropped by restating its relationship or step without it.
 * @param before The content as it stood.
 * @param after The content after the batch.
 * @returns One notice per dropped anchor.
 */
function droppedAnchors(before: VariantContent, after: VariantContent): WriteNotice[] {
	return [...droppedFromEdges(before.edges, after.edges), ...droppedFromSteps(before, after)];
}

export { droppedAnchors };
