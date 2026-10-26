import { z } from "zod";
import { CodeBindingSchema } from "@archboard/code-binding/bindings";
import { SemanticIdSchema } from "#shared/schemas/primitives.ts";
import {
	GitObjectIdSchema,
	ModelReferenceSchema,
	StateMetadataSchema,
	ModelRevisionSchema,
	ArchitectureManifestSchema,
	ArchitectureModuleSchema,
} from "#shared/schemas/model-definitions.ts";
import {
	ProposalSchema,
	SelectedStateSchema,
	ComparisonSchema,
} from "#shared/schemas/model-proposals.ts";
import { QualifiedSubjectIdSchema } from "#shared/schemas/primitives.ts";
import { FlowCollectionSchema } from "#shared/schemas/model-flows.ts";
import { SemanticPolicySchema } from "#shared/schemas/semantic-policy.ts";

const ModelReferenceAddressSchema = z.strictObject({
	vault: z.string(),
	model: SemanticIdSchema,
	subject: QualifiedSubjectIdSchema,
	state: SemanticIdSchema,
	checkpoint: GitObjectIdSchema.optional(),
});

const ModelDiagnosticSchema = z
	.object({
		code: z.string(),
		file: z.string(),
		path: z.string().optional(),
		subjects: z.array(z.string()).optional(),
		message: z.string(),
		recovery: z.string(),
	})
	.strict();

const PublicationStateSchema = z.enum([
	"saved-locally",
	"publication-pending",
	"published",
	"unavailable",
]);
const ArchitecturePublicationDestinationSchema = z
	.object({
		remote: z
			.string()
			.min(1)
			.regex(/^[^-\s][^\s]*$/u),
		ref: z.string().startsWith("refs/heads/"),
	})
	.strict();
const ArchitecturePublicationRequestSchema = ArchitecturePublicationDestinationSchema.extend({
	checkpoint: GitObjectIdSchema,
});
const RetentionPolicySchema = z
	.object({ protected: z.literal(false), limitation: z.string(), recovery: z.string() })
	.strict();
const ModelRecoverySchema = z
	.object({
		operationId: z.string(),
		checkpoint: GitObjectIdSchema,
		phase: z.enum(["prepared", "installing", "installed", "completed"]),
		subjects: z.array(QualifiedSubjectIdSchema),
		before: ModelRevisionSchema,
		after: ModelRevisionSchema,
		checkout: z.object({ branch: z.string(), head: GitObjectIdSchema.nullable() }).strict(),
	})
	.strict();
const ArchitectureCheckpointRequestSchema = z
	.object({
		target: z.literal("current"),
		operationId: z.string().min(1),
		writer: z.string().min(1),
		doing: z.string().min(1),
		expectedRevision: z.string().regex(/^[a-f0-9]{64}$/u),
		dependencies: z.array(GitObjectIdSchema).default([]),
	})
	.strict();
const ArchitectureCheckpointSchema = z
	.object({
		id: GitObjectIdSchema,
		model: SemanticIdSchema,
		state: StateMetadataSchema,
		selection: SelectedStateSchema.nullable().optional(),
		revision: ModelRevisionSchema,
		createdAt: z.iso.datetime(),
		request: ArchitectureCheckpointRequestSchema,
		sources: z.array(
			z
				.object({
					repo: z.string().min(1),
					commit: GitObjectIdSchema.nullable(),
					uncommitted: z.boolean(),
				})
				.strict(),
		),
		publication: PublicationStateSchema,
		references: z
			.array(
				z.strictObject({
					module: QualifiedSubjectIdSchema,
					index: z.number().int().nonnegative(),
					reference: ModelReferenceSchema,
					checkpoint: GitObjectIdSchema,
				}),
			)
			.optional(),
	})
	.strict();

const ArchitectureModelSchema = z
	.object({
		success: z.literal(true),
		manifest: ArchitectureManifestSchema,
		policy: SemanticPolicySchema,
		modules: z.array(ArchitectureModuleSchema.extend({ file: z.string() })),
		collections: z.array(FlowCollectionSchema.extend({ file: z.string() })),
		relationships: z.array(
			ArchitectureModuleSchema.shape.outgoing.element.extend({ from: QualifiedSubjectIdSchema }),
		),
		roots: z.array(QualifiedSubjectIdSchema),
		selectedState: SelectedStateSchema.nullable(),
		proposals: z.array(ProposalSchema.extend({ file: z.string() })),
		comparison: ComparisonSchema.optional(),
		selectedModule: QualifiedSubjectIdSchema.optional(),
		selectedSubject: QualifiedSubjectIdSchema.optional(),
		selectedFlow: QualifiedSubjectIdSchema.optional(),
		revision: ModelRevisionSchema,
		checkpoint: ArchitectureCheckpointSchema.optional(),
		location: ModelReferenceAddressSchema.optional(),
		codeBinding: CodeBindingSchema.optional(),
		resolvedReferences: z
			.array(
				z.strictObject({
					module: QualifiedSubjectIdSchema,
					index: z.number().int().nonnegative(),
					reference: ModelReferenceSchema,
					status: z.enum(["available", "unavailable"]),
					name: z.string().optional(),
					modelName: ArchitectureManifestSchema.shape.name.optional(),
					stateName: SelectedStateSchema.shape.name.optional(),
					lifecycle: SelectedStateSchema.shape.lifecycle.optional(),
					address: ModelReferenceAddressSchema.optional(),
					diagnostics: z.array(ModelDiagnosticSchema),
				}),
			)
			.optional(),
		codeTarget: z
			.discriminatedUnion("ok", [
				z.strictObject({
					ok: z.literal(true),
					repository: z.string(),
					root: z.string(),
					target: z.string(),
					path: z.string(),
					kind: z.enum(["file", "directory"]),
					otherRef: z.strictObject({ named: z.string(), checkedOut: z.string() }).optional(),
				}),
				z.strictObject({ ok: z.literal(false), code: z.string(), error: z.string() }),
			])
			.optional(),
		sourceEvidence: z
			.array(
				ArchitectureCheckpointSchema.shape.sources.element.extend({
					status: z.enum(["available", "uncommitted", "unavailable"]),
					recovery: z.string().optional(),
				}),
			)
			.optional(),
	})
	.strict();
const ArchitectureModelFailureSchema = z
	.object({
		success: z.literal(false),
		code: z.enum([
			"STATE_NOT_FOUND",
			"STATE_AMBIGUOUS",
			"PREDECESSOR_CHANGED",
			"MODEL_INVALID",
			"MODEL_NOT_FOUND",
			"MODEL_UNREADABLE",
			"MODEL_CHANGED",
			"LEGACY_AUTHORITY",
			"MODULE_NOT_FOUND",
			"FLOW_REQUIRED",
			"FLOW_NOT_FOUND",
			"FLOW_AMBIGUOUS",
			"RELATIONSHIP_NOT_FOUND",
			"NODE_HAS_CHILDREN",
			"MODULE_AMBIGUOUS",
			"REFERENCE_UNAVAILABLE",
			"ARCHIVE_NOT_INITIALIZED",
			"ARCHIVE_UNREADABLE",
			"ARCHIVE_IN_USE",
			"ARCHITECTURE_UNAVAILABLE",
			"CHECKPOINT_INVALID",
			"CHECKPOINT_REQUIRED",
			"STALE_REVISION",
			"ARCHIVE_WRITE_FAILED",
			"ARCHIVE_COMMIT_FAILED",
			"ARCHIVE_BUSY",
			"OPERATION_REUSED",
			"PUBLICATION_NOT_CONFIGURED",
			"PUBLICATION_DESTINATION_CHANGED",
			"PUBLICATION_INVALID",
			"ARCHIVE_NETWORK_FAILED",
			"ARCHIVE_NOT_PORTABLE",
			"MODEL_BUSY",
			"TARGET_CHANGED",
			"CLAIM_REQUIRED",
			"CLAIM_HELD",
			"CLAIM_REVOKED",
			"RECOVERY_REQUIRED",
			"RECOVERY_CONTEXT_CHANGED",
			"RECOVERY_CONFLICT",
			"MODEL_WRITE_FAILED",
		]),
		error: z.string(),
		diagnostics: z.array(ModelDiagnosticSchema).min(1),
		publication: PublicationStateSchema.optional(),
		checkpoint: GitObjectIdSchema.optional(),
		destination: ArchitecturePublicationDestinationSchema.optional(),
		retention: RetentionPolicySchema.optional(),
		applied: z.union([z.literal(false), z.literal("unknown")]).optional(),
		reconciliation: z.literal(false).optional(),
		recovery: ModelRecoverySchema.optional(),
	})
	.strict();
const ArchitectureModelReadSchema = z.discriminatedUnion("success", [
	ArchitectureModelSchema,
	ArchitectureModelFailureSchema,
]);
const ArchitectureCheckpointRetainSchema = z.discriminatedUnion("success", [
	z.object({ success: z.literal(true), checkpoint: ArchitectureCheckpointSchema }).strict(),
	ArchitectureModelFailureSchema,
]);
const ArchitectureCheckpointListSchema = z.discriminatedUnion("success", [
	z
		.object({ success: z.literal(true), checkpoints: z.array(ArchitectureCheckpointSchema) })
		.strict(),
	ArchitectureModelFailureSchema,
]);
const ArchitectureArchiveInitializationSchema = z.discriminatedUnion("success", [
	z
		.object({
			success: z.literal(true),
			archive: z.string().min(1),
		})
		.strict(),
	ArchitectureModelFailureSchema,
]);
const ArchitecturePublicationSchema = z.discriminatedUnion("success", [
	z
		.object({
			success: z.literal(true),
			publication: PublicationStateSchema,
			checkpoint: GitObjectIdSchema.optional(),
			destination: ArchitecturePublicationDestinationSchema.optional(),
			publishedTip: GitObjectIdSchema.optional(),
			retention: RetentionPolicySchema,
		})
		.strict(),
	ArchitectureModelFailureSchema,
]);
type ArchitectureCheckpointRequest = z.infer<typeof ArchitectureCheckpointRequestSchema>;
type ArchitectureCheckpoint = z.infer<typeof ArchitectureCheckpointSchema>;
type ArchitectureCheckpointRetain = z.infer<typeof ArchitectureCheckpointRetainSchema>;
type ArchitectureCheckpointList = z.infer<typeof ArchitectureCheckpointListSchema>;
type ArchitectureModelRead = z.infer<typeof ArchitectureModelReadSchema>;
type ArchitectureModel = z.infer<typeof ArchitectureModelSchema>;
type ModelDiagnostic = z.infer<typeof ModelDiagnosticSchema>;

export {
	ArchitectureArchiveInitializationSchema,
	ArchitecturePublicationDestinationSchema,
	ArchitecturePublicationRequestSchema,
	ArchitecturePublicationSchema,
	GitObjectIdSchema,
	ModelRevisionSchema,
	ModelRecoverySchema,
	ModelDiagnosticSchema,
	ArchitectureModelFailureSchema,
	ArchitectureCheckpointRequestSchema,
	ArchitectureCheckpointSchema,
	ArchitectureCheckpointRetainSchema,
	ArchitectureCheckpointListSchema,
	type ArchitectureCheckpointRequest,
	type ArchitectureCheckpoint,
	type ArchitectureCheckpointRetain,
	type ArchitectureCheckpointList,
	QualifiedSubjectIdSchema,
	ArchitectureManifestSchema,
	ArchitectureModuleSchema,
	ArchitectureModelReadSchema,
	type ArchitectureModelRead,
	type ArchitectureModel,
	type ModelDiagnostic,
};
