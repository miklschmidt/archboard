import { z } from "zod";
import { getPanes, getSelection } from "../../runtime/engine/canvas-client.js";
import { defineCommand } from "../command-contract/contract.js";
import { HoldReportSchema } from "../command-contract/schemas.js";
import { serverBrowserRefusals, serverRefusal } from "../command-contract/common.js";

const reportInputSchema = z.object({
	text: z.boolean().default(false),
	tail: z.array(z.string()).default([]),
});
const inputSchema = reportInputSchema.extend({ pane: z.string().min(1, "--pane is required") });
const parameters = [
	{
		kind: "option" as const,
		key: "pane",
		spellings: ["--pane"] as const,
		value: "required" as const,
		description: "Live pane selector",
	},
	{
		kind: "option" as const,
		key: "text",
		spellings: ["--text"] as const,
		value: "none" as const,
		description: "Print the human-readable report",
	},
	{
		kind: "positional" as const,
		key: "tail",
		name: "ignored",
		repeatable: true,
		route: "pass-through" as const,
		description: "Legacy ignored positional content",
	},
];
const outputs = {
	cases: [
		{
			id: "json",
			when: { key: "text", present: false },
			mode: "json" as const,
			held: "object-field-and-stderr-note" as const,
			description: "Structured view state",
			presentation: ["result", "held-note"] as const,
		},
		{
			id: "text",
			when: { key: "text", present: true },
			mode: "text" as const,
			held: "none" as const,
			description: "Human-readable view state",
			presentation: ["result"] as const,
		},
	] as const,
	select: (input: { text: boolean }) => (input.text ? "text" : "json"),
};

const SelectionInputSchema = inputSchema;
type SelectionInput = z.infer<typeof SelectionInputSchema>;
const SelectionJsonResultSchema = z.looseObject({
	board: z.string(),
	elementIds: z.array(z.string()),
	count: z.number().int().nonnegative(),
	nodeCount: z.number().int().nonnegative(),
	elements: z.array(z.looseObject({ id: z.string() })),
	missingIds: z.array(z.string()),
	clientId: z.string().nullable(),
	at: z.string().nullable(),
	browserClients: z.number().int().nonnegative(),
	summary: z.string(),
	held: HoldReportSchema.optional(),
});
type SelectionJsonResult = z.infer<typeof SelectionJsonResultSchema>;
const SelectionResultSchema = z.union([SelectionJsonResultSchema, z.string()]);
type SelectionResult = z.infer<typeof SelectionResultSchema>;

const selectionContract = defineCommand({
	path: ["browser", "selection"],
	summary: "What a human currently has selected on the board",
	usage: "browser selection --pane <spec> [--text]",
	description: "Reads stable element ids from one connected browser pane without changing it.",
	examples: ["archboard browser selection --pane left"],
	parameters,
	input: { ingress: SelectionInputSchema },
	result: SelectionResultSchema,
	output: outputs,
	prerequisites: ["server", "browser"],
	effects: ["browser"],
	refusals: serverBrowserRefusals,
	relationships: [
		{
			method: "GET",
			path: "/api/selection",
			cardinality: "one",
			description: "Read the current selection",
		},
	],
	async handler(input, context) {
		await context.require("server", "browser selection");
		await context.require("browser", "browser selection");
		const report = await getSelection(input.pane);
		if (input.text) {
			return { result: report.text };
		}
		const { success: _success, text: _text, ...rest } = report;
		return { result: SelectionJsonResultSchema.parse(rest) };
	},
});

const PanesInputSchema = reportInputSchema;
type PanesInput = z.infer<typeof PanesInputSchema>;
const RectSchema = z.object({
	x: z.number(),
	y: z.number(),
	width: z.number(),
	height: z.number(),
});
const PaneSelectionSchema = z.object({
	count: z.number().int().nonnegative(),
	elementIds: z.array(z.string()),
	moreIds: z.number().int().nonnegative(),
	nodeCount: z.number().int().nonnegative(),
	names: z.array(z.string()),
	summary: z.string(),
	at: z.string().nullable(),
});
const PanesJsonResultSchema = z.looseObject({
	paneCount: z.number().int().nonnegative(),
	arrangement: z.enum(["none", "single", "side-by-side", "stacked", "grid", "overlapping"]),
	focused: z.string().nullable(),
	sameBoard: z.boolean(),
	panes: z.array(
		z.looseObject({
			paneId: z.string(),
			clientId: z.string(),
			position: z.number().int().positive(),
			place: z.string(),
			focused: z.boolean(),
			primary: z.boolean(),
			board: z.string(),
			identity: z.looseObject({ board: z.string(), variant: z.string() }),
			elementCount: z.number().int().nonnegative(),
			viewport: RectSchema.extend({ zoom: z.number() }),
			rect: RectSchema,
			selection: PaneSelectionSchema,
			at: z.string(),
		}),
	),
	summary: z.string(),
	held: HoldReportSchema.optional(),
});
type PanesJsonResult = z.infer<typeof PanesJsonResultSchema>;
const PanesResultSchema = z.union([PanesJsonResultSchema, z.string()]);
type PanesResult = z.infer<typeof PanesResultSchema>;

const panesContract = defineCommand({
	path: ["browser", "panes"],
	summary: "What the human is currently looking at — pane by pane",
	usage: "browser panes [--text]",
	description: "Reads pane layout and view state, including the valid no-pane state.",
	examples: ["archboard browser panes"],
	parameters: parameters.filter((parameter) => parameter.key !== "pane"),
	input: { ingress: PanesInputSchema },
	result: PanesResultSchema,
	output: outputs,
	prerequisites: ["server"],
	effects: ["browser"],
	refusals: [serverRefusal],
	relationships: [
		{ method: "GET", path: "/api/panes", cardinality: "one", description: "Read pane view state" },
	],
	async handler(input, context) {
		await context.require("server", "panes");
		const report = await getPanes();
		if (input.text) {
			return { result: report.text };
		}
		const { success: _success, text: _text, activeBoard: _activeBoard, ...rest } = report;
		return { result: PanesJsonResultSchema.parse(rest) };
	},
});

export {
	SelectionInputSchema,
	type SelectionInput,
	SelectionJsonResultSchema,
	type SelectionJsonResult,
	SelectionResultSchema,
	type SelectionResult,
	selectionContract,
	PanesInputSchema,
	type PanesInput,
	PanesJsonResultSchema,
	type PanesJsonResult,
	PanesResultSchema,
	type PanesResult,
	panesContract,
};
