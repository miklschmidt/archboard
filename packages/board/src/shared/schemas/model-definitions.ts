import { MigrationReadingsSchema } from "#shared/schemas/migration-readings.ts";
import { z } from "zod";
import { LegacyOriginalInputsSchema } from "#shared/schemas/migration-inputs.ts";
import { ModelDiagnosticSchema } from "#shared/schemas/model-diagnostic.ts";
import { ProposalChangeSchema } from "#shared/schemas/model-changes.ts";
import { LegacyDraftMappingSchema } from "#shared/schemas/migration-drafts.ts";
import { SemanticBoardSchema, SemanticVariantSchema } from "#shared/schemas/board-document.ts";
import { DocumentReferenceSchema } from "@archboard/code-binding/bindings";
import { SemanticEdgeSchema, SemanticNodeSchema } from "#shared/schemas/content.ts";
import {
	SemanticIdSchema,
	DisplayNameSchema,
	DescriptionSchema,
	QualifiedSubjectIdSchema,
} from "#shared/schemas/primitives.ts";
const GitObjectIdSchema = z.string().regex(/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/u);
const ModelReferenceSchema = z
	.strictObject({
		repo: z.string().min(1),
		model: SemanticIdSchema,
		subject: QualifiedSubjectIdSchema,
		state: z.union([SemanticIdSchema, QualifiedSubjectIdSchema]),
		checkpoint: GitObjectIdSchema.optional(),
	})
	.refine((reference) => reference.checkpoint === undefined || reference.state !== "current", {
		message: "An exact reference requires a stable state identity.",
		path: ["state"],
	});

const ModelRevisionSchema = z
	.object({
		digest: z.string(),
		files: z.array(z.object({ path: z.string(), sha256: z.string() }).strict()),
	})
	.strict();

const StateMetadataSchema = z
	.object({
		id: SemanticIdSchema,
		name: DisplayNameSchema,
		formerNames: z.array(DisplayNameSchema).optional(),
		summary: DescriptionSchema.optional(),
		documents: z.array(DocumentReferenceSchema).optional(),
	})
	.strict();

const LegacyCoverageSchema = z.strictObject({
	legacy: QualifiedSubjectIdSchema,
	board: SemanticIdSchema,
	file: z.string(),
	completeModel: z.literal(false),
});
const MigrationPreviewSchema = MigrationReadingsSchema.extend({
	installation: z
		.strictObject({
			expectedRevision: ModelRevisionSchema,
			expectedContext: z.string().regex(/^[a-f0-9]{64}$/u),
		})
		.optional(),
	selected: LegacyCoverageSchema.optional(),
	diagnostics: z.array(ModelDiagnosticSchema).optional(),
	history: z
		.array(
			LegacyCoverageSchema.extend({
				conversion: LegacyDraftMappingSchema.extend({
					baselineDigest: z.string(),
					changes: z.array(ProposalChangeSchema),
				}).optional(),
				canonical: QualifiedSubjectIdSchema,
				state: SemanticVariantSchema.omit({ content: true }),
				adoptions: SemanticBoardSchema.shape.adoptions,
				shelvings: SemanticBoardSchema.shape.shelvings,
			}),
		)
		.optional(),
	originalInputs: LegacyOriginalInputsSchema.optional(),
	originals: z
		.array(
			z.strictObject({
				file: z.string(),
				source: z.string(),
				sourceBase64: z.string().optional(),
				document: SemanticBoardSchema.optional(),
			}),
		)
		.optional(),
	origin: SemanticIdSchema,
	source: ModelRevisionSchema,
	planRevision: z.string().nullable(),
	coverage: z.array(
		z.strictObject({
			board: SemanticIdSchema,
			file: z.string(),
			name: DisplayNameSchema,
			formerNames: z.array(DisplayNameSchema).optional(),
			current: StateMetadataSchema.extend({ legacy: QualifiedSubjectIdSchema }).optional(),
		}),
	),
	plannedBoards: z.array(
		z.strictObject({
			board: SemanticIdSchema,
			states: z.array(
				StateMetadataSchema.extend({
					legacy: QualifiedSubjectIdSchema,
					canonical: QualifiedSubjectIdSchema,
					lifecycle: z.enum(["draft", "shelved", "historical", "current"]),
				}),
			),
		}),
	),
});

const StateLineageSchema = StateMetadataSchema.extend({
	predecessor: SemanticIdSchema.nullable().optional(),
	baseline: GitObjectIdSchema.optional(),
	createdAt: z.iso.datetime().optional(),
	adoptedAt: z.iso.datetime().optional(),
	shelvedAt: z.iso.datetime().optional(),
	reason: z.string().min(1).optional(),
	previousCurrent: SemanticIdSchema.nullable().optional(),
}).strict();

const ArchitectureManifestSchema = z
	.object({
		schemaVersion: z.literal(1),
		id: SemanticIdSchema,
		name: DisplayNameSchema,
		current: StateLineageSchema.nullable(),
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
	references: z.array(ModelReferenceSchema).optional(),
	outgoing: z.array(OwnedRelationshipSchema),
});

export {
	GitObjectIdSchema,
	ModelReferenceSchema,
	ModelRevisionSchema,
	StateMetadataSchema,
	MigrationPreviewSchema,
	StateLineageSchema,
	ArchitectureManifestSchema,
	ArchitectureModuleSchema,
};
