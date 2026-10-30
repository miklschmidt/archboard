import { WalkthroughChangeSchema } from "#shared/schemas/model-walkthroughs.ts";
import {
	ComparisonSchema,
	CorrectionIntentSchema,
	FamilyStandingSchema,
	SelectedStateSchema,
} from "#shared/schemas/model-proposals.ts";
import { DiagramGrammarSchema } from "#shared/schemas/vocabulary.ts";
import { StandaloneThemeSchema, DiagramAtlasSchema } from "#shared/protocol/render-reply.ts";
import { FlowChangeSchema } from "#shared/schemas/model-flows.ts";
import { z } from "zod";
import { SemanticIdSchema, SingleLineTextSchema } from "#shared/schemas/primitives.ts";
import {
	ArchitectureModuleSchema,
	ArchitectureCheckpointSchema,
	ArchitectureModelFailureSchema,
	ArchitectureModelReadSchema,
	ModelRevisionSchema,
	QualifiedSubjectIdSchema,
} from "#shared/schemas/model.ts";

const ArchitectureRenderRequestSchema = z.strictObject({
	flow: z.string().min(1).optional(),
	grammar: DiagramGrammarSchema.default("architecture"),
	module: z.string().min(1).optional(),
	state: z.string().min(1).optional(),
	scope: QualifiedSubjectIdSchema.optional(),
	focus: z.array(QualifiedSubjectIdSchema).optional(),
	hideKinds: z.array(z.string()).optional(),
	hideGroups: z.array(z.string()).optional(),
	checkpoint: z.string().min(1).optional(),
	theme: StandaloneThemeSchema.optional(),
});
const ArchitectureRenderResultSchema = z.discriminatedUnion("success", [
	z.strictObject({
		success: z.literal(true),
		model: SemanticIdSchema,
		state: z.string().nullable().optional(),
		flow: QualifiedSubjectIdSchema.optional(),
		grammar: ArchitectureRenderRequestSchema.shape.grammar,
		revision: ModelRevisionSchema,
		checkpoint: z.string().optional(),
		svg: z.string(),
		width: z.number(),
		height: z.number(),
		placed: z.array(z.string()),
		atlas: DiagramAtlasSchema,
	}),
	ArchitectureModelFailureSchema,
]);
import { StateMetadataSchema } from "#shared/schemas/model-definitions.ts";

const ArchitectureTargetSchema = z
	.object({ model: SemanticIdSchema, state: SemanticIdSchema.nullable() })
	.strict();
const ArchitectureClaimRequestSchema = z
	.object({
		target: ArchitectureTargetSchema,
		writer: SingleLineTextSchema,
		reason: SingleLineTextSchema.max(140),
		subjects: z.array(z.union([QualifiedSubjectIdSchema, SemanticIdSchema])).min(1),
	})
	.strict();
const ArchitectureClaimSchema = ArchitectureClaimRequestSchema.extend({
	id: SemanticIdSchema,
	since: z.iso.datetime(),
	until: z.iso.datetime(),
});
const ArchitectureClaimListSchema = z.discriminatedUnion("success", [
	z.object({ success: z.literal(true), claims: z.array(ArchitectureClaimSchema) }).strict(),
	ArchitectureModelFailureSchema,
]);
const ArchitectureClaimResultSchema = z.discriminatedUnion("success", [
	z.object({ success: z.literal(true), claim: ArchitectureClaimSchema }).strict(),
	ArchitectureModelFailureSchema,
]);
const ArchitectureClaimReleaseSchema = z
	.object({ claim: SemanticIdSchema, writer: SingleLineTextSchema })
	.strict();
const ArchitectureClaimTakeBackSchema = z
	.object({ claim: SemanticIdSchema, origin: z.literal("human") })
	.strict();
const DescriptionEditSchema = z
	.object({
		target: ArchitectureTargetSchema,
		subject: QualifiedSubjectIdSchema,
		expectedRevision: ModelRevisionSchema,
		operationId: SingleLineTextSchema,
		writer: SingleLineTextSchema,
		doing: SingleLineTextSchema.max(140),
		claim: SemanticIdSchema,
		description: ArchitectureModuleSchema.shape.description.unwrap(),
	})
	.strict();
const ModuleFieldsSchema = ArchitectureModuleSchema.omit({
	schemaVersion: true,
	id: true,
	outgoing: true,
	formerNames: true,
}).extend({ parent: SingleLineTextSchema.optional() });
const RelationshipFieldsSchema = ArchitectureModuleSchema.shape.outgoing.element
	.omit({ id: true })
	.extend({ to: SingleLineTextSchema });
const StructureChangeSchema = z.discriminatedUnion("type", [
	z.object({ type: z.literal("remove-module"), subject: SingleLineTextSchema }).strict(),
	z
		.object({
			type: z.literal("add-relationship"),
			source: SingleLineTextSchema,
			relationship: RelationshipFieldsSchema,
		})
		.strict(),
	z.object({ type: z.literal("remove-relationship"), subject: QualifiedSubjectIdSchema }).strict(),
	z
		.object({
			type: z.literal("edit-relationship"),
			subject: QualifiedSubjectIdSchema,
			source: SingleLineTextSchema.optional(),
			set: RelationshipFieldsSchema.partial()
				.extend({ emphasis: RelationshipFieldsSchema.shape.emphasis.removeDefault().optional() })
				.optional(),
			clear: z.array(z.enum(["label", "description", "traffic", "anchor"])).optional(),
		})
		.strict(),
	z.object({ type: z.literal("add-module"), module: ModuleFieldsSchema }).strict(),
	z
		.object({
			type: z.literal("edit-module"),
			subject: SingleLineTextSchema,
			set: ModuleFieldsSchema.partial().optional(),
			clear: z
				.array(
					z.enum([
						"responsibility",
						"description",
						"parent",
						"groups",
						"binding",
						"documents",
						"references",
					]),
				)
				.optional(),
		})
		.strict(),
]);
const ProposalConfirmationsSchema = z.array(z.enum(["INHERITANCE_DROPPED", "PART_RECREATED"]));
const ProposalIntentSchema = z.discriminatedUnion("type", [
	z.strictObject({
		type: z.literal("adopt"),
		reason: z.string().trim().min(1),
		force: z.boolean().optional(),
		comparison: ComparisonSchema.optional(),
	}),
	z.strictObject({ type: z.literal("shelve"), reason: z.string().trim().min(1) }),
	z.strictObject({ type: z.literal("reconcile") }),
	z.strictObject({
		type: z.literal("settle"),
		resolutions: z
			.array(
				z.strictObject({
					subject: z.union([QualifiedSubjectIdSchema, SemanticIdSchema]),
					field: z.string().optional(),
					take: z.enum(["mine", "theirs", "edited"]),
				}),
			)
			.min(1),
	}),
	z.strictObject({
		type: z.literal("create"),
		confirm: ProposalConfirmationsSchema.optional(),
		...StateMetadataSchema.omit({ id: true, formerNames: true }).shape,
	}),
	z.strictObject({
		type: z.literal("edit"),
		confirm: ProposalConfirmationsSchema.optional(),
		set: StateMetadataSchema.omit({ id: true, formerNames: true }).partial().optional(),
		clear: z.array(z.enum(["summary", "documents"])).optional(),
	}),
]);
const ArchitectureChangesSchema = z.array(
	z.union([StructureChangeSchema, FlowChangeSchema, WalkthroughChangeSchema]),
);
const ArchitectureModuleEditSchema = z.union([
	DescriptionEditSchema.omit({ subject: true, description: true })
		.extend({
			correction: CorrectionIntentSchema,
			changes: ArchitectureChangesSchema.min(1),
		})
		.strict(),
	DescriptionEditSchema.omit({ subject: true, description: true })
		.extend({
			proposal: ProposalIntentSchema,
			changes: ArchitectureChangesSchema,
		})
		.strict(),
	DescriptionEditSchema,
	DescriptionEditSchema.omit({ subject: true, description: true })
		.extend({ changes: ArchitectureChangesSchema.min(1) })
		.strict(),
]);
const ArchitectureEditSuccessSchema = z
	.object({
		success: z.literal(true),
		applied: z.literal(true),
		reconciliation: z.boolean(),
		reconciliations: FamilyStandingSchema.optional(),
		confirmed: ProposalConfirmationsSchema.optional(),
		operationId: z.string(),
		target: ArchitectureTargetSchema,
		subjects: z.array(QualifiedSubjectIdSchema),
		before: ModelRevisionSchema,
		after: ModelRevisionSchema,
		checkpoint: ArchitectureCheckpointSchema,
		selectedState: SelectedStateSchema.optional(),
		cleanup: z.enum(["complete", "pending"]),
	})
	.strict();
const ArchitectureModuleEditResultSchema = z.discriminatedUnion("success", [
	ArchitectureEditSuccessSchema,
	ArchitectureModelFailureSchema,
]);
const ArchitectureRecoveryResultSchema = z.discriminatedUnion("success", [
	z
		.object({ success: z.literal(true), operation: ArchitectureEditSuccessSchema.optional() })
		.strict(),
	ArchitectureModelFailureSchema,
]);
const ArchitectureEventSchema = z.discriminatedUnion("type", [
	z
		.object({
			type: z.literal("architecture_snapshot"),
			vault: z.string(),
			reading: ArchitectureModelReadSchema,
			claims: ArchitectureClaimListSchema,
		})
		.strict(),
	z
		.object({
			type: z.literal("architecture_changed"),
			vault: z.string(),
			model: SemanticIdSchema,
			state: SemanticIdSchema.nullable(),
			revision: ModelRevisionSchema,
			subjects: z.array(QualifiedSubjectIdSchema),
			reason: z.enum(["completed", "external"]),
			operation: ArchitectureEditSuccessSchema.optional(),
		})
		.strict(),
	z
		.object({
			type: z.literal("architecture_status"),
			vault: z.string(),
			reading: ArchitectureModelFailureSchema,
		})
		.strict(),
	z
		.object({
			type: z.literal("architecture_claims"),
			vault: z.string(),
			claims: ArchitectureClaimListSchema,
		})
		.strict(),
]);

type ArchitectureModuleEdit = z.infer<typeof ArchitectureModuleEditSchema>;
type ArchitectureModuleEditResult = z.infer<typeof ArchitectureModuleEditResultSchema>;
type ArchitectureClaim = z.infer<typeof ArchitectureClaimSchema>;
type ArchitectureClaimRequest = z.infer<typeof ArchitectureClaimRequestSchema>;
type ArchitectureClaimList = z.infer<typeof ArchitectureClaimListSchema>;
type ArchitectureClaimResult = z.infer<typeof ArchitectureClaimResultSchema>;
type ArchitectureRecoveryResult = z.infer<typeof ArchitectureRecoveryResultSchema>;
type ArchitectureEvent = z.infer<typeof ArchitectureEventSchema>;
export {
	ArchitectureRenderRequestSchema,
	ArchitectureRenderResultSchema,
	ArchitectureTargetSchema,
	ArchitectureClaimSchema,
	ArchitectureClaimRequestSchema,
	ArchitectureClaimListSchema,
	ArchitectureClaimResultSchema,
	ArchitectureClaimReleaseSchema,
	ArchitectureClaimTakeBackSchema,
	ArchitectureModuleEditSchema,
	ArchitectureModuleEditResultSchema,
	ArchitectureEditSuccessSchema,
	ArchitectureRecoveryResultSchema,
	ArchitectureEventSchema,
	type ArchitectureModuleEdit,
	type ArchitectureModuleEditResult,
	type ArchitectureClaim,
	type ArchitectureClaimRequest,
	type ArchitectureClaimList,
	type ArchitectureClaimResult,
	type ArchitectureRecoveryResult,
	type ArchitectureEvent,
};
