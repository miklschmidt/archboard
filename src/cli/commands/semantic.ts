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
	OfferedViewSchema,
	RenderedVariantSchema,
	VariantEditInputSchema,
} from "@/shared/semantic-board/index";
import {
	branchSemanticBoardOnCanvas,
	createSemanticBoardOnCanvas,
	editSemanticBoardOnCanvas,
	listSemanticBoardsOnCanvas,
	readSemanticBoardOnCanvas,
	renderSemanticBoardOnCanvas,
} from "@/runtime/semantic-board-client/index";
import { CliUsageError, defineCommand } from "@/cli/command-contract/contract";
import { PendingArtifactSchema } from "@/cli/command-contract/schemas";
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
} from "@/cli/commands/lib/semantic-input";
import {
	boardHeldRefusal,
	boardVersionRefusal,
	claimRevokedRefusal,
	doingRefusal,
	serverRefusal,
} from "@/cli/command-contract/common";

const THEMES = ["light", "dark"] as const;

const NewInputSchema = z.object({ name: z.string(), input: z.string().optional() });

const semanticNewContract = defineCommand({
	path: ["semantic", "new"],
	summary: "Create a semantic architecture board",
	usage: "semantic new <name> [--input <file.json>]",
	description:
		"Creates one persisted semantic board, empty or populated from a stated architecture. " +
		"The stated architecture is JSON with `nodes` and `edges`, read from --input or standard input.",
	examples: [
		'archboard semantic new pipeline --doing "starting the pipeline board"',
		'archboard semantic new pipeline --input arch.json --doing "drawing the current pipeline"',
	],
	parameters: [
		{ kind: "positional", key: "name", name: "name", description: "The board's name" },
		{
			kind: "option",
			key: "input",
			spellings: ["--input"],
			value: "required",
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
				`Semantic board "${board.name}" is at version ${board.version} with ` +
					`${board.variants[0]?.content.nodes.length ?? 0} nodes.`,
			],
		};
	},
});

const EditInputSchema = z.object({ name: z.string(), input: z.string().optional() });

const semanticEditContract = defineCommand({
	path: ["semantic", "edit"],
	summary: "Change a semantic architecture board",
	usage: "semantic edit <name> --expect-version <n> [--input <file.json>]",
	description:
		"Applies one batch of stated changes to a semantic board in one write. The batch is JSON with " +
		"`nodes`, `edges`, `flows`, `views` and the matching `remove...` lists, read from --input or " +
		"standard input, and it lands whole or not at all. Architectural content targets the selected " +
		"variant; views are shared by the whole board. --expect-version is required: state the " +
		"version the board reported when you read it, and the write is refused if somebody has changed " +
		"it since. A view's scope reads exactly as it is written: name relationships and the view shows " +
		"those and no others, so one connection can be isolated; name none and it shows every " +
		"relationship between the nodes it kept. Either way both ends of a shown relationship, every " +
		"participant of a shown flow, and every container they sit inside come with it.",
	examples: [
		'archboard semantic edit pipeline --expect-version 3 --input change.json --doing "adding the renderer"',
	],
	parameters: [
		{ kind: "positional", key: "name", name: "name", description: "The board's name" },
		{
			kind: "option",
			key: "input",
			spellings: ["--input"],
			value: "required",
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
		const edit = context.parse(VariantEditInputSchema, stated);
		const written = await editSemanticBoardOnCanvas(input.name, edit);
		return {
			result: writeResult(written),
			diagnostics: describedWrite(written),
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
	summary: "Derive a proposal from a variant of a semantic board",
	usage: "semantic branch <name> --as <proposal> [--from <variant>] --expect-version <n>",
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
		{ kind: "positional", key: "name", name: "name", description: "The board's name" },
		{
			kind: "option",
			key: "as",
			spellings: ["--as"],
			value: "required",
			description: "What to call the proposal",
		},
		{
			kind: "option",
			key: "from",
			spellings: ["--from"],
			value: "required",
			description: "The variant to derive from; the current one when absent",
		},
		{
			kind: "option",
			key: "summary",
			spellings: ["--summary"],
			value: "required",
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
				`Semantic board "${board.name}" is now at version ${board.version} with ` +
					`"${input.as}" derived from ${proposal?.parent ?? "its predecessor"}.`,
			],
		};
	},
});

const SemanticListingResultSchema = z.object({
	success: z.literal(true),
	boards: z.array(z.object({ name: z.string(), key: z.string() })),
});

const semanticContract = defineCommand({
	path: ["semantic"],
	summary: "Every semantic architecture board in the vault",
	usage: "semantic",
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
		return { result: { success: true as const, boards: await listSemanticBoardsOnCanvas() } };
	},
});

const ShowInputSchema = z.object({ name: z.string() });

const semanticShowContract = defineCommand({
	path: ["semantic", "show"],
	summary: "Read one semantic board",
	usage: "semantic show <name>",
	description:
		"Prints one semantic board's whole aggregate: every variant, its lifecycle, its ancestry and " +
		"its content. Use `semantic` on its own to list the boards.",
	examples: ["archboard semantic show pipeline"],
	parameters: [{ kind: "positional", key: "name", name: "name", description: "The board to read" }],
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
		return {
			result: { success: true as const, board: await readSemanticBoardOnCanvas(input.name) },
		};
	},
});

const RenderInputSchema = z.object({
	name: z.string(),
	variant: SelectorSchema.optional(),
	view: SelectorSchema.optional(),
	theme: z.enum(THEMES).default("light"),
	out: z.string().optional(),
});

const SemanticRenderResultSchema = z.object({
	success: z.literal(true),
	board: z.string(),
	version: z.int(),
	/**
	 * What was drawn, in the shapes the render answer already uses. A receipt
	 * that reduced either of them to a name would be a receipt somebody cannot
	 * act on: names move between variants and are what a person types, ids are
	 * what asks for exactly this picture again.
	 */
	variant: RenderedVariantSchema,
	/** The view that was drawn, or null when the whole variant was. */
	view: OfferedViewSchema.nullable(),
	file: z.string(),
	width: z.number(),
	height: z.number(),
});

const semanticRenderContract = defineCommand({
	path: ["semantic", "render"],
	summary: "Draw a semantic board to an SVG file",
	usage:
		"semantic render <name> --out <file.svg> [--variant <v>] [--view <v>] [--theme light|dark]",
	description:
		"Draws a semantic board at one variant, optionally through a board-owned named view. Layout, typography and " +
		"routing belong to the renderer; nothing about the picture is authored on the board.",
	examples: ["archboard semantic render pipeline --out pipeline.svg --theme dark"],
	parameters: [
		{ kind: "positional", key: "name", name: "name", description: "The board's name" },
		{
			kind: "option",
			key: "out",
			spellings: ["--out"],
			value: "required",
			description: "Where to write the SVG",
		},
		{
			kind: "option",
			key: "variant",
			spellings: ["--variant"],
			value: "required",
			description: "Which variant to draw; the current one when absent",
		},
		{
			kind: "option",
			key: "view",
			spellings: ["--view"],
			value: "required",
			description: "Which shared board view to draw; the whole variant when absent",
		},
		{
			kind: "option",
			key: "theme",
			spellings: ["--theme"],
			value: "required",
			description: "light or dark",
		},
	],
	input: { ingress: RenderInputSchema },
	result: SemanticRenderResultSchema,
	output: {
		cases: [
			{
				id: "file",
				when: {},
				mode: "file-receipt",
				description: "The SVG that was written",
				artifact: PendingArtifactSchema,
			},
		],
		/**
		 * One answer: the file.
		 * @returns The output case's id.
		 */
		select: () => "file",
	},
	prerequisites: ["server"],
	effects: ["read", "local-write"],
	refusals: [serverRefusal],
	relationships: [
		{
			method: "GET",
			path: "/api/semantic-boards/render",
			cardinality: "one",
			description: "Draw the variant",
		},
	],
	/**
	 * Draw the board.
	 * @param input What the command was given.
	 * @param context The command context.
	 * @returns The file receipt.
	 * @throws {CliUsageError} When no destination was named, or the board has nothing on it.
	 */
	async handler(input, context) {
		if (input.out === undefined) {
			throw new CliUsageError("semantic render needs --out <file.svg>");
		}
		await context.require("server", "semantic render");
		const drawn = await renderSemanticBoardOnCanvas(input.name, {
			...(input.variant === undefined ? {} : { variant: input.variant }),
			...(input.view === undefined ? {} : { view: input.view }),
			theme: input.theme,
			// The file outlives the canvas that drew it, so it carries its faces
			// rather than pointing at a server that may not be running.
			fonts: "embedded",
		});
		if ("empty" in drawn) {
			throw new CliUsageError(
				`Semantic board "${drawn.board}" has nothing on it yet, so there is nothing to draw.`,
			);
		}
		const file = context.resolvePath(input.out);
		return {
			result: {
				success: true as const,
				board: drawn.board,
				version: drawn.version,
				variant: drawn.variant,
				view: drawn.view,
				file,
				width: drawn.width,
				height: drawn.height,
			},
			pendingArtifact: { path: file, content: drawn.svg, encoding: "utf8" as const },
		};
	},
});

export {
	semanticContract,
	semanticNewContract,
	semanticEditContract,
	semanticBranchContract,
	semanticShowContract,
	semanticRenderContract,
};
