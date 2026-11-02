import { z } from "zod";
import { QualifiedSubjectIdSchema, SemanticIdSchema } from "#shared/schemas/primitives.ts";
const SubjectKindSchema = z.enum([
	"module",
	"relationship",
	"collection",
	"flow",
	"step",
	"walkthrough",
	"beat",
]);
const PlacementSchema = z.strictObject({
	holder: z.union([QualifiedSubjectIdSchema, SemanticIdSchema]),
	alternative: z.string().optional(),
	before: QualifiedSubjectIdSchema.optional(),
});
const FieldValueSchema = z
	.unknown()
	.refine(
		(value): boolean => value !== null && value !== undefined,
		"Assign a value. Use clear to remove an optional field.",
	);
const ProposalChangeSchema = z.discriminatedUnion("type", [
	z.strictObject({
		type: z.literal("add"),
		subject: QualifiedSubjectIdSchema,
		kind: SubjectKindSchema,
		value: z.record(z.string(), FieldValueSchema),
	}),
	z.strictObject({ type: z.literal("remove"), subject: QualifiedSubjectIdSchema }),
	z.strictObject({
		type: z.literal("assign"),
		subject: QualifiedSubjectIdSchema,
		field: z.string().min(1),
		value: FieldValueSchema,
	}),
	z.strictObject({
		type: z.literal("clear"),
		subject: QualifiedSubjectIdSchema,
		field: z.string().min(1),
	}),
	z.strictObject({
		type: z.literal("place"),
		subject: QualifiedSubjectIdSchema,
		placement: PlacementSchema,
	}),
]);

export { ProposalChangeSchema, SubjectKindSchema };
