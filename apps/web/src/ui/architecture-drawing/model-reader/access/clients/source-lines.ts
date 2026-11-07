import { queryOptions } from "@tanstack/react-query";
import { z } from "zod";
import type { CodeCheckAnswer } from "@archboard/code-intel/code-check";
import { inVault } from "@archboard/server-requests";
import { architectureModelKeys } from "#ui/architecture-drawing/model-reader/access/clients/queries.ts";

/** The place in code that a finding's evidence names. */
type EvidencePlace = Pick<
	NonNullable<CodeCheckAnswer["findings"][number]["evidence"]>[number],
	"repo" | "path" | "line"
>;

/**
 * The lines around a finding's evidence, as `GET /api/code/source-lines` answers: the evidence
 * line with up to three lines either side, and the number of the first of them.
 */
const SourceLinesSchema = z
	.object({
		repo: z.string(),
		path: z.string(),
		line: z.int().positive(),
		first: z.int().positive(),
		lines: z.array(z.string()),
	})
	.strict();

type SourceLines = z.infer<typeof SourceLinesSchema>;

/**
 * The source lines around one piece of a remembered finding's evidence. The server answers only for
 * a place that a remembered finding names, so a 404 says the place is not one, and the excerpt is
 * then unavailable, as it is after a failure. A pass reads code at one moment, so the lines of one
 * pass stay as they are, and the next pass has its own key.
 * @param vault The vault of the reading.
 * @param place Where the evidence is.
 * @param checkedAt When the pass that found it ran.
 * @returns The query options, whose data is the lines, or null for a place no finding names.
 */
function sourceLinesQuery(vault: string, place: EvidencePlace, checkedAt: string) {
	const { repo, path, line } = place;
	return queryOptions({
		queryKey: [
			...architectureModelKeys.vault(vault),
			"source-lines",
			repo,
			path,
			line,
			checkedAt,
		] as const,
		/**
		 * Read the lines.
		 * @param context The query cancellation signal.
		 * @returns The lines, or null when no remembered finding names the place.
		 */
		queryFn: async (context): Promise<SourceLines | null> => {
			const parameters = new URLSearchParams({ repo, path, line: String(line) });
			const response = await fetch(`${inVault("/api/code/source-lines", vault)}&${parameters}`, {
				signal: context.signal,
			});
			if (response.status === 404) return null;
			if (!response.ok) throw new Error(`The source lines could not be read (${response.status}).`);
			return SourceLinesSchema.parse(await response.json());
		},
		staleTime: Number.POSITIVE_INFINITY,
		retry: false,
	});
}

export { sourceLinesQuery };
