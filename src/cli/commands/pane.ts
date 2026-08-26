import { z } from "zod";
import { closePane, currentRequestedBoard, openPane } from "../../runtime/engine/canvas-client.js";
import { paneWords } from "../../runtime/engine/panes.js";
import { CliUsageError, defineCommand } from "../command-contract/contract.js";
import { HoldReportSchema, PaneRefSchema } from "../command-contract/schemas.js";
import { serverBrowserRefusals } from "../command-contract/common.js";

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
export const PaneCommandResultSchema = z.looseObject({
	success: z.boolean(),
	pane: PaneRefSchema.nullish(),
	closed: PaneRefSchema.extend({ board: z.string() }).optional(),
	paneCount: z.number().int().nonnegative(),
	onScreen: z.array(z.looseObject({ paneId: z.string(), place: z.string(), board: z.string() })),
	board: z
		.looseObject({
			success: z.boolean(),
			board: z.string(),
			identity: z.looseObject({ board: z.string(), variant: z.string() }),
			elementCount: z.number().int().nonnegative(),
			vaultBacked: z.boolean(),
		})
		.optional(),
	held: HoldReportSchema.optional(),
});
export type PaneCommandResult = z.infer<typeof PaneCommandResultSchema>;

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
	refusals: serverBrowserRefusals,
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
		return { result: PaneOpenResultSchema.parse(result), diagnostics: [diagnostic] };
	},
});

export const PaneCloseInputSchema = z.object({ tokens });
export type PaneCloseInput = z.infer<typeof PaneCloseInputSchema>;
export const PaneCloseStageSchema = stagedNoFlags.transform((values, context) => {
	const spec = values[0];
	if (!spec) {
		context.addIssue({
			code: "custom",
			message:
				"pane close needs to be told which pane: `pane close right`. Run `archboard panes` for what is on screen.",
		});
		return z.NEVER;
	}
	return { spec };
});
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
	refusals: serverBrowserRefusals,
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
