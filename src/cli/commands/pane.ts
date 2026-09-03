import { z } from "zod";
import { closePane, openPane } from "../../runtime/engine/canvas-client.js";
import { paneWords } from "../../runtime/engine/panes.js";
import { CliUsageError, defineCommand } from "../command-contract/contract.js";
import { HoldReportSchema, PaneRefSchema } from "../command-contract/schemas.js";
import { serverBrowserRefusals } from "../command-contract/common.js";

const usage =
	"browser needs a subcommand: panes, open, close, show, selection, viewport, or capture.";
const tokens = z.array(z.string()).default([]);
const stagedNoFlags = z.array(z.string()).transform((values, context) => {
	for (const token of values)
		if (token.startsWith("--")) {
			context.addIssue({ code: "custom", message: `Unknown flag ${token.split("=", 1)[0]}` });
			return z.NEVER;
		}
	return values;
});
const OnScreenPaneSchema = z.looseObject({
	paneId: z.string(),
	place: z.string(),
	board: z.string(),
});

export const PaneNamespaceInputSchema = z.object({ tokens });
export type PaneNamespaceInput = z.infer<typeof PaneNamespaceInputSchema>;
export const PaneNamespaceResultSchema = z.never();
export type PaneNamespaceResult = z.infer<typeof PaneNamespaceResultSchema>;
export const browserContract = defineCommand({
	path: ["browser"],
	summary: "Inspect or control the connected browser session",
	usage: "browser panes|open|close|show|selection|viewport|capture ...",
	description: "Routes live browser inspection and control commands; none writes a board note.",
	examples: ["archboard browser panes"],
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
export const PaneOpenResultSchema = z.looseObject({
	success: z.literal(true),
	pane: PaneRefSchema.nullable(),
	paneCount: z.number().int().nonnegative(),
	onScreen: z.array(OnScreenPaneSchema),
	held: HoldReportSchema.optional(),
});
export type PaneOpenResult = z.infer<typeof PaneOpenResultSchema>;
export const paneOpenContract = defineCommand({
	path: ["browser", "open"],
	summary: "Open a second browser pane",
	usage: "browser open",
	description: "Splits the connected browser canvas; the new pane inherits the displayed board.",
	examples: ["archboard browser open"],
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
		const result = await openPane();
		const place = result.pane?.place;
		const where = place ? paneWords(place) : "a new pane";
		const diagnostic = `Opened ${where}. It inherited the displayed board. Show another with \`browser show <board> --pane ${place ?? "<spec>"}\`.`;
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
				"browser close needs a pane: `browser close right`. Run `archboard browser panes` to inspect the session.",
		});
		return z.NEVER;
	}
	return { spec };
});
export type PaneCloseStage = z.infer<typeof PaneCloseStageSchema>;
export const PaneCloseResultSchema = z.looseObject({
	success: z.literal(true),
	closed: PaneRefSchema.extend({ board: z.string() }),
	paneCount: z.number().int().nonnegative(),
	onScreen: z.array(OnScreenPaneSchema),
	held: HoldReportSchema.optional(),
});
export type PaneCloseResult = z.infer<typeof PaneCloseResultSchema>;
export const paneCloseContract = defineCommand({
	path: ["browser", "close"],
	summary: "Close one browser pane",
	usage: "browser close <spec>",
	description: "Takes one board off screen without changing the board itself.",
	examples: ["archboard browser close right"],
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
