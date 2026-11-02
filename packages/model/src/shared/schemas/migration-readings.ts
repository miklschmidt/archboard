import { z } from "zod";
import {
	QualifiedSubjectIdSchema,
	SemanticIdSchema,
	DisplayNameSchema,
	DescriptionSchema,
} from "#shared/schemas/primitives.ts";
import { ReadingSchema } from "#shared/schemas/model-walkthroughs.ts";
import { ModelDiagnosticSchema } from "#shared/schemas/model-diagnostic.ts";

const ImportedBookmarkSchema = z.strictObject({
	id: QualifiedSubjectIdSchema,
	legacy: QualifiedSubjectIdSchema,
	board: SemanticIdSchema,
	file: z.string(),
	name: DisplayNameSchema,
	summary: DescriptionSchema.optional(),
	reading: ReadingSchema,
	diagnostics: z.array(ModelDiagnosticSchema),
});
const LegacyAddressSchema = z.strictObject({
	address: z.string().min(1),
	board: SemanticIdSchema,
	state: QualifiedSubjectIdSchema,
	canonical: QualifiedSubjectIdSchema,
});
const MigrationReadingsSchema = z.strictObject({
	bookmarks: z.array(ImportedBookmarkSchema).optional(),
	bookmark: ImportedBookmarkSchema.optional(),
	addresses: z.array(LegacyAddressSchema).optional(),
	resolvedAddress: LegacyAddressSchema.optional(),
	readingDiagnostics: z
		.array(
			z.strictObject({ id: QualifiedSubjectIdSchema, diagnostics: z.array(ModelDiagnosticSchema) }),
		)
		.optional(),
});
export { MigrationReadingsSchema };
