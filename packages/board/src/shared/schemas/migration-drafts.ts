import { z } from "zod";
import { QualifiedSubjectIdSchema } from "#shared/schemas/primitives.ts";
const LegacyDraftMappingSchema = z.strictObject({
	legacy: QualifiedSubjectIdSchema,
	predecessor: QualifiedSubjectIdSchema.nullable(),
	baseline: z.discriminatedUnion("kind", [
		z.strictObject({ kind: z.literal("empty"), state: z.null() }),
		z.strictObject({
			kind: z.enum(["content", "reconciliation-base"]),
			state: QualifiedSubjectIdSchema,
		}),
	]),
	reason: z.string().trim().min(1),
});
export { LegacyDraftMappingSchema };
