// The agent's way into a semantic board (ADR 0023).
//
// Four commands: make one, change one, read one, draw one. Every change goes to
// the running canvas, which is the process that can take the board's lease,
// check the version, write the aggregate and then tell the panes — writing the
// file from here would get the first three and leave every pane on screen
// showing the board as it was.
//
// The stated shape of a change is JSON, on standard input or in a file. That is
// not a concession to machines: nodes, their containment and their
// relationships are a structure, and a flag grammar for a structure is a second
// contract to keep in step with the first. The one contract is the Zod schema
// in `src/shared/semantic-board`, and what arrives here is parsed against it
// before it is sent.

import { z } from "zod";
import {
	BoardBranchInputSchema,
	BoardCreateInputSchema,
	VariantEditInputSchema,
} from "@/shared/semantic-board/index";
import {
	branchSemanticBoardOnCanvas,
	createSemanticBoardOnCanvas,
	editSemanticBoardOnCanvas,
	listSemanticBoardsOnCanvas,
	SemanticBoardEntrySchema,
	readSemanticBoardAnswerOnCanvas,
} from "@/runtime/semantic-board-client/index";
import { CliUsageError, defineCommand } from "@/cli/command-contract/contract";
import {
	SemanticBoardReadSchema,
	SemanticBoardResultSchema,
	writeResult,
	describedWrite,
	editedVersion,
	expectVersionRefusal,
	failStated,
	named,
	SelectorSchema,
	statedJson,
	targetedVariant,
} from "@/cli/commands/lib/semantic-input";
import {
	boardHeldRefusal,
	boardVersionRefusal,
	claimRevokedRefusal,
	doingRefusal,
	serverRefusal,
} from "@/cli/command-contract/common";

const NewInputSchema = z.object({ name: z.string(), input: z.string().optional() });
const statedArchitectureKeys = BoardCreateInputSchema.keyof().options.filter(
	(key) => key !== "name",
);

const semanticNewContract = defineCommand({
	path: ["semantic", "new"],
	shared: ["url", "doing", "as-session"],
	summary: "Create a semantic architecture board",
	description:
		"Creates one persisted semantic board, empty or populated from a stated architecture. " +
		`The stated architecture JSON accepts ${statedArchitectureKeys
			.map((key) => `\`${key}\``)
			.join(
				", ",
			)}; \`level\` is required, all other fields are optional, and omitted collections default empty. ` +
		"It is read from --input or standard input.",
	examples: [
		'archboard semantic new pipeline --doing "starting the pipeline board"',
		'archboard semantic new pipeline --input arch.json --doing "drawing the current pipeline"',
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
			key: "input",
			spellings: ["--input"],
			value: "required",
			placeholder: "file.json",
			description: "A JSON file stating the architecture; standard input when absent",
		},
	],
	input: { ingress: NewInputSchema },
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
		boardHeldRefusal,
		boardVersionRefusal,
		claimRevokedRefusal,
	],
	relationships: [
		{
			method: "POST",
			path: "/api/semantic-boards/create",
			cardinality: "one",
			description: "Create the board",
		},
	],
	/**
	 * Create the board.
	 * @param input What the command was given.
	 * @param context The command context.
	 * @returns The board as it now stands.
	 */
	async handler(input, context) {
		await context.require("server", "semantic new");
		const asked = context.parse(
			BoardCreateInputSchema,
			named(await statedJson(input, context), input.name),
		);
		const written = await createSemanticBoardOnCanvas(input.name, asked);
		const board = written.board;
		return {
			result: writeResult(written),
			diagnostics: [
				...written.warnings.map((warning) => `Warning: ${warning.file}: ${warning.message}`),
				`Semantic board "${board.name}" is at version ${board.version} with ` +
					`${board.variants[0]?.content.nodes.length ?? 0} nodes.`,
			],
		};
	},
});

const EditInputSchema = z.object({
	name: z.string(),
	variant: SelectorSchema.optional(),
	input: z.string().optional(),
});

const semanticEditContract = defineCommand({
	path: ["semantic", "edit"],
	shared: ["url", "doing", "expect-version", "as-session"],
	summary: "Change a semantic architecture board",
	description:
		"Applies one batch of stated changes to a semantic board in one write. The batch is JSON with " +
		"optional board `level` metadata, `nodes`, `edges`, `flows`, `views` and the matching " +
		"`remove...` lists, read from --input or " +
		"standard input, and it lands whole or not at all. Architectural content targets the selected " +
		"variant; views are shared by the whole board. --variant says which variant the change lands " +
		"on, by id or name, and the current one takes it when absent; the batch's own `variant` says " +
		"the same thing, and where the two differ the command line wins and the write says so. " +
		"--expect-version is required: state the " +
		"version the board reported when you read it, and the write is refused if somebody has changed " +
		"it since. A view's scope reads exactly as it is written: name relationships and the view shows " +
		"those and no others, so one connection can be isolated; name none and it shows every " +
		"relationship between the nodes it kept. Either way both ends of a shown relationship, every " +
		"participant of a shown flow, and every container they sit inside come with it.",
	examples: [
		'archboard semantic edit pipeline --expect-version 3 --input change.json --doing "adding the renderer"',
		'archboard semantic edit pipeline --variant "Queued ingest" --expect-version 4 --input change.json --doing "putting the queue in the proposal"',
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
			description: "Which variant the change lands on, by id or name; the current one when absent",
		},
		{
			kind: "option",
			key: "input",
			spellings: ["--input"],
			value: "required",
			placeholder: "file.json",
			description: "A JSON file stating the change; standard input when absent",
		},
	],
	input: { ingress: EditInputSchema },
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
			path: "/api/semantic-boards/edit",
			cardinality: "one",
			description: "Apply the change",
		},
	],
	/**
	 * Apply the change.
	 * @param input What the command was given.
	 * @param context The command context.
	 * @returns The board as it now stands.
	 */
	async handler(input, context) {
		await context.require("server", "semantic edit");
		editedVersion(input.name);
		const stated = await statedJson(input, context);
		if (stated === undefined) {
			throw new CliUsageError(
				"semantic edit needs a stated change: give it --input <file.json> or JSON on standard input",
			);
		}
		if (typeof stated !== "object" || stated === null || Array.isArray(stated)) {
			failStated(stated);
		}
		const targeted = targetedVariant(stated, input.variant);
		const edit = context.parse(VariantEditInputSchema, targeted.stated);
		const written = await editSemanticBoardOnCanvas(input.name, edit);
		return {
			result: writeResult(written),
			diagnostics: [...targeted.diagnostics, ...describedWrite(written)],
		};
	},
});

const BranchInputSchema = z.object({
	name: z.string(),
	from: SelectorSchema.optional(),
	as: SelectorSchema,
	summary: SelectorSchema.optional(),
});

const semanticBranchContract = defineCommand({
	path: ["semantic", "branch"],
	shared: ["url", "doing", "expect-version", "as-session"],
	summary: "Derive a proposal from a variant of a semantic board",
	description:
		"Adds a proposal derived from a variant this board already has. The predecessor's architecture " +
		"is carried over whole, with every entity keeping the identity it already had, which is what " +
		"makes the two comparable: a node that keeps its id through a rename is a rename, and the same " +
		"node written again under a fresh id would be a deletion standing beside an addition. The " +
		"proposal starts as a draft and designates nothing — what is current stays where it is until " +
		"somebody says otherwise — and what it actually proposes is said afterwards, as ordinary edits " +
		"to it. --from names the variant to derive from and defaults to the current one.",
	examples: [
		'archboard semantic branch pipeline --as "Queued ingest" --expect-version 4 --doing "proposing a queue"',
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
			key: "as",
			spellings: ["--as"],
			value: "required",
			placeholder: "proposal",
			required: true,
			description: "What to call the proposal",
		},
		{
			kind: "option",
			key: "from",
			spellings: ["--from"],
			value: "required",
			placeholder: "variant",
			description: "The variant to derive from, by id or name; the current one when absent",
		},
		{
			kind: "option",
			key: "summary",
			spellings: ["--summary"],
			value: "required",
			placeholder: "line",
			description: "One line saying what this proposal is for",
		},
	],
	input: { ingress: BranchInputSchema },
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
			path: "/api/semantic-boards/branch",
			cardinality: "one",
			description: "Derive the proposal",
		},
	],
	/**
	 * Derive the proposal.
	 * @param input What the command was given.
	 * @param context The command context.
	 * @returns The board as it now stands.
	 */
	async handler(input, context) {
		await context.require("server", "semantic branch");
		editedVersion(input.name);
		const branch = context.parse(BoardBranchInputSchema, {
			// "current" is a designation rather than a name, and the store resolves
			// it the same way every other read of this board does.
			from: input.from ?? "current",
			name: input.as,
			...(input.summary === undefined ? {} : { summary: input.summary }),
		});
		const written = await branchSemanticBoardOnCanvas(input.name, branch);
		const board = written.board;
		const proposal = board.variants.find((variant) => variant.name === input.as);
		return {
			result: writeResult(written),
			diagnostics: [
				...written.warnings.map((warning) => `Warning: ${warning.file}: ${warning.message}`),
				`Semantic board "${board.name}" is now at version ${board.version} with ` +
					`"${input.as}" derived from ${proposal?.parent ?? "its predecessor"}.`,
			],
		};
	},
});

const SemanticListingResultSchema = z.object({
	success: z.literal(true),
	levels: z.array(z.string()),
	boards: z.array(SemanticBoardEntrySchema),
});

const semanticContract = defineCommand({
	path: ["semantic"],
	shared: ["url"],
	summary: "Every semantic architecture board in the vault",
	description:
		"Lists the semantic boards the vault holds. Semantic boards and Excalidraw notes live side " +
		"by side and are listed separately, because they are different kinds of file.",
	examples: ["archboard semantic"],
	parameters: [],
	input: { ingress: z.object({}) },
	result: SemanticListingResultSchema,
	output: {
		cases: [
			{
				id: "json",
				when: {},
				mode: "json",
				description: "The vault's semantic boards",
			},
		],
		/**
		 * One answer: the listing.
		 * @returns The output case's id.
		 */
		select: () => "json",
	},
	prerequisites: ["server"],
	effects: ["read"],
	refusals: [serverRefusal],
	relationships: [
		{
			method: "GET",
			path: "/api/semantic-boards",
			cardinality: "one",
			description: "The vault's semantic boards",
		},
	],
	/**
	 * List the boards.
	 * @param _input What the command was given.
	 * @param context The command context.
	 * @returns The listing.
	 */
	async handler(_input, context) {
		await context.require("server", "semantic");
		return { result: await listSemanticBoardsOnCanvas() };
	},
});

const ShowInputSchema = z.object({ name: z.string() });

const semanticShowContract = defineCommand({
	path: ["semantic", "show"],
	shared: ["url"],
	summary: "Read one semantic board",
	description:
		"Prints one semantic board's whole aggregate: every variant, its lifecycle, its ancestry and " +
		"its content. Use `semantic` on its own to list the boards.",
	examples: ["archboard semantic show pipeline"],
	parameters: [
		{
			kind: "positional",
			key: "name",
			name: "name",
			required: true,
			description: "The board to read",
		},
	],
	input: { ingress: ShowInputSchema },
	result: SemanticBoardReadSchema,
	output: {
		cases: [
			{
				id: "json",
				when: {},
				mode: "json",
				description: "The board, or the listing",
			},
		],
		/**
		 * One answer either way.
		 * @returns The output case's id.
		 */
		select: () => "json",
	},
	prerequisites: ["server"],
	effects: ["read"],
	refusals: [serverRefusal],
	relationships: [
		{
			method: "GET",
			path: "/api/semantic-boards/board",
			cardinality: "one",
			description: "One board's aggregate",
		},
	],
	/**
	 * Read the board.
	 * @param input What the command was given.
	 * @param context The command context.
	 * @returns The board.
	 */
	async handler(input, context) {
		await context.require("server", "semantic show");
		const answer = await readSemanticBoardAnswerOnCanvas(input.name);
		return {
			result: answer,
			diagnostics: answer.warnings.map((warning) => `Warning: ${warning.file}: ${warning.message}`),
		};
	},
});

export {
	semanticContract,
	semanticNewContract,
	semanticEditContract,
	semanticBranchContract,
	semanticShowContract,
};
