// Asking a board what a branch changed: the parts whose bound files the
// commits from the merge base of a ref and HEAD changed, set against the parts
// a proposal names (ADR 0045).
//
// The Archboard server reads the commits, because it knows each checkout. The
// answer is derived on request and never stored. It is information: it
// changes no exit status. A part the lens skipped is in none of the lists and
// is listed with the reason, so it never reads as a part nothing changed.

import { z } from "zod";
import { defineCommand } from "@/cli/command-contract/contract";
import { serverRefusal } from "@/cli/command-contract/common";
import { SelectorSchema } from "@/cli/commands/lib/semantic-input";
import { requestJson } from "@/runtime/engine/server-client";
import {
	FootprintReplySchema,
	type FootprintAnswer,
	type FootprintPart,
} from "@/shared/footprint/index";

const FootprintInputSchema = z.object({
	name: z.string(),
	base: SelectorSchema,
	variant: SelectorSchema.optional(),
});

const noCurrentVariantRefusal = {
	code: "NO_CURRENT_VARIANT",
	exit: 2,
	stream: "stderr" as const,
	description:
		"The board has no current variant, so nothing it describes is built and there is no code " +
		"to read a footprint against.",
};
const unknownVariantRefusal = {
	code: "UNKNOWN_VARIANT",
	exit: 2,
	stream: "stderr" as const,
	description: "--variant names no variant of the board.",
};
const nothingToCompareRefusal = {
	code: "NOTHING_TO_COMPARE",
	exit: 2,
	stream: "stderr" as const,
	description:
		"--variant names the current variant, which every proposal is read against. Name a draft, " +
		"or leave --variant out.",
};
const notADraftRefusal = {
	code: "NOT_A_DRAFT",
	exit: 2,
	stream: "stderr" as const,
	description:
		"--variant names a shelved or a historical variant. The footprint sets the commits " +
		"against a draft only.",
};

/**
 * Plural of a count and its noun.
 * @param count How many.
 * @param noun The singular noun.
 * @returns The phrase.
 */
function plural(count: number, noun: string): string {
	return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

/**
 * One part as a line: its path, its commits and why the proposal names it.
 * @param part The part.
 * @returns The line.
 */
function partLine(part: FootprintPart): string {
	const why = part.named.map((reason) =>
		reason.by === "part"
			? reason.status
			: `${reason.status} ${reason.by === "step" ? "step" : "relationship"} ${reason.from.name} -> ${reason.to.name}`,
	);
	return (
		`  ${part.subject.name} (${part.path}): ${plural(part.commits.length, "commit")}` +
		(why.length === 0 ? "" : `; named: ${why.join("; ")}`)
	);
}

/**
 * One list of parts, headed with its count.
 * @param title What the list is.
 * @param parts Its parts.
 * @returns The lines, none for an empty list.
 */
function listLines(title: string, parts: readonly FootprintPart[]): string[] {
	return parts.length === 0 ? [] : [`${title} (${parts.length}):`, ...parts.map(partLine)];
}

/**
 * What to say about the footprint on standard error, for a person.
 * @param answer The answer.
 * @returns The lines.
 */
function described(answer: FootprintAnswer): string[] {
	const large = answer.commits.filter((commit) => commit.large).length;
	const inRange = answer.repositories.reduce(
		(sum, repository) => sum + (repository.status === "read" ? repository.commits : 0),
		0,
	);
	const against = answer.proposal === null ? "" : ` against proposal "${answer.proposal.name}"`;
	const lists =
		answer.proposal === null
			? listLines("Changed", answer.changed)
			: [
					...listLines("Named and changed", answer.namedAndChanged),
					...listLines("Changed but not named", answer.changedNotNamed),
					...listLines("Named but not changed", answer.namedNotChanged),
				];
	return [
		`Footprint of "${answer.board}" at "${answer.current.name}"${against}: ` +
			`${answer.commits.length} of ${plural(inRange, "commit")} since the merge base with ` +
			`${answer.base} changed a part it read${large === 0 ? "" : `, ${large} large`}.`,
		...answer.repositories.flatMap((repository) =>
			repository.status === "unread" ? [`Not read: ${repository.repo}: ${repository.detail}`] : [],
		),
		...lists,
		...(answer.skipped.length === 0
			? []
			: [`Skipped, in no list: ${plural(answer.skipped.length, "part")}.`]),
	];
}

const semanticFootprintContract = defineCommand({
	path: ["semantic", "footprint"],
	shared: ["url"],
	summary: "Map a branch onto a board and set it against a proposal",
	description:
		"Reports which parts of a board's current variant the commits from the merge base of --base " +
		"and HEAD up to HEAD changed, through their bound files, in each checkout the machine has " +
		"registered. --base is any ref that resolves in the checkout, such as main, origin/main or " +
		"a commit; nothing is fetched, and a checkout where it does not resolve is named in the " +
		"answer and not read. Each checkout is read at its HEAD, so a change that is not committed " +
		"is not in it. Each part lists its commits; large commits (more than 30 files) are " +
		"kept and marked. With --variant it also reads a proposal, a draft of the board, against " +
		"the current variant, and splits the parts into named and changed, changed but not named, " +
		"and named but not changed. The proposal names a part that the comparison marks added, " +
		"changed or removed, and a part at either end of a relationship or a step that it marks, " +
		"and each named part says why. A part with no binding, a part that opens another board, a " +
		"repository this machine has not registered, a part pinned to a ref its checkout does not " +
		"have out, and a part in a checkout where --base does not resolve are skipped: they are in " +
		"none of the lists and are listed with the reason. Information only: nothing is stored and " +
		"the exit status does not change.",
	examples: [
		"archboard semantic footprint payments --base origin/main",
		'archboard semantic footprint payments --base origin/main --variant "Queued ingest"',
		"archboard semantic footprint payments --base 3f9c2ab --variant TASK-123",
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
			key: "base",
			spellings: ["--base"],
			value: "required",
			placeholder: "ref",
			required: true,
			description:
				"The ref the branch started from: main, origin/main, a tag or a commit. Commits are " +
				"read from its merge base with HEAD",
		},
		{
			kind: "option",
			key: "variant",
			spellings: ["--variant"],
			value: "required",
			placeholder: "proposal",
			description:
				"A draft of the board to set the commits against, by id or name; when absent, the " +
				"answer only lists the parts the commits changed",
		},
	],
	input: { ingress: FootprintInputSchema },
	result: FootprintReplySchema,
	output: {
		cases: [
			{
				id: "json",
				when: {},
				mode: "json",
				description: "The parts the commits changed, set against the proposal when one is named",
				presentation: ["diagnostics", "result"],
			},
		],
		/**
		 * One answer: the footprint.
		 * @returns The output case's id.
		 */
		select: () => "json",
	},
	prerequisites: ["server"],
	effects: ["read"],
	refusals: [
		serverRefusal,
		noCurrentVariantRefusal,
		unknownVariantRefusal,
		nothingToCompareRefusal,
		notADraftRefusal,
	],
	relationships: [
		{
			method: "GET",
			path: "/api/semantic-boards/footprint",
			cardinality: "one",
			description: "The footprint, read from Git in each registered checkout",
		},
	],
	/**
	 * Ask the server for the footprint.
	 * @param input What the command was given.
	 * @param context The command context.
	 * @returns The footprint and the lines that describe it.
	 */
	async handler(input, context) {
		await context.require("server", "semantic footprint");
		const query = new URLSearchParams({
			board: input.name,
			base: input.base,
			...(input.variant === undefined ? {} : { variant: input.variant }),
		});
		const reply = FootprintReplySchema.parse(
			await requestJson<unknown>(`/api/semantic-boards/footprint?${query}`, {
				signal: context.signal,
			}),
		);
		return { result: reply, diagnostics: described(reply) };
	},
});

export { semanticFootprintContract };
