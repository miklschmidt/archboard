import { z } from "zod";
import {
	closePane,
	currentRequestedBoard,
	openPane,
	type PaneLayoutResponse,
} from "../../runtime/engine/canvas-client.js";
import { paneWords } from "../../runtime/engine/panes.js";
import { CliUsageError, defineCommand } from "../command-contract/contract.js";
import { HoldReportSchema, PaneRefSchema } from "../command-contract/schemas.js";

const usage =
	"pane needs a subcommand: open, close. For what is on screen right now, without changing it, run `archboard panes`.";
const tokens = z.array(z.string()).default([]);
const stagedNoFlags = z.array(z.string()).transform((values, context) => {
	for (const token of values)
		if (token.startsWith("--")) {
			context.addIssue({ code: "custom", message: `Unknown flag ${token.split("=", 1)[0]}` });
			return z.NEVER;
		}
	return values;
});
const resultValidator = z.looseObject({
	success: z.boolean(),
	pane: PaneRefSchema.nullish(),
	closed: PaneRefSchema.extend({ board: z.string() }).optional(),
	paneCount: z.number().int().nonnegative(),
	onScreen: z.array(z.looseObject({ paneId: z.string(), place: z.string(), board: z.string() })),
	held: HoldReportSchema.optional(),
});
export type PaneCommandResult = PaneLayoutResponse & {
	held?: z.infer<typeof HoldReportSchema>;
};
export const PaneCommandResultSchema = z.custom<PaneCommandResult>(
	(value) => resultValidator.safeParse(value).success,
);

export const PaneNamespaceInputSchema = z.object({ tokens });
export type PaneNamespaceInput = z.infer<typeof PaneNamespaceInputSchema>;
export const PaneNamespaceResultSchema = z.never();
export type PaneNamespaceResult = z.infer<typeof PaneNamespaceResultSchema>;
export const paneContract = defineCommand({
	path: ["pane"],
	summary: "Split the canvas into another pane, or close one",
	usage: "pane open [--board <key>] | pane close <spec>",
	description: "Routes pane mutation commands.",
	examples: ["archboard pane open"],
	parameters: [
		{
			kind: "positional",
			key: "tokens",
			name: "arguments",
			repeatable: true,
			route: "pass-through",
			description: "Namespace arguments",
		},
	],
	input: { ingress: PaneNamespaceInputSchema },
	result: PaneNamespaceResultSchema,
	output: {
		cases: [{ id: "json", when: {}, mode: "json", held: "none", description: "Namespace refusal" }],
		select: () => "json",
	},
	prerequisites: [],
	effects: [],
	refusals: [],
	relationships: [],
	async handler() {
		throw new CliUsageError(usage);
	},
});

export const PaneOpenInputSchema = z.object({ tokens });
export type PaneOpenInput = z.infer<typeof PaneOpenInputSchema>;
export const PaneOpenStageSchema = stagedNoFlags;
export type PaneOpenStage = z.infer<typeof PaneOpenStageSchema>;
export const PaneOpenResultSchema = PaneCommandResultSchema;
export type PaneOpenResult = z.infer<typeof PaneOpenResultSchema>;
export const paneOpenContract = defineCommand({
	path: ["pane", "open"],
	summary: "Open a second browser pane",
	usage: "pane open [--board <key>]",
	description: "Splits the rendered canvas and optionally opens the globally named board there.",
	examples: ["archboard pane open --board payments@option-a"],
	parameters: [
		{
			kind: "positional",
			key: "tokens",
			name: "open-token",
			repeatable: true,
			route: "staged-tokens",
			description: "Validated after server contact",
		},
	],
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
				held: "object-field-and-stderr-note",
				description: "Opened pane",
				presentation: ["diagnostics", "result", "held-note"],
			},
		],
		select: () => "json",
	},
	prerequisites: ["server", "browser"],
	effects: ["browser"],
	refusals: [
		{
			code: "CANVAS_UNREACHABLE",
			exit: 3,
			stream: "stderr",
			description: "The canvas could not be reached.",
		},
		{
			code: "BROWSER_REQUIRED",
			exit: 4,
			stream: "stderr",
			description: "No browser pane can be split.",
		},
	],
	relationships: [
		{ method: "POST", path: "/api/panes/open", cardinality: "one", description: "Open the pane" },
		{
			method: "POST",
			path: "/api/boards/open",
			cardinality: "conditional",
			description: "Open the named board in the new pane",
		},
	],
	async handler(input, context) {
		await context.require("server", "Opening a pane");
		context.parse(PaneOpenStageSchema, input.tokens);
		await context.require("browser", "Opening a pane");
		const wanted = currentRequestedBoard();
		const result = await openPane(wanted ? { board: wanted } : {});
		const place = result.pane?.place;
		const where = place ? paneWords(place) : "a new pane";
		const diagnostic = result.board
			? `"${result.board.board}" is showing in ${where}. The other pane was not touched. Commands still name the board: \`--board ${result.board.board}\`.`
			: `Opened ${where}. It is showing what was already on screen — point it somewhere else with \`board open <name> --pane ${place ?? "<spec>"}\`.`;
		return { result, diagnostics: [diagnostic] };
	},
});

export const PaneCloseInputSchema = z.object({ tokens });
export type PaneCloseInput = z.infer<typeof PaneCloseInputSchema>;
export const PaneCloseStageSchema = stagedNoFlags;
export type PaneCloseStage = z.infer<typeof PaneCloseStageSchema>;
export const PaneCloseResultSchema = PaneCommandResultSchema;
export type PaneCloseResult = z.infer<typeof PaneCloseResultSchema>;
export const paneCloseContract = defineCommand({
	path: ["pane", "close"],
	summary: "Close one browser pane",
	usage: "pane close <spec>",
	description: "Takes one board off screen without changing the board itself.",
	examples: ["archboard pane close right"],
	parameters: [
		{
			kind: "positional",
			key: "tokens",
			name: "close-token",
			repeatable: true,
			route: "staged-tokens",
			description: "Validated after server contact",
		},
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
				held: "object-field-and-stderr-note",
				description: "Closed pane",
				presentation: ["diagnostics", "result", "held-note"],
			},
		],
		select: () => "json",
	},
	prerequisites: ["server", "browser"],
	effects: ["browser"],
	refusals: [
		{
			code: "CANVAS_UNREACHABLE",
			exit: 3,
			stream: "stderr",
			description: "The canvas could not be reached.",
		},
		{
			code: "BROWSER_REQUIRED",
			exit: 4,
			stream: "stderr",
			description: "No browser pane can be closed.",
		},
	],
	relationships: [
		{
			method: "POST",
			path: "/api/panes/close",
			cardinality: "one",
			description: "Close the selected pane",
		},
	],
	async handler(input, context) {
		await context.require("server", "Closing a pane");
		const parsed = context.parse(PaneCloseStageSchema, input.tokens);
		const spec = parsed[0];
		if (!spec)
			throw new CliUsageError(
				"pane close needs to be told which pane: `pane close right`. Run `archboard panes` for what is on screen.",
			);
		await context.require("browser", "Closing a pane");
		const result = await closePane(spec);
		return {
			result,
			diagnostics: [
				`Closed ${paneWords(result.closed?.place ?? spec)}. "${result.closed?.board}" is off the screen, not gone — it is still open on the canvas, with whatever was drawn on it.`,
			],
		};
	},
});
