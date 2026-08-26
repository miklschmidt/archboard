import { z } from "zod";
import { getPanes, getSelection } from "../../runtime/engine/canvas-client.js";
import { defineCommand } from "../command-contract/contract.js";
import { HoldReportSchema } from "../command-contract/schemas.js";
import { commonRefusals, serverRefusal } from "../command-contract/common.js";

const inputSchema = z.object({
	text: z.boolean().default(false),
	tail: z.array(z.string()).default([]),
});
const parameters = [
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

export const SelectionInputSchema = inputSchema;
export type SelectionInput = z.infer<typeof SelectionInputSchema>;
export const SelectionJsonResultSchema = z.looseObject({
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
export type SelectionJsonResult = z.infer<typeof SelectionJsonResultSchema>;
export const SelectionResultSchema = z.union([SelectionJsonResultSchema, z.string()]);
export type SelectionResult = z.infer<typeof SelectionResultSchema>;

export const selectionContract = defineCommand({
	path: ["selection"],
	summary: "What a human currently has selected on the board",
	usage: "selection [--text]",
	description: "Reads the server-cached browser selection without retransmitting the scene.",
	examples: ["archboard selection --board system"],
	parameters,
	input: { ingress: SelectionInputSchema },
	result: SelectionResultSchema,
	output: outputs,
	prerequisites: ["server", "board"],
	effects: ["read"],
	refusals: commonRefusals,
	relationships: [
		{
			method: "GET",
			path: "/api/selection",
			cardinality: "one",
			description: "Read the current selection",
		},
	],
	async handler(input, context) {
		await context.require("server", "selection");
		const report = await getSelection();
		if (input.text) return { result: report.text };
		const { success: _success, text: _text, ...rest } = report;
		return { result: SelectionJsonResultSchema.parse(rest) };
	},
});

export const PanesInputSchema = inputSchema;
export type PanesInput = z.infer<typeof PanesInputSchema>;
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
export const PanesJsonResultSchema = z.looseObject({
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
	activeBoard: z.string(),
	held: HoldReportSchema.optional(),
});
export type PanesJsonResult = z.infer<typeof PanesJsonResultSchema>;
export const PanesResultSchema = z.union([PanesJsonResultSchema, z.string()]);
export type PanesResult = z.infer<typeof PanesResultSchema>;

export const panesContract = defineCommand({
	path: ["panes"],
	summary: "What the human is currently looking at — pane by pane",
	usage: "panes [--text]",
	description: "Reads pane layout and view state, including the valid no-pane state.",
	examples: ["archboard panes --board system"],
	parameters,
	input: { ingress: PanesInputSchema },
	result: PanesResultSchema,
	output: outputs,
	prerequisites: ["server"],
	effects: ["read"],
	refusals: [serverRefusal],
	relationships: [
		{ method: "GET", path: "/api/panes", cardinality: "one", description: "Read pane view state" },
	],
	async handler(input, context) {
		await context.require("server", "panes");
		const report = await getPanes();
		if (input.text) return { result: report.text };
		const { success: _success, text: _text, ...rest } = report;
		return { result: PanesJsonResultSchema.parse(rest) };
	},
});
