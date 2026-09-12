// The two commands that move a board's lifecycle on: settling what a proposal
// is holding, and making one the architecture that is implemented.
//
// Separate from the commands that change what a board says because they are
// about something else: not what the architecture is, but which answer to a
// disagreement stands, and which state is the one in use. Both go through the
// same write boundary as everything else — same lease, same expected version,
// one atomic write, one version advance (ADR 0016, ADR 0023).

import { z } from "zod";
import { BoardAdoptInputSchema, ResolutionInputSchema } from "@/shared/semantic-board/index";
import {
	adoptSemanticBoardOnCanvas,
	resolveSemanticBoardOnCanvas,
} from "@/runtime/semantic-board-client/index";
import { CliUsageError, defineCommand } from "@/cli/command-contract/contract";
import {
	boardHeldRefusal,
	boardVersionRefusal,
	claimRevokedRefusal,
	doingRefusal,
	serverRefusal,
} from "@/cli/command-contract/common";
import {
	describedWrite,
	editedVersion,
	expectVersionRefusal,
	failStated,
	SelectorSchema,
	SemanticBoardResultSchema,
	writeResult,
	statedJson,
} from "@/cli/commands/lib/semantic-input";

const ResolveInputSchema = z.object({
	name: z.string(),
	variant: SelectorSchema.optional(),
	input: z.string().optional(),
});

const semanticResolveContract = defineCommand({
	path: ["semantic", "resolve"],
	summary: "Settle what a proposal is holding",
	usage: "semantic resolve <name> --expect-version <n> [--variant <v>] [--input <file.json>]",
	description:
		"Answers the disagreements one proposal is holding against the variant it came from. The " +
		"answer is JSON with `choices`, each naming the disagreement by its `subject` and `field` " +
		"exactly as the board reports them, and saying which `side` this proposal takes: `mine` keeps " +
		"what it says, `theirs` takes the value from the variant it came from. Answering part of it " +
		"is normal; the rest stays open and says so. A third answer is not a side — write it as an " +
		"ordinary edit. Settling also catches the proposal up with everything its predecessor decided " +
		"while it was unsettled, and lets the drafts under it move again, all in the same write.",
	examples: [
		'archboard semantic resolve pipeline --expect-version 7 --input answer.json --doing "settling the gateway name"',
	],
	parameters: [
		{ kind: "positional", key: "name", name: "name", description: "The board's name" },
		{
			kind: "option",
			key: "variant",
			spellings: ["--variant"],
			value: "required",
			description: "Which proposal to settle; the current variant when absent",
		},
		{
			kind: "option",
			key: "input",
			spellings: ["--input"],
			value: "required",
			description: "A JSON file stating the answer; standard input when absent",
		},
	],
	input: { ingress: ResolveInputSchema },
	result: SemanticBoardResultSchema,
	output: {
		cases: [
			{
				id: "json",
				when: {},
				mode: "json",
				description: "The board as it now stands",
				presentation: ["diagnostics", "result"],
			},
		],
		/**
		 * One answer: the board.
		 * @returns The output case's id.
		 */
		select: () => "json",
	},
	prerequisites: ["server", "doing"],
	effects: ["local-read", "server-state-write"],
	refusals: [
		serverRefusal,
		doingRefusal,
		expectVersionRefusal,
		boardHeldRefusal,
		boardVersionRefusal,
		claimRevokedRefusal,
	],
	relationships: [
		{
			method: "POST",
			path: "/api/semantic-boards/resolve",
			cardinality: "one",
			description: "Settle the disagreements",
		},
	],
	/**
	 * Settle what the proposal is holding.
	 * @param input What the command was given.
	 * @param context The command context.
	 * @returns The board as it now stands.
	 */
	async handler(input, context) {
		await context.require("server", "semantic resolve");
		editedVersion(input.name);
		const stated = await statedJson(input, context);
		if (stated === undefined) {
			throw new CliUsageError(
				"semantic resolve needs an answer: give it --input <file.json> or JSON on standard input",
			);
		}
		if (typeof stated !== "object" || stated === null || Array.isArray(stated)) {
			failStated(stated);
		}
		const resolution = context.parse(ResolutionInputSchema, {
			...stated,
			...(input.variant === undefined ? {} : { variant: input.variant }),
		});
		const written = await resolveSemanticBoardOnCanvas(input.name, resolution);
		return {
			result: writeResult(written),
			diagnostics: describedWrite(written),
		};
	},
});

const AdoptInputSchema = z.object({
	name: z.string(),
	variant: SelectorSchema,
	reason: SelectorSchema.optional(),
});

const semanticAdoptContract = defineCommand({
	path: ["semantic", "adopt"],
	summary: "Make one variant the architecture that is implemented",
	usage: "semantic adopt <name> --variant <v> [--reason <why>] --expect-version <n>",
	description:
		"Moves the current designation to a variant of this board. Nothing is renamed and nothing is " +
		"reparented: the variant that was current becomes the architecture that was implemented until " +
		"now and stops being editable, the adopted one becomes current and goes on being editable, " +
		"and every proposal still says which state it was derived from. The move itself is recorded " +
		"with its reason, which is the part somebody is looking for a year later. A variant that is " +
		"still holding a disagreement, or that is derived from one that is, cannot be adopted.",
	examples: [
		'archboard semantic adopt pipeline --variant "Queued ingest" --reason "the queue paid for itself in a week" --expect-version 9 --doing "adopting the queued ingest"',
	],
	parameters: [
		{ kind: "positional", key: "name", name: "name", description: "The board's name" },
		{
			kind: "option",
			key: "variant",
			spellings: ["--variant"],
			value: "required",
			description: "Which variant becomes the implemented architecture",
		},
		{
			kind: "option",
			key: "reason",
			spellings: ["--reason"],
			value: "required",
			description: "Why the architecture changed, kept with the record of the move",
		},
	],
	input: { ingress: AdoptInputSchema },
	result: SemanticBoardResultSchema,
	output: {
		cases: [
			{
				id: "json",
				when: {},
				mode: "json",
				description: "The board as it now stands",
				presentation: ["diagnostics", "result"],
			},
		],
		/**
		 * One answer: the board.
		 * @returns The output case's id.
		 */
		select: () => "json",
	},
	prerequisites: ["server", "doing"],
	effects: ["local-read", "server-state-write"],
	refusals: [
		serverRefusal,
		doingRefusal,
		expectVersionRefusal,
		boardHeldRefusal,
		boardVersionRefusal,
		claimRevokedRefusal,
	],
	relationships: [
		{
			method: "POST",
			path: "/api/semantic-boards/adopt",
			cardinality: "one",
			description: "Move the designation",
		},
	],
	/**
	 * Move the designation.
	 * @param input What the command was given.
	 * @param context The command context.
	 * @returns The board as it now stands.
	 */
	async handler(input, context) {
		await context.require("server", "semantic adopt");
		editedVersion(input.name);
		const adopting = context.parse(BoardAdoptInputSchema, {
			variant: input.variant,
			...(input.reason === undefined ? {} : { reason: input.reason }),
		});
		const written = await adoptSemanticBoardOnCanvas(input.name, adopting);
		const board = written.board;
		const now = board.variants.find((one) => one.id === board.current);
		return {
			result: writeResult(written),
			diagnostics: [
				`"${now?.name ?? board.current}" is the architecture "${board.name}" says is ` +
					`implemented, as of version ${board.version}.`,
			],
		};
	},
});

export { semanticAdoptContract, semanticResolveContract };
