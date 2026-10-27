import { z } from "zod";
import { SingleLineTextSchema, SemanticIdSchema } from "#shared/schemas/primitives.ts";
import {
	ModelRevisionSchema,
	GitObjectIdSchema,
	ArchitectureModelFailureSchema,
} from "#shared/schemas/model.ts";

const PortablePathSchema = z
	.string()
	.refine(
		(path) =>
			!/[\\\0:]/u.test(path) &&
			path.split("/").every((part) => !["", ".", ".."].includes(part)) &&
			(/^(?:model\.json|migration\.json|\.archboard\/config\.yaml)$/u.test(path) ||
				/\.(?:module|flows|proposal|walkthrough)\.json$/u.test(path)),
		"Use a normalized relative architecture input path.",
	);
const Base64Schema = z
	.string()
	.regex(/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u);
const ArchitecturePortableBundleSchema = z.strictObject({
	format: z.literal("archboard-model"),
	schemaVersion: z.literal(1),
	model: SemanticIdSchema,
	revision: ModelRevisionSchema,
	inputs: z.array(z.strictObject({ path: PortablePathSchema, bytes: Base64Schema })),
	history: z.strictObject({ tips: z.array(GitObjectIdSchema), bundle: Base64Schema.nullable() }),
});
const ArchitectureImportRequestSchema = z.strictObject({
	bundle: ArchitecturePortableBundleSchema,
	expectedRevision: ModelRevisionSchema,
	operationId: SingleLineTextSchema,
	writer: SingleLineTextSchema,
	doing: SingleLineTextSchema.max(140),
});
const ArchitectureInitializationRequestSchema = z.strictObject({
	name: z.string().trim().min(1),
	operationId: SingleLineTextSchema,
	writer: SingleLineTextSchema,
	doing: SingleLineTextSchema.max(140),
});
const InitializationInstallationSchema = ArchitectureInitializationRequestSchema.extend({
	type: z.literal("initialize"),
	expectedRevision: ModelRevisionSchema,
	target: z.strictObject({ model: SemanticIdSchema, state: z.null() }),
});
const PortableInstallationSchema = ArchitectureImportRequestSchema.omit({ bundle: true }).extend({
	type: z.literal("import"),
	bundleDigest: z.string().regex(/^[a-f0-9]{64}$/u),
	target: z.strictObject({ model: SemanticIdSchema, state: SemanticIdSchema.nullable() }),
});
const ArchitectureExportResultSchema = z.discriminatedUnion("success", [
	z.strictObject({ success: z.literal(true), bundle: ArchitecturePortableBundleSchema }),
	ArchitectureModelFailureSchema,
]);
export {
	ArchitectureInitializationRequestSchema,
	InitializationInstallationSchema,
	ArchitecturePortableBundleSchema,
	ArchitectureImportRequestSchema,
	ArchitectureExportResultSchema,
	PortableInstallationSchema,
};
