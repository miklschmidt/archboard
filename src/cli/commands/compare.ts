import { z } from "zod";
import { compareBoardsOnCanvas } from "../../runtime/engine/canvas-client.js";
import { CliUsageError, defineCommand } from "../command-contract/contract.js";
import { BoardAddressSchema, HoldReportSchema } from "../command-contract/schemas.js";

export const CompareInputSchema = z.object({
	fromOption: z.string().optional(),
	toOption: z.string().optional(),
	from: z.string().optional(),
	to: z.string().optional(),
	tail: z.array(z.string()).default([]),
});
export type CompareInput = z.infer<typeof CompareInputSchema>;
const CompareSideSchema = z.looseObject({
	board: z.string(),
	identity: BoardAddressSchema,
	source: z.enum(["memory", "vault"]),
	elementCount: z.number().int().nonnegative(),
	nodeCount: z.number().int().nonnegative(),
	edgeCount: z.number().int().nonnegative(),
	plainCount: z.number().int().nonnegative(),
});
export const CompareResultSchema = z.looseObject({
	success: z.literal(true),
	from: CompareSideSchema,
	to: CompareSideSchema,
	summary: z.object({
		comparable: z.boolean(),
		identical: z.boolean(),
		sharedNodes: z.number().int().nonnegative(),
		nodesAdded: z.number().int().nonnegative(),
		nodesRemoved: z.number().int().nonnegative(),
		nodesChanged: z.number().int().nonnegative(),
		nodesUnchanged: z.number().int().nonnegative(),
		nodesMovedOnly: z.number().int().nonnegative(),
		edgesAdded: z.number().int().nonnegative(),
		edgesRemoved: z.number().int().nonnegative(),
		edgesChanged: z.number().int().nonnegative(),
		edgesUnchanged: z.number().int().nonnegative(),
		layoutSignalsChanged: z.number().int().nonnegative(),
	}),
	nodes: z.object({
		added: z.array(z.looseObject({ node: z.string(), name: z.string() })),
		removed: z.array(z.looseObject({ node: z.string(), name: z.string() })),
		changed: z.array(z.looseObject({ node: z.string(), name: z.string() })),
		unchanged: z.array(z.looseObject({ node: z.string(), name: z.string() })),
	}),
	edges: z.looseObject({
		added: z.array(z.looseObject({ from: z.string(), to: z.string() })),
		removed: z.array(z.looseObject({ from: z.string(), to: z.string() })),
		changed: z.array(z.looseObject({ from: z.string(), to: z.string() })),
		unchanged: z.array(z.looseObject({ from: z.string(), to: z.string() })),
	}),
	layout: z.looseObject({
		method: z.record(z.string(), z.string()),
		cannotExpress: z.array(z.string()),
	}),
	warnings: z.array(z.string()),
	held: HoldReportSchema.optional(),
});
export type CompareResult = z.infer<typeof CompareResultSchema>;

export const compareContract = defineCommand({
	path: ["compare"],
	summary: "Structured semantic diff between two variants of a board",
	usage: "compare <from> [to]",
	description: "Returns the complete semantic comparison without opening either board.",
	examples: ["archboard compare payments payments@option-a"],
	parameters: [
		{
			kind: "option",
			key: "fromOption",
			spellings: ["--from"],
			value: "required",
			description: "From board",
		},
		{
			kind: "option",
			key: "toOption",
			spellings: ["--to"],
			value: "required",
			description: "To board",
		},
		{ kind: "positional", key: "from", name: "from", description: "From board" },
		{ kind: "positional", key: "to", name: "to", description: "To board" },
		{
			kind: "positional",
			key: "tail",
			name: "extra",
			repeatable: true,
			description: "Unexpected extra board arguments",
		},
	],
	input: { ingress: CompareInputSchema },
	result: CompareResultSchema,
	output: {
		cases: [
			{
				id: "json",
				when: {},
				mode: "json",
				held: "object-field-and-stderr-note",
				description: "Complete comparison",
				presentation: ["result", "held-note"],
			},
		],
		select: () => "json",
	},
	prerequisites: ["server"],
	effects: ["read"],
	refusals: [
		{
			code: "CANVAS_UNREACHABLE",
			exit: 3,
			stream: "stderr",
			description: "The canvas could not be reached.",
		},
	],
	relationships: [
		{
			method: "GET",
			path: "/api/boards/compare",
			cardinality: "one",
			description: "Read the semantic comparison",
		},
	],
	async handler(input, context) {
		const from = input.fromOption ?? input.from;
		const to = input.toOption ?? input.to;
		if (!from)
			throw new CliUsageError("compare needs a board: `compare payments payments@option-a`");
		if (input.tail.length)
			throw new CliUsageError("compare takes two boards; pass them one at a time");
		await context.require("server", "compare");
		return {
			result: CompareResultSchema.parse(
				await compareBoardsOnCanvas({ from, ...(to ? { to } : {}) }),
			),
		};
	},
});
