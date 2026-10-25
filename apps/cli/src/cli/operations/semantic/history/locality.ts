// Asking a board which of its parts change most often, and which change
// together (ADR 0045).
//
// The Archboard server reads Git through the declarations or paths each part binds and answers
// the locality of one variant: every part it read, ranked by the commits of a
// period that changed those declarations or paths, and the pairs of parts those commits
// changed together. The command prints that answer, and on standard error a
// summary for a person. It reads, and it writes
// nothing: not to the board, not to any file (ADR 0015).

import {
	historyAttributionLabel,
	LocalityReplySchema,
	PeriodStartSchema,
	type LocalityAnswer,
	HistoryRefusalCode,
} from "@archboard/code-intel/history";
import { z } from "zod";
import { serverRefusal } from "#cli/protocol/contract/refusals.ts";
import { CliUsageError, defineCommand } from "#cli/protocol/contract/contract.ts";
import { SelectorSchema } from "#cli/operations/semantic/input/semantic-input.ts";
import { requestJson } from "@archboard/server-lifecycle/server-client";

const LocalityInputSchema = z.object({
	name: z.string(),
	variant: SelectorSchema.optional(),
	since: z.string().optional(),
});

const noCurrentVariantRefusal = {
	code: HistoryRefusalCode.NO_CURRENT_VARIANT,
	exit: 2,
	stream: "stderr" as const,
	description:
		"The board has no current variant, so nothing it describes is built. Name a draft with --variant.",
};
const unknownVariantRefusal = {
	code: HistoryRefusalCode.UNKNOWN_VARIANT,
	exit: 2,
	stream: "stderr" as const,
	description: "--variant names no variant of the board.",
};
const notADraftRefusal = {
	code: HistoryRefusalCode.NOT_A_DRAFT,
	exit: 2,
	stream: "stderr" as const,
	description:
		"--variant names a shelved or a historical variant. The lens reads only the current variant and a draft.",
};

/**
 * A count with its noun.
 * @param count How many.
 * @param noun The singular noun.
 * @returns The phrase.
 */
function plural(count: number, noun: string): string {
	return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

/**
 * What to say about the coupled pairs, for a person.
 * @param answer The answer.
 * @returns One line per pair, highest degree first, or one line that says there is none.
 */
function coupling(answer: LocalityAnswer): string[] {
	if (answer.coupling.length === 0) {
		return ["coupling: no pair of parts changed together in 5 commits and at 30% or more"];
	}
	return answer.coupling.map(
		(pair) =>
			`coupling: ${String(pair.degree).padStart(3)}% ${plural(pair.shared, "commit")} ` +
			`${pair.subjects[0].name} and ${pair.subjects[1].name}` +
			(pair.unjoined ? ": nothing on the board joins them" : ""),
	);
}

/**
 * What to say about the answer on standard error, for a person.
 * @param answer The answer.
 * @returns The lines: the period of each repository, the parts that changed in
 * it, most commits first, the coupled pairs, and what the lens left out or did
 * not read.
 */
function locality(answer: LocalityAnswer): string[] {
	const changed = answer.hotspots.filter((hotspot) => hotspot.count > 0);
	const unchanged = answer.hotspots.length - changed.length;
	const reasons = new Map<string, number>();
	for (const skip of answer.skipped) reasons.set(skip.reason, (reasons.get(skip.reason) ?? 0) + 1);
	return [
		`locality: "${answer.board}" at "${answer.variant.name}"`,
		...answer.periods.map(
			(period) =>
				`locality: ${period.repo}: commits from ${period.since.slice(0, 10)} to ${period.until.slice(0, 10)}`,
		),
		...changed.map(
			(hotspot) =>
				`hotspots: ${String(hotspot.count).padStart(4)} ${hotspot.subject.name} (${hotspot.path})${historyAttributionLabel(hotspot.attribution)}`,
		),
		...(unchanged === 0
			? []
			: [`hotspots: ${plural(unchanged, "part")} with no commit in the period`]),
		...answer.hotspots
			.filter((part) => part.count === 0 && part.attribution?.fallback !== undefined)
			.map((part) => `hotspots: ${part.subject.name}${historyAttributionLabel(part.attribution)}`),
		...coupling(answer),
		`locality: left out ${plural(answer.leftOut.largeCommits, "large commit")} of more than 30 files`,
		...[...reasons].map(
			([reason, count]) => `locality: skipped ${plural(count, "part")}: ${reason}`,
		),
	];
}

const semanticLocalityContract = defineCommand({
	path: ["semantic", "locality"],
	shared: ["url", "directory"],
	summary:
		"Rank the parts of a board by how often their bound declarations or paths changed, and pair the parts that change together",
	description: [
		"Reads Git through the bindings of each part of one variant. It ranks every part by the number of commits that changed its declaration or path in a period. A hotspot is a part that many commits changed. A bound symbol narrows the commits to its declaration through the language adapters. The answer labels the path-wide fallback when a symbol is unsupported or unresolved.",
		"",
		"The period:",
		"- The period of a repository is the commits on the HEAD of its checkout. That checkout is the one that holds the vault for its own repository and the chosen one for any other.",
		"- The period runs from a start up to the commit time of HEAD. The start is the year before it by default.",
		"- One HEAD always gives one answer.",
		"",
		"The count:",
		"- Each part lists its commits, newest first.",
		"- Commits of more than 30 files are left out of every count. The answer says how many.",
		"- The count is of commits. It is not a count of changed lines or a measure of the complexity of the code.",
		"",
		"Parts that are not read:",
		"- A part with no binding, a part that opens another board, a part bound into a repository with no checkout to read here, and a part pinned to a ref that its checkout does not have out.",
		"- The answer lists each one with the reason, so it never looks like a part that no commit changed.",
		"",
		"Nothing is written. The reading never changes a board.",
	].join("\n"),
	examples: [
		"archboard semantic locality payments",
		'archboard semantic locality payments --variant "Read cache"',
		"archboard semantic locality payments --since 2026-01-01",
	],
	parameters: [
		{
			kind: "positional",
			key: "name",
			name: "name",
			required: true,
			description: "The board's name",
		},
		{
			kind: "option",
			key: "variant",
			spellings: ["--variant"],
			value: "required",
			placeholder: "variant",
			description:
				"A draft to read, by id or name; when absent, the board's current variant. " +
				"The current variant and a draft are the only variants it reads",
		},
		{
			kind: "option",
			key: "since",
			spellings: ["--since"],
			value: "required",
			placeholder: "date",
			description:
				"Where the period starts, a date such as 2026-01-31 or a date and time with its " +
				"offset; when absent, one year before the commit time of each checkout's HEAD",
		},
	],
	input: { ingress: LocalityInputSchema },
	result: LocalityReplySchema,
	output: {
		cases: [
			{
				id: "json",
				when: {},
				mode: "json",
				description: "The parts of the variant ranked by their commits in the period",
				presentation: ["diagnostics", "result"],
			},
		],
		/**
		 * One answer: the ranked parts and the coupled pairs.
		 * @returns The output case's id.
		 */
		select: () => "json",
	},
	prerequisites: ["server"],
	effects: ["read"],
	refusals: [serverRefusal, noCurrentVariantRefusal, unknownVariantRefusal, notADraftRefusal],
	relationships: [
		{
			method: "GET",
			path: "/api/semantic-boards/locality",
			cardinality: "one",
			description: "The hotspots of one variant, read from Git through the parts' bindings",
		},
	],
	/**
	 * Rank the parts of the board and pair those that change together.
	 * @param input What the command was given.
	 * @param context The command context.
	 * @returns The answer.
	 * @throws {CliUsageError} When the start of the period is not a date.
	 */
	async handler(input, context) {
		if (input.since !== undefined && !PeriodStartSchema.safeParse(input.since).success) {
			throw new CliUsageError(
				`"${input.since}" is not a date. Give one such as 2026-01-31, or a date and time with its offset.`,
			);
		}
		await context.require("server", "semantic locality");
		const query = new URLSearchParams({ board: input.name });
		if (input.variant !== undefined) query.set("variant", input.variant);
		if (input.since !== undefined) query.set("since", input.since);
		const result = LocalityReplySchema.parse(
			await requestJson<unknown>(`/api/semantic-boards/locality?${query}`, {
				signal: context.signal,
			}),
		);
		return { result, diagnostics: locality(result) };
	},
});

export { semanticLocalityContract };
