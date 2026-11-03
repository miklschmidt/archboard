import { z } from "zod";

/**
 * How a history reading assigned commits to one binding.
 */
const HistoryAttributionSchema = z
	.object({
		mode: z.enum(["path", "symbol", "mixed"]),
		symbol: z.string().optional(),
		/**
		 * Commits read by path because their declaration could not be read.
		 */
		fallback: z
			.array(
				z
					.object({
						reason: z.enum(["unsupported", "unresolved"]),
						commits: z.array(z.string()),
					})
					.strict(),
			)
			.optional(),
	})
	.strict();

type HistoryAttribution = z.infer<typeof HistoryAttributionSchema>;

export { HistoryAttributionSchema, type HistoryAttribution };
