import { z } from "zod";
import { DocumentReferenceSchema } from "@archboard/code-binding/bindings";
import { SemanticEdgeSchema, SemanticNodeSchema } from "#shared/schemas/content.ts";
import {
	SemanticIdSchema,
	DisplayNameSchema,
	DescriptionSchema,
} from "#shared/schemas/primitives.ts";
import { BLOCK_ID_RE } from "#shared/rules/ids.ts";
import { SemanticPolicySchema } from "#shared/schemas/semantic-policy.ts";

/** Model[/original-board]#local-id. Namespace segments preserve identity provenance. */
const localIdPattern = BLOCK_ID_RE.source.slice(1, -1);
const QualifiedSubjectIdSchema = z
	.string()
	.regex(
		new RegExp(`^${localIdPattern}(?:/${localIdPattern})?#${localIdPattern}$`, "u"),
		"Use model[/original-board]#local-id, with one to eight characters per id",
	);

const StateMetadataSchema = z
	.object({
		id: SemanticIdSchema,
		name: DisplayNameSchema,
		formerNames: z.array(DisplayNameSchema).optional(),
		summary: DescriptionSchema.optional(),
		documents: z.array(DocumentReferenceSchema).optional(),
	})
	.strict();

const ArchitectureManifestSchema = z
	.object({
		schemaVersion: z.literal(1),
		id: SemanticIdSchema,
		name: DisplayNameSchema,
		current: StateMetadataSchema.nullable(),
		retiredIds: z.array(QualifiedSubjectIdSchema).optional(),
	})
	.strict();

const OwnedRelationshipSchema = SemanticEdgeSchema.omit({ id: true, from: true, to: true }).extend({
	id: QualifiedSubjectIdSchema,
	to: QualifiedSubjectIdSchema,
});
const ArchitectureModuleSchema = SemanticNodeSchema.omit({
	id: true,
	parent: true,
	drillDown: true,
}).extend({
	schemaVersion: z.literal(1),
	id: QualifiedSubjectIdSchema,
	parent: QualifiedSubjectIdSchema.optional(),
	formerNames: z.array(DisplayNameSchema).optional(),
	documents: z.array(DocumentReferenceSchema).optional(),
	outgoing: z.array(OwnedRelationshipSchema),
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

const GitObjectIdSchema = z.string().regex(/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/u);
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
const ModelRevisionSchema = z
	.object({
		digest: z.string(),
		files: z.array(z.object({ path: z.string(), sha256: z.string() }).strict()),
	})
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
	})
	.strict();

const ArchitectureModelSchema = z
	.object({
		success: z.literal(true),
		manifest: ArchitectureManifestSchema,
		policy: SemanticPolicySchema,
		modules: z.array(ArchitectureModuleSchema.extend({ file: z.string() })),
		relationships: z.array(OwnedRelationshipSchema.extend({ from: QualifiedSubjectIdSchema })),
		roots: z.array(QualifiedSubjectIdSchema),
		selectedModule: QualifiedSubjectIdSchema.optional(),
		revision: ModelRevisionSchema,
		checkpoint: ArchitectureCheckpointSchema.optional(),
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
			"MODEL_INVALID",
			"MODEL_NOT_FOUND",
			"MODEL_UNREADABLE",
			"MODEL_CHANGED",
			"LEGACY_AUTHORITY",
			"MODULE_NOT_FOUND",
			"RELATIONSHIP_NOT_FOUND",
			"NODE_HAS_CHILDREN",
			"MODULE_AMBIGUOUS",
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
