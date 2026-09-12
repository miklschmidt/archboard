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
import {
	DescriptionSchema,
	DisplayNameSchema,
	SemanticIdSchema,
} from "@/shared/semantic-board/lib/primitives";
import { DiagramGrammarSchema, MessageKindSchema } from "@/shared/semantic-board/lib/vocabulary";

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
 */
const FlowStepSchema = z
	.object({
		id: SemanticIdSchema,
		from: SemanticIdSchema,
		to: SemanticIdSchema,
		label: StepLabelSchema,
		kind: MessageKindSchema.default("sync"),
		note: DescriptionSchema.optional(),
		repeat: z.int().min(2).optional(),
	})
	.strict()
	.refine((step) => (step.kind === "self") === (step.from === step.to), {
		message: "a step is 'self' exactly when it begins and ends at the same node",
		path: ["kind"],
	});
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
 * One named way of reading this variant: a grammar, and what to read with it.
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
	FlowStepSchema,
	type FlowStep,
	SemanticFlowSchema,
	type SemanticFlow,
	ViewScopeSchema,
	type ViewScope,
	SemanticViewSchema,
	type SemanticView,
};
