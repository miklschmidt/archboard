// Asking a board what a branch changed: the parts whose bound declarations or paths the
// commits from the merge base of a ref and HEAD changed, set against the parts
// a proposal names (ADR 0045).
//
// The Archboard server reads the commits, because it knows each checkout. The
// answer is derived on request and never stored. It is information: it
// changes no exit status. A part the lens skipped is in none of the lists and
// is listed with the reason, so it never reads as a part nothing changed.

import {
	historyAttributionLabel,
	FootprintReplySchema,
	HistoryRefusalCode,
} from "@archboard/code-intel/history";
import { z } from "zod";
import { defineCommand } from "#cli/protocol/contract/contract.ts";
import { serverRefusal } from "#cli/protocol/contract/refusals.ts";
import { SelectorSchema } from "#cli/operations/semantic/input/semantic-input.ts";
import { requestJson } from "@archboard/server-lifecycle/server-client";

/** A footprint, as the server answers it. */
type FootprintAnswer = z.infer<typeof FootprintReplySchema>;

/** One part a footprint names, changed or not. */
type FootprintPart = Extract<FootprintAnswer, { proposal: null }>["changed"][number];

const FootprintInputSchema = z.object({
	name: z.string(),
	base: SelectorSchema,
	head: SelectorSchema.optional(),
	against: SelectorSchema.optional(),
	variant: SelectorSchema.optional(),
});

const headUnresolvedRefusal = {
	code: HistoryRefusalCode.HEAD_UNRESOLVED,
	exit: 2,
	stream: "stderr" as const,
	description:
		"--head resolves in none of the checkouts that hold a part of the board, so nothing was " +
		"read and nothing is reported as unchanged.",
};
const noCurrentVariantRefusal = {
	code: HistoryRefusalCode.NO_CURRENT_VARIANT,
	exit: 2,
	stream: "stderr" as const,
	description:
		"The board has no current variant and no --variant names a proposal, so nothing it " +
		"describes is built and there is no code to read a footprint against.",
};
const againstNotLiveRefusal = {
	code: HistoryRefusalCode.AGAINST_NOT_LIVE,
	exit: 2,
	stream: "stderr" as const,
	description:
		"The variant a proposal is read against, named by --against or taken from the proposal's " +
		"parent, is shelved or historical. Name a current variant or a draft with --against.",
};
const unknownVariantRefusal = {
	code: HistoryRefusalCode.UNKNOWN_VARIANT,
	exit: 2,
	stream: "stderr" as const,
	description: "--variant names no variant of the board.",
};
const nothingToCompareRefusal = {
	code: HistoryRefusalCode.NOTHING_TO_COMPARE,
	exit: 2,
	stream: "stderr" as const,
	description:
		"--variant names the current variant, which every proposal is read against. Name a draft, " +
		"or leave --variant out.",
};
const notADraftRefusal = {
	code: HistoryRefusalCode.NOT_A_DRAFT,
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
		`  ${part.subject.name} (${part.path}): ${plural(part.commits.length, "commit")}${historyAttributionLabel(part.attribution)}` +
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
	const read = answer.against === null ? "no variant" : `"${answer.against.name}"`;
	const subject =
		answer.proposal === null
			? `at ${read}`
			: `for proposal "${answer.proposal.name}" against ${read}`;
	const lists =
		answer.proposal === null
			? listLines("Changed", answer.changed)
			: [
					...listLines("Named and changed", answer.namedAndChanged),
					...listLines("Changed but not named", answer.changedNotNamed),
					...listLines("Named but not changed", answer.namedNotChanged),
				];
	return [
		`Footprint of "${answer.board}" ${subject}: ` +
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
	shared: ["url", "directory"],
	summary: "Map a branch onto a board and set it against a proposal",
	description:
		"A bound symbol narrows commits to its declaration through the language adapters. " +
		"The answer labels path-wide fallback when a symbol is unsupported or unresolved. " +
		"Reports which parts of a board's current variant the commits from the merge base of --base " +
		"and HEAD up to HEAD, or with --head up to that ref, changed, through their bound declarations or paths, in the checkout that holds the vault for its own repository and in the chosen checkout of every " +
		"other. --base is any ref that resolves in the checkout, such as main, origin/main or a commit; nothing is fetched, and a checkout where it does not resolve is named in the " +
		"answer and not read. Each checkout is read at its HEAD, or at --head, which is resolved in each " +
		"checkout as the code check resolves a ref (the name, else the branch of that name on origin) and " +
		"never checked out, so a change that is not committed is not in it. A checkout where --head " +
		"does not resolve is named in the answer and not read; when it resolves in none, the command is " +
		"refused with HEAD_UNRESOLVED. Each part lists its commits; large commits (more than 30 files) are " +
		"kept and marked. With --variant it also reads a proposal, a draft of the board, against " +
		"the current variant, or the variant --against names, and splits the parts into named and " +
		"changed, changed but not named, and named but not changed. On a board with no current " +
		"variant a proposal is read against its parent, and a proposal with no parent is read " +
		"against nothing, so it names every part it holds. Without --variant the board needs a current variant, " +
		"or --against names the variant whose parts are read. The proposal names a part that the comparison marks added, " +
		"changed or removed, and a part at either end of a relationship or a step that it marks, " +
		"and each named part says why. A part with no binding, a part that opens another board, a " +
		"repository this machine has not registered, and a part in a checkout where --base does not " +
		"resolve are skipped: they are in none of the lists and are listed with the reason. A part " +
		"pinned to a branch or commit its checkout does not have out is read up to that ref from " +
		"Git, never checked out, unless --head names where the commits end. In a draft, every part " +
		"of a repository is read up to the draft's own branch, which holds the layers below it, " +
		"except a part that pins a branch that one does not hold. A part pinned to a ref the " +
		"checkout cannot resolve is skipped as head-unresolved. Information only: nothing is " +
		"stored and the exit status does not change.",
	examples: [
		"archboard semantic footprint payments --base origin/main",
		"archboard semantic footprint payments --base feat/layer-one --head feat/layer-two",
		'archboard semantic footprint payments --base origin/main --variant "Queued ingest"',
		'archboard semantic footprint payments --base feat/layer-one --head feat/layer-two --variant "Layer two" --against "Layer one"',
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
			key: "head",
			spellings: ["--head"],
			value: "required",
			placeholder: "ref",
			description:
				"The ref the commits run up to, read from Git without checking it out: a branch, " +
				"tag or commit, as the code check reads a ref a draft pins. Use it for a layer of a " +
				"pull-request stack that is not checked out. When absent, they run up to HEAD",
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
		{
			kind: "option",
			key: "against",
			spellings: ["--against"],
			value: "required",
			placeholder: "variant",
			description:
				"The variant the proposal is read against to decide which parts it names: a current " +
				"variant or a draft, by id or name, other than the proposal. Defaults to the current " +
				"variant, else the proposal's parent. For a pull request in a stack, the proposal " +
				"of the pull request below",
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
		headUnresolvedRefusal,
		noCurrentVariantRefusal,
		againstNotLiveRefusal,
		unknownVariantRefusal,
		nothingToCompareRefusal,
		notADraftRefusal,
	],
	relationships: [
		{
			method: "GET",
			path: "/api/semantic-boards/footprint",
			cardinality: "one",
			description:
				"The footprint, read from Git in the checkout that holds the vault and in the chosen checkout of every other repository",
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
			...(input.head === undefined ? {} : { head: input.head }),
			...(input.variant === undefined ? {} : { variant: input.variant }),
			...(input.against === undefined ? {} : { against: input.against }),
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
