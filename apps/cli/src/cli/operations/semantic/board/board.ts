// The agent's way into a semantic board (ADR 0023).
//
// Four commands: make one, change one, read one, draw one. Every change goes to
// the running Archboard server, which is the process that can take the board's lease,
// check the version, write the aggregate and then tell the panes — writing the
// file from here would get the first three and leave every pane on screen
// showing the board as it was.
//
// The stated shape of a change is JSON, on standard input or in a file. That is
// not a concession to machines: nodes, their containment and their
// relationships are a structure, and a flag grammar for a structure is a second
// contract to keep in step with the first. The one contract is the Zod schema
// in `@archboard/board`, and what arrives here is parsed against it
// before it is sent.

import { z } from "zod";
import { diagnosticLine } from "@archboard/board/policy";
import {
	BoardBranchInputSchema,
	BoardCreateInputSchema,
	ConfirmableRefusalSchema,
	VariantEditInputSchema,
} from "@archboard/board/commands";
import {
	branchSemanticBoardOnServer,
	createSemanticBoardOnServer,
	editSemanticBoardOnServer,
	listSemanticBoardsOnServer,
	SemanticBoardEntrySchema,
	readSemanticBoardAnswerOnServer,
} from "#cli/clients/server/semantic-boards.ts";
import { CliUsageError, defineCommand } from "#cli/protocol/contract/contract.ts";
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
	UNNAMED_VARIANT,
} from "#cli/operations/semantic/input/semantic-input.ts";
import { BRANCH_HELP, EDIT_HELP } from "#cli/operations/semantic/board/board-help.ts";
import {
	boardHeldRefusal,
	boardVersionRefusal,
	claimRevokedRefusal,
	doingRefusal,
	serverRefusal,
} from "#cli/protocol/contract/refusals.ts";

const NewInputSchema = z.object({ name: z.string(), input: z.string().optional() });
const statedArchitectureKeys = BoardCreateInputSchema.keyof().options.filter(
	(key) => key !== "name",
);

const semanticNewContract = defineCommand({
	path: ["semantic", "new"],
	shared: ["url", "directory", "doing", "as-session"],
	summary: "Create a semantic architecture board",
	description:
		"Creates one persisted semantic board, empty or populated from a stated architecture. " +
		`The stated architecture JSON accepts ${statedArchitectureKeys
			.map((key) => `\`${key}\``)
			.join(
				", ",
			)}; \`level\` is required, all other fields are optional, and omitted collections default empty. ` +
		'`"lifecycle": "draft"` makes a board for architecture nobody has built yet: its first variant ' +
		"is a draft and the board has no current variant until one is adopted. " +
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
		const written = await createSemanticBoardOnServer(input.name, asked);
		const board = written.board;
		return {
			result: writeResult(written),
			diagnostics: [
				...written.warnings.map(diagnosticLine),
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
	confirm: z.array(z.string()).optional(),
});

/** The refusals an edit passes by naming their code with --confirm (TASK-487). */
const confirmableRefusals = (
	[
		[
			"RESTORE_UNCONFIRMED",
			"The change states an id that only another variant of the board holds. The refusal names " +
				"each id and the variants that hold it.",
		],
		[
			"PART_RECREATED",
			"The change adds a part under a new id while an ancestor variant holds it, by name or by " +
				"binding, under an id this variant lacks. The refusal names that id: state it to bring " +
				"the part back.",
		],
		[
			"INHERITANCE_DROPPED",
			"The change removes more than half of the parts the variant holds from its predecessor. " +
				"The refusal names how many.",
		],
	] as const
).map(([code, description]) => ({
	code,
	exit: 1,
	stream: "stderr" as const,
	description: `${description} Add --confirm ${code} to make the change on purpose.`,
}));

const semanticEditContract = defineCommand({
	path: ["semantic", "edit"],
	shared: ["url", "directory", "doing", "expect-version", "as-session"],
	summary: "Change a semantic architecture board",
	description: EDIT_HELP,
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
			description: `Which variant the change lands on, by id or name; ${UNNAMED_VARIANT}`,
		},
		{
			kind: "option",
			key: "input",
			spellings: ["--input"],
			value: "required",
			placeholder: "file.json",
			description: "A JSON file stating the change; standard input when absent",
		},
		{
			kind: "option",
			key: "confirm",
			spellings: ["--confirm"],
			value: "required",
			occurrences: "append",
			placeholder: "code",
			description:
				"Make on purpose a change that the refusal with this code would stop " +
				`(${ConfirmableRefusalSchema.options.join(", ")}); the answer names each confirmed act`,
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
		...confirmableRefusals,
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
		// Said here rather than carried out with the answer: a flag that overrode
		// the stated variant is most worth hearing about when the write it aimed
		// at does not come back, and an answer's diagnostics are only presented
		// when there is an answer.
		for (const line of targeted.diagnostics) {
			context.diagnostic(line);
		}
		const edit = context.parse(VariantEditInputSchema, confirmed(targeted.stated, input));
		const written = await editSemanticBoardOnServer(input.name, edit);
		return {
			result: writeResult(written),
			diagnostics: describedWrite(written),
		};
	},
});

/**
 * The stated change with the codes --confirm named added to the ones it
 * confirms itself. Without the option the change says what it says, and a
 * `confirm` that is not a list is left for the schema to refuse.
 * @param stated The change as stated.
 * @param input What the command was given.
 * @returns The change to send.
 */
function confirmed(
	stated: Record<string, unknown>,
	input: z.infer<typeof EditInputSchema>,
): Record<string, unknown> {
	const own = stated["confirm"] ?? [];
	const asked = input.confirm ?? [];
	if (asked.length === 0 || !Array.isArray(own)) return stated;
	return { ...stated, confirm: [...own, ...asked] };
}

const BranchInputSchema = z.object({
	name: z.string(),
	from: SelectorSchema.optional(),
	as: SelectorSchema,
	summary: SelectorSchema.optional(),
});

const semanticBranchContract = defineCommand({
	path: ["semantic", "branch"],
	shared: ["url", "directory", "doing", "expect-version", "as-session"],
	summary: "Derive a proposal from a variant of a semantic board",
	description: BRANCH_HELP,
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
			description: `The variant to derive from, by id or name; ${UNNAMED_VARIANT}`,
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
			// Left out rather than defaulted here: the store opens the variant the
			// board's name opens, which is the current one only when there is one.
			...(input.from === undefined ? {} : { from: input.from }),
			name: input.as,
			...(input.summary === undefined ? {} : { summary: input.summary }),
		});
		const written = await branchSemanticBoardOnServer(input.name, branch);
		const board = written.board;
		const proposal = board.variants.find((variant) => variant.name === input.as);
		return {
			result: writeResult(written),
			diagnostics: [
				...written.warnings.map(diagnosticLine),
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
	shared: ["url", "directory"],
	summary: "Every semantic architecture board in the vault",
	description:
		"Lists the semantic boards the vault holds: every `.semantic.json` aggregate, and nothing " +
		"else in the vault.",
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
		return { result: await listSemanticBoardsOnServer() };
	},
});

const ShowInputSchema = z.object({ name: z.string() });

const semanticShowContract = defineCommand({
	path: ["semantic", "show"],
	shared: ["url", "directory"],
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
		const answer = await readSemanticBoardAnswerOnServer(input.name);
		return {
			result: answer,
			diagnostics: answer.warnings.map(diagnosticLine),
		};
	},
});

export {
	semanticContract,
	semanticNewContract,
	semanticEditContract,
	semanticBranchContract,
	semanticShowContract,
	// Where a write lands is this command's rule, kept with the rest of what a
	// person types in `semantic/input/semantic-input`, and settled by `semantic resolve` the
	// same way. Named here because a module's tests reach it through a root file.
	targetedVariant,
};
