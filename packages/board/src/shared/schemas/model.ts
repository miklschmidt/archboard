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

const ModelRevisionSchema = z
	.object({
		digest: z.string(),
		files: z.array(z.object({ path: z.string(), sha256: z.string() }).strict()),
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
			"MODULE_AMBIGUOUS",
		]),
		error: z.string(),
		diagnostics: z.array(ModelDiagnosticSchema).min(1),
	})
	.strict();
const ArchitectureModelReadSchema = z.discriminatedUnion("success", [
	ArchitectureModelSchema,
	ArchitectureModelFailureSchema,
]);
type ArchitectureModelRead = z.infer<typeof ArchitectureModelReadSchema>;
type ArchitectureModel = z.infer<typeof ArchitectureModelSchema>;
type ModelDiagnostic = z.infer<typeof ModelDiagnosticSchema>;

export {
	QualifiedSubjectIdSchema,
	ModelDiagnosticSchema,
	ModelRevisionSchema,
	ArchitectureManifestSchema,
	ArchitectureModuleSchema,
	ArchitectureModelReadSchema,
	type ArchitectureModelRead,
	type ArchitectureModel,
	type ModelDiagnostic,
};
