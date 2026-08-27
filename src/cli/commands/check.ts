import { z } from "zod";
import { CliUsageError, defineCommand } from "../command-contract/contract.js";
import { currentRequestedBoard } from "../../runtime/engine/canvas-client.js";
import { readRawBoardElementsForInspection } from "../../runtime/engine/board-io.js";
import {
	CheckResultSchema,
	formatInspectionText,
	inspectBoard,
} from "../../runtime/board-inspection/index.js";
import {
	InspectionOptionsInputSchema,
	inspectionOptionParameters,
	inspectionPolicyOf,
} from "../inspection-policy/index.js";

export const CheckInputSchema = InspectionOptionsInputSchema.extend({
	text: z.boolean().default(false),
	strict: z.boolean().default(false),
	tail: z.array(z.string()).default([]),
});
export type CheckInput = z.infer<typeof CheckInputSchema>;
export const CheckCommandResultSchema = z.union([CheckResultSchema, z.string()]);

export const checkContract = defineCommand({
	path: ["check"],
	summary: "Inspect a persisted board for deterministic quality findings",
	usage: [
		"check --board <key> [--text] [--strict] [--font-family <family>]",
		"      [--dimension-tolerance <px>] [--intersection-tolerance <px>] [--overlap-tolerance <px>]",
		"",
		"  Strict exits: 0 complete and clean; 6 complete with warnings only;",
		"                7 complete with errors; 8 indeterminate coverage (takes precedence).",
	].join("\n"),
	description:
		"Reads the named note directly and reports whole-board findings without starting the canvas or changing the vault.",
	examples: [
		"archboard check --board payments",
		"archboard check --board payments --text --strict",
		"archboard check --board payments --font-family 5 --overlap-tolerance 0.5",
	],
	parameters: [
		{
			kind: "option",
			key: "text",
			spellings: ["--text"],
			value: "none",
			description: "Print concise deterministic text",
		},
		{
			kind: "option",
			key: "strict",
			spellings: ["--strict"],
			value: "none",
			description: "Exit nonzero for findings or indeterminate coverage",
		},
		...inspectionOptionParameters,
		{
			kind: "positional",
			key: "tail",
			name: "extra",
			repeatable: true,
			description: "Unexpected positional arguments",
		},
	],
	input: { ingress: CheckInputSchema },
	result: CheckCommandResultSchema,
	output: {
		cases: [
			{
				id: "json",
				when: { key: "text", present: false },
				mode: "json",
				held: "none",
				description: "Schema-v1 inspection report",
				presentation: ["result"],
			},
			{
				id: "text",
				when: { key: "text", present: true },
				mode: "text",
				held: "none",
				description: "Concise deterministic inspection report",
				presentation: ["result"],
			},
		],
		select: (input) => (input.text ? "text" : "json"),
	},
	outcomes: [
		{
			id: "warnings",
			exit: 6,
			description: "Strict inspection completed with warnings only.",
			stream: "stdout-only",
			held: "none",
			presentation: ["result"],
		},
		{
			id: "errors",
			exit: 7,
			description: "Strict inspection completed with at least one error.",
			stream: "stdout-only",
			held: "none",
			presentation: ["result"],
		},
		{
			id: "indeterminate",
			exit: 8,
			description:
				"Strict inspection coverage is indeterminate; this takes precedence over severity.",
			stream: "stdout-only",
			held: "none",
			presentation: ["result"],
		},
	],
	prerequisites: ["board"],
	effects: ["local-read"],
	refusals: [],
	relationships: [],
	async handler(input) {
		if (input.tail.length > 0) throw new CliUsageError("check takes no positional arguments");
		const policy = inspectionPolicyOf(input);
		const board = currentRequestedBoard();
		if (!board) throw new CliUsageError("check requires --board <key>");
		const report = inspectBoard(readRawBoardElementsForInspection(board), policy);
		const result = CheckResultSchema.parse({ board, ...report });
		const outcome = !input.strict
			? undefined
			: result.coverage === "indeterminate"
				? "indeterminate"
				: result.counts.bySeverity.error > 0
					? "errors"
					: result.counts.bySeverity.warning > 0
						? "warnings"
						: undefined;
		return {
			result: input.text ? formatInspectionText(result) : result,
			...(outcome ? { outcome } : {}),
		};
	},
});
