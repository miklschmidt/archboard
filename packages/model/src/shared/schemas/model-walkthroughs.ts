import { z } from "zod";
import {
	QualifiedSubjectIdSchema,
	DisplayNameSchema,
	DescriptionSchema,
} from "#shared/schemas/primitives.ts";
import { DiagramGrammarSchema } from "#shared/schemas/vocabulary.ts";

const ReadingSchema = z.strictObject({
	visibility: z
		.strictObject({
			modules: z.array(QualifiedSubjectIdSchema),
			relationships: z.array(QualifiedSubjectIdSchema),
			flows: z.array(QualifiedSubjectIdSchema),
		})
		.optional(),
	scope: QualifiedSubjectIdSchema.optional(),
	selection: z.array(QualifiedSubjectIdSchema).default([]),
	focus: z.array(QualifiedSubjectIdSchema).default([]),
	filters: z
		.strictObject({ relationships: z.array(z.string()), groups: z.array(z.string()) })
		.default({ relationships: [], groups: [] }),
	grammar: DiagramGrammarSchema,
	flow: QualifiedSubjectIdSchema.optional(),
});
const BeatSchema = z.strictObject({
	id: QualifiedSubjectIdSchema,
	title: DisplayNameSchema,
	narrative: DescriptionSchema,
	reading: ReadingSchema,
});
const WalkthroughSchema = z.strictObject({
	schemaVersion: z.literal(1),
	id: QualifiedSubjectIdSchema,
	name: DisplayNameSchema,
	formerNames: z.array(DisplayNameSchema).optional(),
	summary: DescriptionSchema.optional(),
	target: z.union([
		z.strictObject({ state: z.string().min(1) }),
		z.strictObject({ checkpoint: z.string().regex(/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/u) }),
	]),
	beats: z.array(BeatSchema).min(1),
});
const NewBeatSchema = BeatSchema.omit({ id: true });
const WalkthroughFieldsSchema = WalkthroughSchema.omit({
	schemaVersion: true,
	id: true,
	formerNames: true,
	beats: true,
});
const WalkthroughChangeSchema = z.discriminatedUnion("type", [
	z.strictObject({
		type: z.literal("add-walkthrough"),
		walkthrough: WalkthroughFieldsSchema.extend({ beats: z.array(NewBeatSchema).min(1) }),
	}),
	z.strictObject({
		type: z.literal("edit-walkthrough"),
		subject: QualifiedSubjectIdSchema,
		set: WalkthroughFieldsSchema.partial().optional(),
		clear: z.array(z.literal("summary")).optional(),
		beats: z
			.array(NewBeatSchema.extend({ id: QualifiedSubjectIdSchema.optional() }))
			.min(1)
			.optional(),
	}),
	z.strictObject({ type: z.literal("remove-walkthrough"), subject: QualifiedSubjectIdSchema }),
]);
export { ReadingSchema, WalkthroughSchema, BeatSchema, WalkthroughChangeSchema };
