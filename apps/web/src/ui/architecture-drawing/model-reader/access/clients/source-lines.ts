import { queryOptions } from "@tanstack/react-query";
import { CodeFileSchema, type CodeCheckAnswer } from "@archboard/code-intel/code-check";
import { inVault } from "@archboard/server-requests";
import { architectureModelKeys } from "#ui/architecture-drawing/model-reader/access/clients/queries.ts";
import {
	excerptOf,
	type SourceExcerpt,
} from "#ui/architecture-drawing/model-reader/reading/rules/source-excerpt.ts";

/** The place in code that a finding's evidence names. */
type EvidencePlace = Pick<
	NonNullable<CodeCheckAnswer["findings"][number]["evidence"]>[number],
	"repo" | "path" | "line"
>;

/**
 * The source lines around one piece of a finding's evidence, cut from the whole file that the file
 * route quotes. A file the route refuses, or does not have, or one that no longer has the line, is
 * unavailable, as is a failure. A pass reads code at one moment, so the lines of one pass stay as
 * they are, and the next pass has its own key.
 * @param vault The vault of the reading.
 * @param place Where the evidence is.
 * @param checkedAt When the pass that found it ran.
 * @returns The query options, whose data is the excerpt, or null where the source is unavailable.
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
		 * @returns The excerpt, or null when the source is unavailable.
		 */
		queryFn: async (context): Promise<SourceExcerpt | null> => {
			const parameters = new URLSearchParams({ repo, path });
			const response = await fetch(`${inVault("/api/code/file", vault)}&${parameters}`, {
				signal: context.signal,
			});
			if (response.status === 404) return null;
			if (!response.ok) throw new Error(`The source lines could not be read (${response.status}).`);
			const { source } = CodeFileSchema.parse(await response.json());
			return source.status === "quoted" ? excerptOf(source.text, line) : null;
		},
		staleTime: Number.POSITIVE_INFINITY,
		retry: false,
	});
}

export { sourceLinesQuery };
