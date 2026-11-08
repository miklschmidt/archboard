import { ArchitecturePaneReadingSchema } from "@archboard/model/pane-context";
import { statedJson } from "#cli/commands/model/operations/input.ts";
import { z } from "zod";
import {
	closePane,
	getPanes,
	openPane,
	showModelInPane,
	type ShowModelResponse,
} from "#cli/server-access/clients/panes.ts";
import { paneWords } from "@archboard/server-lifecycle/panes";
import { findVault } from "@archboard/workspace/vault";
import { CliUsageError, defineCommand } from "#cli/contract/protocol/contract.ts";
import { PaneRefSchema } from "#cli/contract/protocol/schemas.ts";
import { serverBrowserRefusals } from "#cli/contract/protocol/refusals.ts";
import { stagedTokens } from "#cli/commands/pane/rules/staged-tokens.ts";

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
	/** The model it is showing, or null on a vault that holds none yet. */
	paneKey: z.string().nullable(),
});

const PaneNamespaceInputSchema = z.object({ tokens });
const PaneNamespaceResultSchema = z.never();
const browserContract = defineCommand({
	path: ["browser"],
	shared: ["url"],
	summary: "Inspect or control the connected browser session",
	description: "Routes live browser inspection and control commands; none writes architecture.",
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
const PaneOpenStageSchema = stagedNoFlags;
const PaneOpenResultSchema = z.looseObject({
	success: z.literal(true),
	pane: PaneRefSchema.nullable(),
	paneCount: z.number().int().nonnegative(),
	onScreen: z.array(OnScreenPaneSchema),
});
const paneOpenContract = defineCommand({
	path: ["browser", "open"],
	shared: ["url"],
	summary: "Open a second browser pane",
	description: "Splits the connected browser canvas; the new pane inherits the displayed reading.",
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
		const diagnostic = `Opened ${where}. It inherited the displayed reading. Show another with \`browser show <model> --pane ${place ?? "<spec>"}\`.`;
		return { result: PaneOpenResultSchema.parse(result), diagnostics: [diagnostic] };
	},
});

const PaneCloseInputSchema = z.object({ tokens });
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
const PaneCloseResultSchema = z.looseObject({
	success: z.literal(true),
	closed: PaneRefSchema.extend({ paneKey: z.string().nullable() }),
	paneCount: z.number().int().nonnegative(),
	onScreen: z.array(OnScreenPaneSchema),
});
const paneCloseContract = defineCommand({
	path: ["browser", "close"],
	shared: ["url"],
	summary: "Close one browser pane",
	description: "Takes one reading off screen without changing the architecture.",
	examples: ["archboard browser close right"],
	parameters: [
		{
			kind: "positional",
			key: "spec",
			name: "pane",
			required: true,
			route: "staged",
			description:
				"Which pane to close: `left`, `right`, `top`, `bottom`, `focused`, `primary`, a position or a pane id",
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
	 * Takes one pane off screen, reminding the user that the model it showed
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
				`Closed ${paneWords(result.closed?.place ?? request.spec)}. Its reading is off the screen and the architecture is unchanged on the Archboard server.`,
			],
		};
	},
});

const PanesInputSchema = z.object({ tokens });
const PanesResultSchema = z.looseObject({
	success: z.literal(true),
	paneCount: z.number().int().nonnegative(),
	panes: z.array(
		z.looseObject({
			paneId: z.string(),
			place: z.string(),
			paneKey: z.string().nullable(),
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
const panesContract = defineCommand({
	path: ["browser", "panes"],
	shared: ["url"],
	summary: "What every pane is showing and reading",
	description: [
		"Reports, for each pane:",
		"- Where it sits.",
		"- Which model and variant it shows.",
		"- Which view it is read through.",
		"- What the user has picked out.",
		"",
		"This is view state only, never model content.",
		"",
		"Each pane names its repository and checkout, and `own` says whether it shows the vault that a command run in this directory finds. It needs no vault. Where none is found, no pane is `own`.",
	].join("\n"),
	examples: ["archboard browser panes", "archboard --text browser panes"],
	parameters: [stagedTokens("panes-token")],
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
				when: {},
				mode: "json",
				description: "The panes report",
				presentation: ["result"],
			},
		],
		/**
		 * Selects the only output case.
		 * @returns The json case id.
		 */
		select: () => "json",
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
		return { result: context.answer === "text" ? report.text : report };
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
function choiceLine(result: Pick<ShowModelResponse, "chose">): string[] {
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
			description: `The explicit \`${key}\` selector`,
		})),
		{
			kind: "option",
			key: "against",
			spellings: ["--against"],
			value: "required",
			placeholder: "id|name",
			description: "Compare against one explicit state or complete checkpoint identity",
		},
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
		...(
			[
				["focus", "--focus"],
				["hideKinds", "--hide-kind"],
				["expand", "--expand"],
			] as const
		).map(([key, spelling]) => ({
			kind: "option" as const,
			key,
			spellings: [spelling] as const,
			value: "required" as const,
			occurrences: "append" as const,
			placeholder: "id",
			description: `The \`${key}\` identities`,
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
				: context.parse(ArchitecturePaneReadingSchema, await statedJson({ input: file }, context));
		await context.require("browser", "Show architecture");
		const result = await showModelInPane(reading, pane);
		return { result: ShowResultSchema.parse(result), diagnostics: choiceLine(result) };
	},
});

export {
	browserContract,
	PaneOpenResultSchema,
	paneOpenContract,
	paneCloseContract,
	panesContract,
	ShowResultSchema,
	browserShowContract,
};
