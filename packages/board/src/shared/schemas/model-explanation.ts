import { z } from "zod";
import { DiagramGrammarSchema } from "#shared/schemas/vocabulary.ts";
import { QualifiedSubjectIdSchema, SemanticIdSchema } from "#shared/schemas/primitives.ts";

const ReadingSelectionSchema = z.strictObject({
	walkthrough: z.string().min(1).optional(),
	shared: z.boolean().optional(),
	state: z.string().min(1).optional(),
	checkpoint: z
		.string()
		.regex(/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/u)
		.optional(),
	against: z.string().min(1).optional(),
	compare: z.boolean().optional(),
});
const ExplanationRequestSchema = z.strictObject({
	actionId: z.string().min(1).max(128),
	action: z.enum(["explain-selection", "explain-relationship", "trace-flow", "explain-proposal"]),
	model: SemanticIdSchema,
	expectedRevision: z.string().regex(/^[a-f0-9]{64}$/u),
	expectedSourceRevision: z
		.string()
		.regex(/^[a-f0-9]{64}$/u)
		.optional(),
	subjects: z.array(QualifiedSubjectIdSchema),
	reading: z.strictObject({
		scope: QualifiedSubjectIdSchema.optional(),
		focus: z.array(QualifiedSubjectIdSchema),
		relationshipKinds: z.array(z.string().min(1)),
		groups: z.union([z.boolean(), z.array(z.string().min(1))]),
		grammar: DiagramGrammarSchema,
		flow: QualifiedSubjectIdSchema.optional(),
		referenceSubject: QualifiedSubjectIdSchema.optional(),
	}),
	question: z.string().min(1).optional(),
});
export { ExplanationRequestSchema, ReadingSelectionSchema };
