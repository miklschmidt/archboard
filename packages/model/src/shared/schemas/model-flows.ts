import { z } from "zod";
import {
	QualifiedSubjectIdSchema,
	SemanticIdSchema,
	DisplayNameSchema,
	SingleLineTextSchema,
} from "#shared/schemas/primitives.ts";
import {
	FlowMessageSchema,
	FlowDecisionSchema,
	FlowLoopSchema,
	SemanticFlowSchema,
	alternativesOf,
} from "#shared/schemas/views.ts";

const MessageSchema = FlowMessageSchema.safeExtend({
	id: QualifiedSubjectIdSchema,
	from: QualifiedSubjectIdSchema,
	to: QualifiedSubjectIdSchema,
});
const DecisionSchema = FlowDecisionSchema.omit({ alternatives: true }).extend({
	id: QualifiedSubjectIdSchema,
	/**
	 * Resolve recursive alternatives from the existing semantic contract.
	 * @returns The ordered alternative schema.
	 */
	get alternatives(): z.ZodArray<typeof AlternativeSchema> {
		return alternativesOf(AlternativeSchema);
	},
});
const AlternativeSchema = z.strictObject({
	label: FlowDecisionSchema.shape.alternatives.element.shape.label,
	/**
	 * Resolve recursive steps from the existing semantic contract.
	 * @returns The ordered step schema.
	 */
	get steps(): z.ZodArray<typeof StepSchema> {
		return z.array(StepSchema);
	},
});
const LoopSchema = FlowLoopSchema.omit({ steps: true }).extend({
	id: QualifiedSubjectIdSchema,
	/**
	 * Resolve recursive steps from the existing semantic contract.
	 * @returns The ordered step schema.
	 */
	get steps(): z.ZodArray<typeof StepSchema> {
		return z.array(StepSchema).min(1);
	},
});
const StepSchema = z.union([MessageSchema, DecisionSchema, LoopSchema]);
/**
 * A flow as a file holds it, in the current model and in every retained reading. A reading
 * written before summaries became required must keep opening exactly, so `summary` stays
 * optional here. The requirement binds a write, through `FlowChangeSchema` and the candidate,
 * and current content, through the semantics check.
 */
const ModelFlowSchema = SemanticFlowSchema.omit({ steps: true }).extend({
	id: QualifiedSubjectIdSchema,
	formerNames: z.array(DisplayNameSchema).optional(),
	participants: z.array(QualifiedSubjectIdSchema).min(1),
	steps: z.array(StepSchema).min(1),
});
const FlowCollectionSchema = z.strictObject({
	schemaVersion: z.literal(1),
	id: SemanticIdSchema,
	name: DisplayNameSchema,
	flows: z.array(ModelFlowSchema),
});

const NewAlternativeSchema = z.strictObject({
	label: AlternativeSchema.shape.label,
	/**
	 * Resolve recursive steps from the existing semantic contract.
	 * @returns The ordered step schema.
	 */
	get steps(): z.ZodArray<typeof NewStepSchema> {
		return z.array(NewStepSchema);
	},
});
const NewDecisionSchema = DecisionSchema.omit({ id: true, alternatives: true }).extend({
	/**
	 * Resolve recursive alternatives from the existing semantic contract.
	 * @returns The ordered alternative schema.
	 */
	get alternatives(): z.ZodArray<typeof NewAlternativeSchema> {
		return alternativesOf(NewAlternativeSchema);
	},
});
const NewLoopSchema = LoopSchema.omit({ id: true, steps: true }).extend({
	/**
	 * Resolve recursive steps from the existing semantic contract.
	 * @returns The ordered step schema.
	 */
	get steps(): z.ZodArray<typeof NewStepSchema> {
		return z.array(NewStepSchema).min(1);
	},
});
const NewStepSchema = z.union([
	z.strictObject({
		...MessageSchema.shape,
		id: z.never().optional(),
		from: SingleLineTextSchema,
		to: SingleLineTextSchema,
	}),
	NewDecisionSchema,
	NewLoopSchema,
]);
const NewFlowSchema = ModelFlowSchema.omit({ id: true, formerNames: true, steps: true }).extend({
	steps: z.array(NewStepSchema).min(1),
	participants: z.array(SingleLineTextSchema).min(1),
});
const PlacementSchema = z.strictObject({
	holder: QualifiedSubjectIdSchema,
	alternative: AlternativeSchema.shape.label.optional(),
	before: QualifiedSubjectIdSchema.optional(),
});
const FlowFieldsSchema = ModelFlowSchema.omit({ id: true, formerNames: true, steps: true }).extend({
	participants: z.array(SingleLineTextSchema).min(1),
});
const StepFieldsSchema = z.strictObject({
	kind: MessageSchema.shape.kind.removeDefault().optional(),
	from: SingleLineTextSchema.optional(),
	to: SingleLineTextSchema.optional(),
	label: MessageSchema.shape.label.optional(),
	note: MessageSchema.shape.note,
	repeat: MessageSchema.shape.repeat,
	anchor: MessageSchema.shape.anchor,
	question: DecisionSchema.shape.question.optional(),
	condition: LoopSchema.shape.condition.optional(),
	alternatives: z.array(AlternativeSchema.shape.label).min(2).optional(),
});
const RecordedAddFlowSchema = z.strictObject({
	type: z.literal("add-flow"),
	collection: z.string().min(1),
	flow: NewFlowSchema,
});
const RecordedEditFlowSchema = z.strictObject({
	type: z.literal("edit-flow"),
	subject: z.string().min(1),
	collection: z.string().min(1).optional(),
	set: FlowFieldsSchema.partial().optional(),
	clear: z.array(z.literal("summary")).optional(),
});
/** The statements that mean the same to a new write and to one that history retains. */
const LASTING_STATEMENTS = [
	z.strictObject({ type: z.literal("add-collection"), name: DisplayNameSchema }),
	z.strictObject({
		type: z.literal("edit-collection"),
		collection: z.string().min(1),
		name: DisplayNameSchema,
	}),
	z.strictObject({ type: z.literal("remove-collection"), collection: z.string().min(1) }),
	z.strictObject({ type: z.literal("remove-flow"), subject: z.string().min(1) }),
	z.strictObject({ type: z.literal("add-step"), placement: PlacementSchema, step: NewStepSchema }),
	z.strictObject({
		type: z.literal("edit-step"),
		subject: QualifiedSubjectIdSchema,
		set: StepFieldsSchema.optional(),
		clear: z.array(z.enum(["note", "repeat", "anchor"])).optional(),
	}),
	z.strictObject({ type: z.literal("remove-step"), subject: QualifiedSubjectIdSchema }),
	z.strictObject({
		type: z.literal("move-step"),
		subject: QualifiedSubjectIdSchema,
		placement: PlacementSchema,
	}),
] as const;
/** What an author writes now: a new flow says what it does, and no flow unsays it. */
const FlowChangeSchema = z.discriminatedUnion("type", [
	...LASTING_STATEMENTS,
	RecordedAddFlowSchema.extend({
		flow: NewFlowSchema.extend({
			summary: NewFlowSchema.shape.summary.nonoptional(
				"A flow needs a summary: one or two sentences that say what the exchange does and why it matters.",
			),
		}),
	}),
	RecordedEditFlowSchema.omit({ clear: true }),
]);
/** What a signed record or a journal can hold: an intent from before summaries were required. */
const RecordedFlowChangeSchema = z.discriminatedUnion("type", [
	...LASTING_STATEMENTS,
	RecordedAddFlowSchema,
	RecordedEditFlowSchema,
]);
export {
	FlowCollectionSchema,
	ModelFlowSchema,
	NewStepSchema,
	FlowChangeSchema,
	RecordedFlowChangeSchema,
};
