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

/**
 * Explain precision beside a command result, including empty fallback ranges.
 * @param attribution The reading precision.
 * @returns A human-readable suffix.
 */
function historyAttributionLabel(attribution: HistoryAttribution | undefined): string {
	if (attribution === undefined) return "";
	if (attribution.fallback !== undefined)
		return ` [path-wide fallback: ${attribution.fallback.map((item) => item.reason).join(", ")}${attribution.mode === "mixed" ? "; other commits use the symbol" : ""}]`;
	return attribution.mode === "symbol" ? ` [symbol: ${attribution.symbol ?? ""}]` : " [path-wide]";
}

export { HistoryAttributionSchema, type HistoryAttribution, historyAttributionLabel };
