import {
	ExplanationRequestSchema,
	ReadingSelectionSchema,
} from "#shared/schemas/model-explanation.ts";

import { ReconciliationIssueSchema } from "#shared/schemas/reconciliation.ts";
import { z } from "zod";
import {
	StateMetadataSchema,
	StateLineageSchema,
	ModelRevisionSchema,
} from "#shared/schemas/model-definitions.ts";
import { QualifiedSubjectIdSchema, SemanticIdSchema } from "#shared/schemas/primitives.ts";
import { HistoricalRevisionsSchema } from "#shared/schemas/historical-correction.ts";
const StateSelectionSchema = ReadingSelectionSchema.extend({
	explain: ExplanationRequestSchema.optional(),
});
const CheckpointIdSchema = z.string().regex(/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/u);
const SubjectKindSchema = z.enum(["module", "relationship", "collection", "flow", "step"]);
const PlacementSchema = z.strictObject({
	holder: z.union([QualifiedSubjectIdSchema, SemanticIdSchema]),
	alternative: z.string().optional(),
	before: QualifiedSubjectIdSchema.optional(),
});
const FieldValueSchema = z
	.unknown()
	.refine(
		(value): boolean => value !== null && value !== undefined,
		"Assign a value. Use clear to remove an optional field.",
	);
const ProposalChangeSchema = z.discriminatedUnion("type", [
	z.strictObject({
		type: z.literal("add"),
		subject: QualifiedSubjectIdSchema,
		kind: SubjectKindSchema,
		value: z.record(z.string(), FieldValueSchema),
	}),
	z.strictObject({ type: z.literal("remove"), subject: QualifiedSubjectIdSchema }),
	z.strictObject({
		type: z.literal("assign"),
		subject: QualifiedSubjectIdSchema,
		field: z.string().min(1),
		value: FieldValueSchema,
	}),
	z.strictObject({
		type: z.literal("clear"),
		subject: QualifiedSubjectIdSchema,
		field: z.string().min(1),
	}),
	z.strictObject({
		type: z.literal("place"),
		subject: QualifiedSubjectIdSchema,
		placement: PlacementSchema,
	}),
]);
const ModelIssueSchema = ReconciliationIssueSchema.extend({
	subject: z.union([QualifiedSubjectIdSchema, SemanticIdSchema]),
});
const ModelStandingSchema = z
	.strictObject({
		against: SemanticIdSchema,
		baseline: CheckpointIdSchema,
		atRevision: z.string().regex(/^[a-f0-9]{64}$/u),
		issues: z.array(ModelIssueSchema),
		blockedBy: SemanticIdSchema.optional(),
	})
	.refine(
		(value) => value.issues.length > 0 || value.blockedBy !== undefined,
		"Standing requires issues or a blocked ancestor.",
	);
const FamilyStandingSchema = z.array(
	z.strictObject({ state: SemanticIdSchema, standing: ModelStandingSchema.optional() }),
);
const ProposalSchema = StateMetadataSchema.extend({
	schemaVersion: z.literal(1),
	lifecycle: z.literal("draft"),
	createdAt: z.iso.datetime().optional(),
	predecessor: SemanticIdSchema.nullable(),
	predecessorRevision: z.string().regex(/^[a-f0-9]{64}$/u),
	baseline: CheckpointIdSchema,
	changes: z.array(ProposalChangeSchema),
	standing: ModelStandingSchema.optional(),
	retiredIds: z.array(QualifiedSubjectIdSchema).optional(),
	restorations: z
		.array(z.strictObject({ subject: QualifiedSubjectIdSchema, checkpoint: CheckpointIdSchema }))
		.optional(),
}).strict();
const CorrectionIntentSchema = z.strictObject({
	previous: CheckpointIdSchema,
	reason: z.string().trim().min(1),
	revisions: HistoricalRevisionsSchema,
});
const CorrectionAuditSchema = CorrectionIntentSchema.extend({
	at: z.iso.datetime(),
	checkpoint: CheckpointIdSchema,
});
const CorrectionSchema = CorrectionAuditSchema.omit({ checkpoint: true }).extend({
	changes: z.array(ProposalChangeSchema),
	retiredIds: z.array(QualifiedSubjectIdSchema).optional(),
});
const SelectedStateSchema = StateLineageSchema.extend({
	lifecycle: z.enum(["current", "draft", "historical", "shelved"]),
	predecessor: SemanticIdSchema.nullable().optional(),
	baseline: CheckpointIdSchema.optional(),
	standing: ModelStandingSchema.optional(),
	corrections: z.array(CorrectionAuditSchema).optional(),
}).strict();
const LifecycleSchema = z.strictObject({
	type: z.enum(["adopt", "shelve"]),
	at: z.iso.datetime(),
	reason: z.string().min(1),
	proposal: ProposalSchema,
	previous: z
		.strictObject({ state: SelectedStateSchema, checkpoint: CheckpointIdSchema })
		.nullable(),
});
const ComparisonSchema = z.strictObject({
	reason: z.enum(["explicit", "current", "predecessor"]),
	against: SelectedStateSchema.nullable(),
	revision: ModelRevisionSchema,
	checkpoint: CheckpointIdSchema.optional(),
	corrections: z
		.strictObject({
			selected: z.array(CorrectionAuditSchema),
			against: z.array(CorrectionAuditSchema),
		})
		.optional(),
	subjects: z.array(
		z.strictObject({
			id: QualifiedSubjectIdSchema,
			subjectKind: SubjectKindSchema,
			kind: z.enum(["added", "removed", "changed", "unchanged"]),
			fields: z.array(
				z.strictObject({
					field: z.string(),
					before: z.unknown().optional(),
					after: z.unknown().optional(),
				}),
			),
		}),
	),
});
export {
	StateSelectionSchema,
	ModelStandingSchema,
	ModelIssueSchema,
	FamilyStandingSchema,
	ProposalSchema,
	SelectedStateSchema,
	LifecycleSchema,
	ComparisonSchema,
	ProposalChangeSchema,
	SubjectKindSchema,
	CorrectionIntentSchema,
	CorrectionSchema,
	CorrectionAuditSchema,
};
