import { z } from "zod";
import { compareBoardsOnCanvas } from "../../runtime/engine/canvas-client.js";
import type { CompareResult as RuntimeCompareResult } from "../../runtime/engine/compare.js";
import { CliUsageError, defineCommand } from "../command-contract/contract.js";
import { HoldReportSchema, type HoldReport } from "../command-contract/schemas.js";

export const CompareInputSchema = z.object({
	fromOption: z.string().optional(),
	toOption: z.string().optional(),
	from: z.string().optional(),
	to: z.string().optional(),
	tail: z.array(z.string()).default([]),
});
export type CompareInput = z.infer<typeof CompareInputSchema>;
const CompareResultValidator = z.looseObject({
	success: z.literal(true),
	from: z.looseObject({}),
	to: z.looseObject({}),
	summary: z.looseObject({}),
	held: HoldReportSchema.optional(),
});
export type CompareResult = RuntimeCompareResult & { held?: HoldReport };
export const CompareResultSchema = z.custom<CompareResult>(
	(value) => CompareResultValidator.safeParse(value).success,
);

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
			result: await compareBoardsOnCanvas({ from, ...(to ? { to } : {}) }),
		};
	},
});
