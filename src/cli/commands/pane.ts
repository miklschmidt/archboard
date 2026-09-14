import { z } from "zod";
import { closePane, getPanes, openPane, showBoardInPane } from "@/runtime/engine/canvas-client";
import { paneWords } from "@/runtime/engine/panes";
import { CliUsageError, defineCommand, type TokenParameter } from "@/cli/command-contract/contract";
import { PaneRefSchema } from "@/cli/command-contract/schemas";
import { serverBrowserRefusals } from "@/cli/command-contract/common";
import { parseStage, stagedFlags, stagedTokens } from "@/cli/commands/lib/staged-tokens";

const usage = "browser needs a subcommand: panes, open, close, or show.";
const tokens = z.array(z.string()).default([]);
const stagedNoFlags = z.array(z.string()).transform((values, context) => {
	for (const token of values) {
		if (token.startsWith("--")) {
			context.addIssue({ code: "custom", message: `Unknown flag ${token.split("=", 1)[0]}` });
			return z.NEVER;
		}
	}
	return values;
});
const OnScreenPaneSchema = z.looseObject({
	paneId: z.string(),
	place: z.string(),
	/** The board it is showing, or null on a vault that holds none yet. */
	board: z.string().nullable(),
});

const PaneNamespaceInputSchema = z.object({ tokens });
type PaneNamespaceInput = z.infer<typeof PaneNamespaceInputSchema>;
const PaneNamespaceResultSchema = z.never();
type PaneNamespaceResult = z.infer<typeof PaneNamespaceResultSchema>;
const browserContract = defineCommand({
	path: ["browser"],
	shared: ["url"],
	summary: "Inspect or control the connected browser session",
	description: "Routes live browser inspection and control commands; none writes a board.",
	examples: ["archboard browser panes"],
	parameters: [
		{
			kind: "positional",
			key: "tokens",
			name: "arguments",
			repeatable: true,
			route: "pass-through",
			hidden: true,
			description: "Namespace arguments",
		},
	],
	input: { ingress: PaneNamespaceInputSchema },
	result: PaneNamespaceResultSchema,
	output: {
		cases: [{ id: "json", when: {}, mode: "json", description: "Namespace refusal" }],
		/**
		 * Selects the only output case.
		 * @returns The json case id.
		 */
		select: () => "json",
	},
	prerequisites: [],
	effects: [],
	refusals: [],
	relationships: [],
	/**
	 * Refuses the bare namespace with its subcommand usage line.
	 * @returns Never; the usage error is the whole behaviour.
	 */
	async handler() {
		throw new CliUsageError(usage);
	},
});

const PaneOpenInputSchema = z.object({ tokens });
type PaneOpenInput = z.infer<typeof PaneOpenInputSchema>;
const PaneOpenStageSchema = stagedNoFlags;
type PaneOpenStage = z.infer<typeof PaneOpenStageSchema>;
const PaneOpenResultSchema = z.looseObject({
	success: z.literal(true),
	pane: PaneRefSchema.nullable(),
	paneCount: z.number().int().nonnegative(),
	onScreen: z.array(OnScreenPaneSchema),
});
type PaneOpenResult = z.infer<typeof PaneOpenResultSchema>;
const paneOpenContract = defineCommand({
	path: ["browser", "open"],
	shared: ["url"],
	summary: "Open a second browser pane",
	description: "Splits the connected browser canvas; the new pane inherits the displayed board.",
	examples: ["archboard browser open"],
	parameters: [stagedTokens("open-token")],
	input: {
		ingress: PaneOpenInputSchema,
		stages: [
			{
				name: "open-arguments",
				when: "after-server",
				description: "Legacy no-option grammar",
				schema: PaneOpenStageSchema,
			},
		],
	},
	result: PaneOpenResultSchema,
	output: {
		cases: [
			{
				id: "json",
				when: {},
				mode: "json",
				description: "Opened pane",
				presentation: ["diagnostics", "result"],
			},
		],
		/**
		 * Selects the only output case.
		 * @returns The json case id.
		 */
		select: () => "json",
	},
	prerequisites: ["server", "browser"],
	effects: ["browser"],
	refusals: serverBrowserRefusals,
	relationships: [
		{ method: "POST", path: "/api/panes/open", cardinality: "one", description: "Open the pane" },
	],
	/**
	 * Splits the browser canvas into one more pane and says where it landed.
	 * @param input - The ingress input holding the staged tokens.
	 * @param context - The command context.
	 * @returns The opened pane with a diagnostic naming it.
	 */
	async handler(input, context) {
		await context.require("server", "Opening a pane");
		context.parse(PaneOpenStageSchema, input.tokens);
		await context.require("browser", "Opening a pane");
		const result = await openPane();
		const place = result.pane?.place;
		const where = place ? paneWords(place) : "a new pane";
		const diagnostic = `Opened ${where}. It inherited the displayed board. Show another with \`browser show <board> --pane ${place ?? "<spec>"}\`.`;
		return { result: PaneOpenResultSchema.parse(result), diagnostics: [diagnostic] };
	},
});

const PaneCloseInputSchema = z.object({ tokens });
type PaneCloseInput = z.infer<typeof PaneCloseInputSchema>;
const PaneCloseStageSchema = stagedNoFlags.transform((values, context) => {
	const spec = values[0];
	if (!spec) {
		context.addIssue({
			code: "custom",
			message:
				"browser close needs a pane: `browser close right`. Run `archboard browser panes` to inspect the session.",
		});
		return z.NEVER;
	}
	return { spec };
});
type PaneCloseStage = z.infer<typeof PaneCloseStageSchema>;
const PaneCloseResultSchema = z.looseObject({
	success: z.literal(true),
	closed: PaneRefSchema.extend({ board: z.string().nullable() }),
	paneCount: z.number().int().nonnegative(),
	onScreen: z.array(OnScreenPaneSchema),
});
type PaneCloseResult = z.infer<typeof PaneCloseResultSchema>;
const paneCloseContract = defineCommand({
	path: ["browser", "close"],
	shared: ["url"],
	summary: "Close one browser pane",
	description: "Takes one board off screen without changing the board itself.",
	examples: ["archboard browser close right"],
	parameters: [
		{
			kind: "positional",
			key: "spec",
			name: "pane",
			required: true,
			route: "staged",
			description:
				"Which pane to close: left, right, top, bottom, focused, primary, a position or a pane id",
		},
		stagedTokens("close-token"),
	],
	input: {
		ingress: PaneCloseInputSchema,
		stages: [
			{
				name: "close-arguments",
				when: "after-server",
				description: "Pane selector and legacy no-option grammar",
				schema: PaneCloseStageSchema,
			},
		],
	},
	result: PaneCloseResultSchema,
	output: {
		cases: [
			{
				id: "json",
				when: {},
				mode: "json",
				description: "Closed pane",
				presentation: ["diagnostics", "result"],
			},
		],
		/**
		 * Selects the only output case.
		 * @returns The json case id.
		 */
		select: () => "json",
	},
	prerequisites: ["server", "browser"],
	effects: ["browser"],
	refusals: serverBrowserRefusals,
	relationships: [
		{
			method: "POST",
			path: "/api/panes/close",
			cardinality: "one",
			description: "Close the selected pane",
		},
	],
	/**
	 * Takes one pane off screen, reminding the person that the board it showed
	 * is still open on the canvas.
	 * @param input - The ingress input holding the staged tokens.
	 * @param context - The command context.
	 * @returns The closed pane with a diagnostic naming it.
	 */
	async handler(input, context) {
		await context.require("server", "Closing a pane");
		const request = context.parse(PaneCloseStageSchema, input.tokens);
		await context.require("browser", "Closing a pane");
		const result = await closePane(request.spec);
		return {
			result: PaneCloseResultSchema.parse(result),
			diagnostics: [
				`Closed ${paneWords(result.closed?.place ?? request.spec)}. "${result.closed?.board}" is off the screen, not gone — it is still open on the canvas, with whatever was drawn on it.`,
			],
		};
	},
});

const PanesInputSchema = z.object({ tokens, text: z.boolean().default(false) });
type PanesInput = z.infer<typeof PanesInputSchema>;
const PanesResultSchema = z.looseObject({
	success: z.literal(true),
	paneCount: z.number().int().nonnegative(),
	panes: z.array(
		z.looseObject({ paneId: z.string(), place: z.string(), board: z.string().nullable() }),
	),
	summary: z.string(),
	text: z.string(),
});
type PanesResult = z.infer<typeof PanesResultSchema>;
const panesContract = defineCommand({
	path: ["browser", "panes"],
	shared: ["url"],
	summary: "What every pane is showing and reading",
	description:
		"Reports where each pane sits, which board and variant it shows, which view it is read " +
		"through, and what the person has picked out. View state only: never board content.",
	examples: ["archboard browser panes", "archboard browser panes --text"],
	parameters: [
		{
			kind: "option",
			key: "text",
			spellings: ["--text"],
			value: "none",
			description: "Print the human-readable read-out",
		},
		stagedTokens("panes-token"),
	],
	input: {
		ingress: PanesInputSchema,
		stages: [
			{
				name: "panes-arguments",
				when: "after-server",
				description: "No positional arguments",
				schema: stagedNoFlags,
			},
		],
	},
	result: z.union([PanesResultSchema, z.string()]),
	output: {
		cases: [
			{
				id: "json",
				when: { key: "text", present: false },
				mode: "json",
				description: "The panes report",
				presentation: ["result"],
			},
			{
				id: "text",
				when: { key: "text", present: true },
				mode: "text",
				description: "The read-out, as a person reads it",
				presentation: ["result"],
			},
		],
		/**
		 * Text when `--text` was given, the report otherwise.
		 * @param input The parsed input.
		 * @param input.text Whether `--text` was given.
		 * @returns The output case's id.
		 */
		select: (input: { text: boolean }) => (input.text ? "text" : "json"),
	},
	prerequisites: ["server"],
	effects: [],
	refusals: serverBrowserRefusals,
	relationships: [
		{ method: "GET", path: "/api/panes", cardinality: "one", description: "Read the panes" },
	],
	/**
	 * Report what every pane is showing.
	 * @param input - The ingress input holding the staged tokens.
	 * @param context - The command context.
	 * @returns The panes report.
	 */
	async handler(input, context) {
		await context.require("server", "Reading the panes");
		context.parse(stagedNoFlags, input.tokens);
		const report = PanesResultSchema.parse(await getPanes());
		return { result: input.text ? report.text : report };
	},
});

const ShowInputSchema = z.object({ tokens });
type ShowInput = z.infer<typeof ShowInputSchema>;
/**
 * What a show accepts, declared once for help and for the stage. The tokens
 * carry the board and `--pane` rather than the parser taking them, because a
 * staged command passes everything after its first word through: what a show
 * is allowed to say is decided after the canvas has answered, so the refusal
 * can name what is actually on screen.
 */
const SHOW_PARAMETERS: readonly TokenParameter[] = [
	{
		kind: "positional",
		key: "board",
		name: "board",
		placeholder: "board[@variant]",
		required: true,
		route: "staged",
		description:
			"The board to show, optionally at one variant; refused when the vault has no such board",
	},
	{
		kind: "option",
		key: "pane",
		spellings: ["--pane"],
		value: "required",
		placeholder: "spec",
		route: "staged",
		requiredWhen: "once two panes are open",
		description: "Which pane: left, right, top, bottom, focused, primary, a position or a pane id",
	},
	stagedTokens("show-token"),
];
const ShowStageSchema = z
	.array(z.string())
	.transform((values, context) => parseStage(values, stagedFlags(SHOW_PARAMETERS), context))
	.transform((stage, context) => {
		const board = stage.positionals[0];
		if (board === undefined || board === "") {
			context.addIssue({
				code: "custom",
				message:
					"browser show needs a board: `browser show pipeline --pane right`. Run `archboard browser panes` to see what is on screen.",
			});
			return z.NEVER;
		}
		const pane = stage.flags["pane"];
		return { board, pane: typeof pane === "string" ? pane : undefined };
	});
type ShowStage = z.infer<typeof ShowStageSchema>;
const ShowResultSchema = z.looseObject({
	success: z.literal(true),
	board: z.string(),
	identity: z.looseObject({ board: z.string(), variant: z.string() }),
	paneId: z.string(),
});
type ShowResult = z.infer<typeof ShowResultSchema>;
const browserShowContract = defineCommand({
	path: ["browser", "show"],
	shared: ["url"],
	summary: "Show a board in one pane",
	description:
		"Points one pane at one board. Nothing is written: a board is shown, not created, and a " +
		"name the vault does not hold is refused rather than made.",
	examples: [
		"archboard browser show pipeline --pane left",
		"archboard browser show pipeline@proposed --pane right",
	],
	parameters: SHOW_PARAMETERS,
	input: {
		ingress: ShowInputSchema,
		stages: [
			{
				name: "show-arguments",
				when: "after-server",
				description: "The board to show",
				rules: [
					"Name one board, optionally with @<variant>",
					"Refuse a board the vault does not hold rather than creating it",
				],
				schema: ShowStageSchema,
			},
		],
	},
	result: ShowResultSchema,
	output: {
		cases: [
			{
				id: "json",
				when: {},
				mode: "json",
				description: "What the pane is showing now",
				presentation: ["diagnostics", "result"],
			},
		],
		/**
		 * Selects the only output case.
		 * @returns The json case id.
		 */
		select: () => "json",
	},
	prerequisites: ["server", "browser"],
	effects: ["browser"],
	refusals: serverBrowserRefusals,
	relationships: [
		{
			method: "POST",
			path: "/api/panes/show",
			cardinality: "one",
			description: "Point the pane at the board",
		},
	],
	/**
	 * Point one pane at one board.
	 * @param input - The ingress input holding the staged tokens and the pane.
	 * @param context - The command context.
	 * @returns What the pane is showing, with a diagnostic naming it.
	 */
	async handler(input, context) {
		await context.require("server", "Showing a board");
		const request = context.parse(ShowStageSchema, input.tokens);
		await context.require("browser", "Showing a board");
		const result = await showBoardInPane(request.board, request.pane);
		return {
			result: ShowResultSchema.parse(result),
			diagnostics: [`Pane ${result.paneId} is showing "${result.board}".`],
		};
	},
});

export {
	PaneNamespaceInputSchema,
	type PaneNamespaceInput,
	PaneNamespaceResultSchema,
	type PaneNamespaceResult,
	browserContract,
	PaneOpenInputSchema,
	type PaneOpenInput,
	PaneOpenStageSchema,
	type PaneOpenStage,
	PaneOpenResultSchema,
	type PaneOpenResult,
	paneOpenContract,
	PaneCloseInputSchema,
	type PaneCloseInput,
	PaneCloseStageSchema,
	type PaneCloseStage,
	PaneCloseResultSchema,
	type PaneCloseResult,
	paneCloseContract,
	PanesInputSchema,
	type PanesInput,
	PanesResultSchema,
	type PanesResult,
	panesContract,
	ShowInputSchema,
	type ShowInput,
	ShowStageSchema,
	type ShowStage,
	ShowResultSchema,
	type ShowResult,
	browserShowContract,
};
