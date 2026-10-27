import { z } from "zod";
import { LegacyDraftMappingSchema } from "#shared/schemas/migration-drafts.ts";
import { ModelReferenceSchema } from "#shared/schemas/model-definitions.ts";
import { SemanticBoardSchema } from "#shared/schemas/board-document.ts";
import { SemanticIdSchema } from "#shared/schemas/primitives.ts";
import { SemanticPolicySchema } from "#shared/schemas/semantic-policy.ts";
import {
	QualifiedSubjectIdSchema,
	ModelDiagnosticSchema,
	ModelRevisionSchema,
} from "#shared/schemas/model.ts";

const LegacyIdentitySchema = z.strictObject({
	id: QualifiedSubjectIdSchema,
	board: SemanticIdSchema,
	localId: SemanticIdSchema,
	kind: z.enum(["state", "node", "edge", "flow", "step", "view", "walkthrough", "beat"]),
});
const LegacyAliasSchema = z.strictObject({
	address: z.string(),
	board: SemanticIdSchema,
	state: SemanticIdSchema.optional(),
});
const LegacyOccurrenceSchema = z.strictObject({
	file: z.string(),
	state: SemanticIdSchema.optional(),
	subject: QualifiedSubjectIdSchema.optional(),
	path: z.string(),
	value: z.unknown(),
});
const MigrationConflictSchema = z.strictObject({
	key: z.string(),
	kind: z.enum(["definition", "parent", "order", "relationship-owner", "policy"]),
	options: z.array(LegacyOccurrenceSchema),
});
const LegacyMappingPlanSchema = z.strictObject({
	schemaVersion: z.literal(1),
	origin: SemanticIdSchema,
	sourceDigest: z.string(),
	drafts: z.array(LegacyDraftMappingSchema).optional(),
	references: z
		.array(
			z.strictObject({
				legacy: QualifiedSubjectIdSchema,
				state: QualifiedSubjectIdSchema.optional(),
				reference: ModelReferenceSchema,
				reason: z.string().trim().min(1),
			}),
		)
		.optional(),
	mappings: z.array(
		z.strictObject({
			legacy: QualifiedSubjectIdSchema,
			canonical: QualifiedSubjectIdSchema,
			reason: z.string().trim().min(1),
		}),
	),
	choices: z.array(
		z.strictObject({
			conflict: z.string(),
			reason: z.string().trim().min(1),
			resolution: z.discriminatedUnion("kind", [
				z.strictObject({ kind: z.literal("select"), option: z.int().nonnegative() }),
				z.strictObject({ kind: z.literal("value"), value: z.json() }),
			]),
		}),
	),
});
const LegacyInventorySchema = z.strictObject({
	success: z.literal(true),
	source: ModelRevisionSchema,
	boards: z.array(
		z.strictObject({
			file: z.string(),
			source: z.string(),
			document: SemanticBoardSchema.optional(),
		}),
	),
	policy: SemanticPolicySchema.optional(),
	identities: z.array(LegacyIdentitySchema),
	aliases: z.array(LegacyAliasSchema),
	evidence: z.array(
		z.strictObject({
			kind: z.enum(["name", "binding", "drill-down"]),
			subjects: z.array(QualifiedSubjectIdSchema),
			detail: z.string(),
		}),
	),
	conflicts: z.array(MigrationConflictSchema),
	unresolved: z.array(z.string()),
	diagnostics: z.array(ModelDiagnosticSchema),
	plan: LegacyMappingPlanSchema,
	planRevision: z.string().nullable(),
});
const LegacyMigrationFailureSchema = z.strictObject({
	success: z.literal(false),
	code: z.enum([
		"INVENTORY_UNREADABLE",
		"INVENTORY_CHANGED",
		"LEGACY_NOT_FOUND",
		"MAPPING_INVALID",
		"MAPPING_STALE",
		"MAPPING_HELD",
	]),
	error: z.string(),
	diagnostics: z.array(ModelDiagnosticSchema).min(1),
});
const LegacyInventoryReadSchema = z.discriminatedUnion("success", [
	LegacyInventorySchema,
	LegacyMigrationFailureSchema,
]);
const LegacyMappingWriteSchema = z.strictObject({
	plan: LegacyMappingPlanSchema,
	expectedPlan: z.string().nullable(),
	doing: z.string().trim().min(1),
});

type LegacyInventory = z.infer<typeof LegacyInventorySchema>;
type LegacyInventoryRead = z.infer<typeof LegacyInventoryReadSchema>;
type LegacyMappingPlan = z.infer<typeof LegacyMappingPlanSchema>;
type LegacyMappingWrite = z.infer<typeof LegacyMappingWriteSchema>;
type MigrationConflict = z.infer<typeof MigrationConflictSchema>;
type LegacyOccurrence = z.infer<typeof LegacyOccurrenceSchema>;
export {
	LegacyInventoryReadSchema,
	LegacyMappingPlanSchema,
	LegacyMappingWriteSchema,
	type LegacyInventory,
	type LegacyInventoryRead,
	type LegacyMappingPlan,
	type LegacyMappingWrite,
	type MigrationConflict,
	type LegacyOccurrence,
};
