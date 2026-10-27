import { ArchitecturePaneReadingSchema } from "@archboard/board/pane-context";
import { statedJson } from "#cli/operations/model/input.ts";
import { z } from "zod";
import {
	closePane,
	getPanes,
	openPane,
	showBoardInPane,
	type ShowBoardResponse,
} from "#cli/clients/server/panes.ts";
import { paneWords } from "@archboard/server-lifecycle/panes";
import { findVault } from "@archboard/workspace/vault";
import { CliUsageError, defineCommand } from "#cli/protocol/contract/contract.ts";
import { PaneRefSchema } from "#cli/protocol/contract/schemas.ts";
import { serverBrowserRefusals } from "#cli/protocol/contract/refusals.ts";
import { stagedTokens } from "#cli/rules/staged-tokens/staged-tokens.ts";

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
	 * Takes one pane off screen, reminding the user that the board it showed
	 * is still open on the server.
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
				`Closed ${paneWords(result.closed?.place ?? request.spec)}. "${result.closed?.board}" is off the screen, not gone — it is still open on the Archboard server, with whatever was drawn on it.`,
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
		z.looseObject({
			paneId: z.string(),
			place: z.string(),
			board: z.string().nullable(),
			vault: z.string(),
			/** The repository identity, or an untracked vault's registry name; null when unregistered. */
			repository: z.string().nullable(),
			/** The checkout that holds the vault, or the directory of an untracked vault. */
			checkout: z.string(),
			/** Whether the pane shows the vault a command run here finds: your own checkout. */
			own: z.boolean(),
		}),
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
		"through, and what the user has picked out. View state only: never board content. Each " +
		"pane names its repository and checkout, and own says whether it shows the vault that a " +
		"command run in this directory finds. It needs no vault: where none is found, no pane is own.",
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
				description: "The read-out, as a user reads it",
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
		const report = PanesResultSchema.parse(await getPanes(await callerVault()));
		return { result: input.text ? report.text : report };
	},
});

/**
 * The vault a command run here finds, as every command that calls a vault
 * finds it, without refusing and without registering anything: `browser panes`
 * reports the screen, and only says which pane shows the caller's own vault.
 * @returns The vault, or null when none is found here.
 */
async function callerVault(): Promise<string | null> {
	const finding = await findVault({
		directory: null,
		cwd: process.cwd(),
	});
	return finding.ok ? finding.found.path : null;
}

/**
 * The line that says a show chose another checkout, which the agent tells the user.
 * @param result The show's answer.
 * @returns The line, or none when the show changed no choice.
 */
function choiceLine(result: Pick<ShowBoardResponse, "chose">): string[] {
	const { chose } = result;
	if (chose === undefined) return [];
	const instead = chose.replaced === null ? "" : ` in place of ${chose.replaced}`;
	return [
		`This machine now reads ${chose.checkout} for ${chose.repository}${instead}: every pane of it reads this checkout. Tell the user.`,
	];
}

const ShowInputSchema = ArchitecturePaneReadingSchema.extend({
	pane: z.string().optional(),
	input: z.string().optional(),
});
type ShowInput = z.infer<typeof ShowInputSchema>;
const ShowStageSchema = ShowInputSchema;
type ShowStage = ShowInput;
const ShowResultSchema = z.looseObject({
	success: z.literal(true),
	model: z.string(),
	reading: ArchitecturePaneReadingSchema,
	revision: z.unknown(),
	repository: z.string().nullable(),
	checkout: z.string(),
	chose: z
		.object({ repository: z.string(), checkout: z.string(), replaced: z.string().nullable() })
		.optional(),
	paneId: z.string(),
});
type ShowResult = z.infer<typeof ShowResultSchema>;
const browserShowContract = defineCommand({
	path: ["browser", "show"],
	shared: ["url", "directory", "as-session"],
	summary: "Show a canonical reading in one pane",
	description:
		"Resolves the exact model, module, state, flow, or walkthrough before moving the existing pane. An agent show preserves the browser's shown conversation.",
	examples: [
		"archboard browser show --pane A --module Gateway",
		"archboard browser show Shop --pane B --grammar sequence --flow Request",
	],
	parameters: [
		{
			kind: "positional",
			key: "model",
			name: "model",
			description: "The optional model identity or name",
		},
		...(
			[
				"pane",
				"module",
				"scope",
				"state",
				"checkpoint",
				"flow",
				"walkthrough",
				"preview",
				"bookmark",
				"legacyAddress",
				"input",
			] as const
		).map((key) => ({
			kind: "option" as const,
			key,
			spellings: [key === "legacyAddress" ? "--legacy-address" : `--${key}`] as const,
			value: "required" as const,
			placeholder: "value",
			description: `The explicit ${key} selector`,
		})),
		{
			kind: "option",
			key: "grammar",
			spellings: ["--grammar"],
			value: "required",
			choices: ["architecture", "sequence", "flowchart"],
			description: "The diagram grammar",
		},
		{
			kind: "option",
			key: "beat",
			spellings: ["--beat"],
			value: "required",
			placeholder: "index",
			description: "The zero-based walkthrough beat",
		},
		...(["focus", "hideKinds", "hideGroups"] as const).map((key) => ({
			kind: "option" as const,
			key,
			spellings: [
				key === "focus" ? "--focus" : key === "hideKinds" ? "--hide-kind" : "--hide-group",
			] as const,
			value: "required" as const,
			occurrences: "append" as const,
			placeholder: "id",
			description: `The ${key} identities`,
		})),
	],
	input: {
		ingress: ShowInputSchema.extend({ beat: z.coerce.number().int().nonnegative().optional() }),
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
			description: "Point the existing pane at a canonical reading",
		},
	],
	/**
	 * Show a resolved canonical reading in the named pane.
	 * @param input The complete reading and pane selector.
	 * @param context The invocation capabilities.
	 * @returns The navigation receipt.
	 */
	async handler(input, context) {
		await context.require("server", "Show architecture");
		const { pane, input: file, ...flags } = input;
		const reading =
			file === undefined
				? flags
				: ArchitecturePaneReadingSchema.parse(await statedJson({ input: file }, context));
		await context.require("browser", "Show architecture");
		const result = await showBoardInPane(reading, pane);
		return { result: ShowResultSchema.parse(result), diagnostics: choiceLine(result) };
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
