// The three commands that move a board's lifecycle on: settling what a proposal
// is holding, making one the architecture that is implemented, and letting one
// go that nobody intends to carry out.
//
// Separate from the commands that change what a board says because they are
// about something else: not what the architecture is, but which answer to a
// disagreement stands, which state is the one in use, and which proposals are
// still live. All three go through the same write boundary as everything else —
// same lease, same expected version, one atomic write, one version advance
// (ADR 0016, ADR 0023, ADR 0030).

import { z } from "zod";
import {
	BoardAdoptInputSchema,
	BoardShelveInputSchema,
	ResolutionInputSchema,
} from "@/shared/semantic-board/index";
import {
	adoptSemanticBoardOnCanvas,
	resolveSemanticBoardOnCanvas,
	shelveSemanticBoardOnCanvas,
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
	targetedVariant,
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
	shared: ["url", "doing", "expect-version", "as-session"],
	summary: "Settle what a proposal is holding",
	description:
		"Answers the disagreements one proposal is holding against the variant it came from. The " +
		"answer is JSON with `choices`, each naming the disagreement by its `subject` and `field` " +
		"exactly as the board reports them, and saying which `side` this proposal takes: `mine` keeps " +
		"what it says, `theirs` takes the value from the variant it came from. Answering part of it " +
		"is normal; the rest stays open and says so. A third answer is not a side — write it as an " +
		"ordinary edit. Settling also catches the proposal up with everything its predecessor decided " +
		"while it was unsettled, and lets the drafts under it move again, all in the same write. " +
		"--variant says which proposal is being settled, by id or name, and the current variant takes " +
		"it when absent; the answer's own `variant` says the same thing, and where the two differ the " +
		"command line wins and the write says so.",
	examples: [
		'archboard semantic resolve pipeline --expect-version 7 --input answer.json --doing "settling the gateway name"',
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
			description: "Which proposal to settle, by id or name; the current variant when absent",
		},
		{
			kind: "option",
			key: "input",
			spellings: ["--input"],
			value: "required",
			placeholder: "file.json",
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
		const targeted = targetedVariant(stated, input.variant);
		const resolution = context.parse(ResolutionInputSchema, targeted.stated);
		const written = await resolveSemanticBoardOnCanvas(input.name, resolution);
		return {
			result: writeResult(written),
			diagnostics: [...targeted.diagnostics, ...describedWrite(written)],
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
	shared: ["url", "doing", "expect-version", "as-session"],
	summary: "Make one variant the architecture that is implemented",
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
			required: true,
			description: "Which variant becomes the implemented architecture, by id or name",
		},
		{
			kind: "option",
			key: "reason",
			spellings: ["--reason"],
			value: "required",
			placeholder: "why",
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

const ShelveInputSchema = z.object({
	name: z.string(),
	variant: SelectorSchema,
	reason: SelectorSchema,
});

const semanticShelveContract = defineCommand({
	path: ["semantic", "shelve"],
	shared: ["url", "doing", "expect-version", "as-session"],
	summary: "Let go of a proposal nobody intends to carry out",
	description:
		"Marks one proposal on this board as shelved: kept under its name, with everything it says " +
		"and every link that names it still opening it, but no longer a proposal anybody is going to " +
		"carry out. Nothing is renamed, deleted or reparented. A shelved variant stops following the " +
		"variant it came from, so edits above it no longer raise disagreements somebody has to " +
		"settle, and anything it was holding is let go with it. It cannot be edited or adopted " +
		"afterwards; branch from it to propose the same thing again. The current variant, a " +
		"historical one, one already shelved, and one that other proposals are still standing on are " +
		"all refused.",
	examples: [
		'archboard semantic shelve pipeline --variant "Readable layout" --reason "the parent adopted the same layout" --expect-version 7 --doing "letting the readable-layout proposal go"',
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
			required: true,
			description: "Which proposal to let go, by id or name",
		},
		{
			kind: "option",
			key: "reason",
			spellings: ["--reason"],
			value: "required",
			placeholder: "why",
			required: true,
			description: "Why the proposal was let go, kept with the record of the decision",
		},
	],
	input: { ingress: ShelveInputSchema },
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
			path: "/api/semantic-boards/shelve",
			cardinality: "one",
			description: "Let the proposal go",
		},
	],
	/**
	 * Let the proposal go.
	 * @param input What the command was given.
	 * @param context The command context.
	 * @returns The board as it now stands.
	 */
	async handler(input, context) {
		await context.require("server", "semantic shelve");
		editedVersion(input.name);
		const shelving = context.parse(BoardShelveInputSchema, {
			variant: input.variant,
			reason: input.reason,
		});
		const written = await shelveSemanticBoardOnCanvas(input.name, shelving);
		const board = written.board;
		const shelved = board.shelvings?.at(-1);
		const name = board.variants.find((one) => one.id === shelved?.variant)?.name ?? input.variant;
		return {
			result: writeResult(written),
			diagnostics: [
				`"${name}" is shelved on "${board.name}", as of version ${board.version}. It keeps its ` +
					"name and everything it says; branch from it to propose it again.",
			],
		};
	},
});

export { semanticAdoptContract, semanticResolveContract, semanticShelveContract };
