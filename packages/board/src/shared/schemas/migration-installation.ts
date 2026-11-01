import { z } from "zod";
import {
	ModelRevisionSchema,
	GitObjectIdSchema,
	MigrationPreviewSchema,
} from "#shared/schemas/model-definitions.ts";
import {
	SemanticIdSchema,
	SingleLineTextSchema,
	QualifiedSubjectIdSchema,
} from "#shared/schemas/primitives.ts";
import { MigrationReadingsSchema } from "#shared/schemas/migration-readings.ts";
const MigrationPreviewInstallationSchema = MigrationPreviewSchema.shape.installation.unwrap();
const ArchitectureMigrationRequestSchema = MigrationPreviewInstallationSchema.extend({
	origin: SemanticIdSchema,
	expectedSource: ModelRevisionSchema,
	expectedPlan: z.string().regex(/^[a-f0-9]{64}$/u),
	previewRevision: ModelRevisionSchema,
	authorization: z.literal("owner"),
	operationId: SingleLineTextSchema,
	writer: SingleLineTextSchema,
	doing: SingleLineTextSchema.max(140),
});
const MigrationInstallationSchema = ArchitectureMigrationRequestSchema.extend({
	type: z.literal("migrate"),
	target: z.strictObject({ model: SemanticIdSchema, state: SemanticIdSchema.nullable() }),
});
const InstalledMigrationSchema = MigrationReadingsSchema.extend({
	schemaVersion: z.literal(1),
	origin: SemanticIdSchema,
	checkpoint: GitObjectIdSchema,
	source: ModelRevisionSchema,
	planRevision: z.string(),
	states: z.array(z.strictObject({ legacy: QualifiedSubjectIdSchema, id: SemanticIdSchema })),
});
export {
	ArchitectureMigrationRequestSchema,
	MigrationPreviewInstallationSchema,
	MigrationInstallationSchema,
	InstalledMigrationSchema,
};
