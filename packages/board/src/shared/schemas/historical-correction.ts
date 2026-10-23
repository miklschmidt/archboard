import { z } from "zod";
import { DescriptionSchema } from "#shared/schemas/primitives.ts";

/** Immutable Git evidence for the repository a historical reading describes. */
const HistoricalRevisionSchema = z
	.object({
		repo: z.string().trim().min(1),
		commit: z
			.string()
			.regex(/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/iu, "must be a full Git commit id")
			.toLowerCase(),
	})
	.strict();

const HistoricalRevisionsSchema = z
	.array(HistoricalRevisionSchema)
	.min(1)
	.refine(
		(revisions) => new Set(revisions.map((revision) => revision.repo)).size === revisions.length,
		"each repository must occur once",
	);

/** An append-only explanation of a factual correction to a historical state. */
const HistoricalCorrectionSchema = z
	.object({
		at: z.iso.datetime(),
		reason: DescriptionSchema,
		revisions: HistoricalRevisionsSchema,
	})
	.strict();

type HistoricalRevision = z.infer<typeof HistoricalRevisionSchema>;
export {
	HistoricalRevisionSchema,
	HistoricalRevisionsSchema,
	HistoricalCorrectionSchema,
	type HistoricalRevision,
};
