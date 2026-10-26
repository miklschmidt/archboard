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

const ArchitectureTargetSchema = z
	.object({ model: SemanticIdSchema, state: SemanticIdSchema })
	.strict();
const ArchitectureClaimRequestSchema = z
	.object({
		target: ArchitectureTargetSchema,
		writer: SingleLineTextSchema,
		reason: SingleLineTextSchema.max(140),
		subjects: z.array(QualifiedSubjectIdSchema).min(1),
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
const ArchitectureModuleEditSchema = z
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
const ArchitectureEditSuccessSchema = z
	.object({
		success: z.literal(true),
		applied: z.literal(true),
		reconciliation: z.literal(false),
		operationId: z.string(),
		target: ArchitectureTargetSchema,
		subjects: z.array(QualifiedSubjectIdSchema),
		before: ModelRevisionSchema,
		after: ModelRevisionSchema,
		checkpoint: ArchitectureCheckpointSchema,
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
