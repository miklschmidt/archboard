// Two explanations of one architecture.
//
// A variant owns its nodes and its relationships once. A flow is an ordered
// walk over those same nodes — who asks whom, in what order — and a view says
// which grammar to draw and which part of the variant to draw it over. Neither
// copies anything: a participant is a node id, a step's endpoints are node ids,
// and a view's scope is a list of ids. That is what makes two views of one
// variant two ways of reading the same thing rather than two things to keep in
// step (ADR 0023).
//
// Order is array position throughout, and there is no step number to state.
// A stated number is a second opinion about the order, and a document that
// carries two opinions eventually carries two different ones.

import { z } from "zod";
import { CodeAnchorSchema } from "@archboard/code-binding/bindings";
import {
	DescriptionSchema,
	DisplayNameSchema,
	SemanticIdSchema,
} from "#shared/schemas/primitives.ts";
import { DiagramGrammarSchema, MessageKindSchema } from "#shared/schemas/vocabulary.ts";

const MAX_STEP_LABEL = 60;

/**
 * What one step says it carries. Stated here once so the spelling an agent may
 * write and the spelling a board holds cannot drift apart: a label an ingress
 * schema accepted and the document then refused would be a write that failed
 * for a reason the caller was told nothing about until afterwards.
 */
const StepLabelSchema = z.string().trim().min(1).max(MAX_STEP_LABEL);

/**
 * One message in a flow: who sent it, who received it, and what it was.
 *
 * `repeat` is how many times the step happens in one run — four batched
 * requests rather than four steps — because a reader counting identical rows
 * learns nothing the number would not have told them.
 *
 * `anchor` is the place in code the author cites as proof of the message, and
 * is bookkeeping like a relationship's (ADR 0046).
 */
const FlowMessageSchema = z
	.strictObject({
		id: SemanticIdSchema,
		from: SemanticIdSchema,
		to: SemanticIdSchema,
		label: StepLabelSchema,
		kind: MessageKindSchema.default("sync"),
		note: DescriptionSchema.optional(),
		repeat: z.int().min(2).optional(),
		anchor: CodeAnchorSchema.optional(),
	})
	.refine((step) => (step.kind === "self") === (step.from === step.to), {
		message: "a step is 'self' exactly when it begins and ends at the same node",
		path: ["kind"],
	});
type FlowMessage = z.infer<typeof FlowMessageSchema>;

/**
 * What a decision asks, what one of its answers is called, and what a loop
 * repeats while: each is one short line, like a message's label.
 */
const FlowWordsSchema = StepLabelSchema;

/**
 * The alternatives of one decision, as a decision holds them: two or more, each
 * labelled once, and one at least with a step in it.
 *
 * An alternative may hold no step, because "otherwise, nothing happens" is an
 * answer. But a decision whose every answer does nothing changes nothing about
 * the exchange, and two answers with one label are one answer written twice.
 * Shared by the stored and the stated spelling, so the two refuse alike.
 * @param alternative The schema of one alternative.
 * @returns The schema of the list.
 */
function alternativesOf<
	Alternative extends z.ZodType<{ readonly label: string; readonly steps: readonly unknown[] }>,
>(alternative: Alternative): z.ZodArray<Alternative> {
	return z
		.array(alternative)
		.min(2, "a decision has two or more alternatives")
		.check(
			z.refine(
				(alternatives: readonly { readonly label: string }[]) =>
					new Set(alternatives.map((one) => one.label)).size === alternatives.length,
				"every alternative of one decision has a label of its own",
			),
			z.refine(
				(alternatives: readonly { readonly steps: readonly unknown[] }[]) =>
					alternatives.some((one) => one.steps.length > 0),
				"at least one alternative of a decision holds a step",
			),
		);
}

/** One answer to a decision's question, and the steps that run on it, in order. */
const FlowAlternativeSchema = z.strictObject({
	label: FlowWordsSchema,
	/**
	 * The steps, read late because a step can hold steps.
	 * @returns Their schema.
	 */
	get steps(): z.ZodArray<typeof FlowStepSchema> {
		return z.array(FlowStepSchema);
	},
});
type FlowAlternative = z.infer<typeof FlowAlternativeSchema>;

/**
 * Where a flow branches: a question, and the labelled answers to it, each with
 * the steps that run on that answer (ADR 0053). The alternatives rejoin after
 * the decision, so the step that follows it follows every alternative.
 */
const FlowDecisionSchema = z.strictObject({
	id: SemanticIdSchema,
	kind: z.literal("decision"),
	question: FlowWordsSchema,
	note: DescriptionSchema.optional(),
	/**
	 * The alternatives, read late because a step can hold steps.
	 * @returns Their schema.
	 */
	get alternatives(): z.ZodArray<typeof FlowAlternativeSchema> {
		return alternativesOf(FlowAlternativeSchema);
	},
});
type FlowDecision = z.infer<typeof FlowDecisionSchema>;

/**
 * Steps that repeat while a condition holds: a retry, a page of results, one
 * pass for each item (ADR 0053). A step whose count the source fixes says so
 * with `repeat`; a loop is for a count that the data decides, or for several
 * steps that repeat together.
 */
const FlowLoopSchema = z.strictObject({
	id: SemanticIdSchema,
	kind: z.literal("loop"),
	condition: FlowWordsSchema,
	note: DescriptionSchema.optional(),
	/**
	 * The steps, read late because a step can hold steps.
	 * @returns Their schema.
	 */
	get steps(): z.ZodArray<typeof FlowStepSchema> {
		return z.array(FlowStepSchema).min(1, "a loop repeats at least one step");
	},
});
type FlowLoop = z.infer<typeof FlowLoopSchema>;

/**
 * One step of a flow: a message, a decision or a loop. A decision and a loop
 * hold steps of their own, so a flow is a tree told in order, and every step
 * of it has an identity of its own wherever it stands.
 *
 * A union rather than a discriminated one, because a stored message may leave
 * its kind to the default. The kinds of a message and the two control kinds
 * never overlap, so exactly one member accepts any step.
 */
const FlowStepSchema = z.union([FlowMessageSchema, FlowDecisionSchema, FlowLoopSchema]);
type FlowStep = z.infer<typeof FlowStepSchema>;

/**
 * An ordered exchange between nodes of this variant.
 *
 * `participants` is the order the columns are drawn in, which is the one
 * presentation intent a flow carries; everything else about the picture is the
 * renderer's. There is no cap on how many of them there are or how many steps
 * they exchange: a big diagram is a thing people legitimately have, and the
 * viewer pans and zooms (ADR 0023). A flow with one participant is allowed
 * too — a sequence of a component's own steps is a real explanation, and the
 * `self` kind already says what such a step is.
 */
const SemanticFlowSchema = z
	.object({
		id: SemanticIdSchema,
		name: DisplayNameSchema,
		summary: DescriptionSchema.optional(),
		participants: z.array(SemanticIdSchema).min(1),
		steps: z.array(FlowStepSchema).min(1),
	})
	.strict();
type SemanticFlow = z.infer<typeof SemanticFlowSchema>;

/**
 * What a view shows: everything, or a named selection.
 *
 * The two are separate states rather than "a selection that happens to be
 * empty", so that removing the last thing a view pointed at can never quietly
 * turn it into a view of the whole board.
 */
const ViewScopeSchema = z.discriminatedUnion("kind", [
	z.object({ kind: z.literal("all") }).strict(),
	z
		.object({
			kind: z.literal("selection"),
			nodes: z.array(SemanticIdSchema).default([]),
			edges: z.array(SemanticIdSchema).default([]),
			flows: z.array(SemanticIdSchema).default([]),
		})
		.strict()
		.refine((scope) => scope.nodes.length + scope.edges.length + scope.flows.length > 0, {
			message: "a selection has to name something",
		}),
]);
type ViewScope = z.infer<typeof ViewScopeSchema>;

/**
 * One board-owned way of reading every variant: a grammar, and what to read with it.
 *
 * A view is presentation intent and carries no geometry. Which view a pane is
 * showing is the browser's business and is never written down here.
 */
const SemanticViewSchema = z
	.object({
		id: SemanticIdSchema,
		name: DisplayNameSchema,
		grammar: DiagramGrammarSchema,
		summary: DescriptionSchema.optional(),
		scope: ViewScopeSchema.default({ kind: "all" }),
	})
	.strict();
type SemanticView = z.infer<typeof SemanticViewSchema>;

export {
	StepLabelSchema,
	FlowWordsSchema,
	alternativesOf,
	FlowMessageSchema,
	type FlowMessage,
	FlowAlternativeSchema,
	type FlowAlternative,
	FlowDecisionSchema,
	type FlowDecision,
	FlowLoopSchema,
	type FlowLoop,
	FlowStepSchema,
	type FlowStep,
	SemanticFlowSchema,
	type SemanticFlow,
	ViewScopeSchema,
	type ViewScope,
	SemanticViewSchema,
	type SemanticView,
};
