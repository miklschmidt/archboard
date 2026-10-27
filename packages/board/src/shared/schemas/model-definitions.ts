import { z } from "zod";
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
		state: SemanticIdSchema,
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

const MigrationPreviewSchema = z.strictObject({
	origin: SemanticIdSchema,
	source: ModelRevisionSchema,
	planRevision: z.string(),
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
