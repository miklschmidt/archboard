import { z } from "zod";
import { CliUsageError, defineCommand } from "@/cli/command-contract/contract";
import { currentRequestedBoard } from "@/runtime/engine/canvas-client";
import { readRawBoardElementsForInspection } from "@/runtime/engine/board-io";
import {
	CheckResultSchema,
	formatInspectionText,
	inspectBoard,
} from "@/runtime/board-inspection/index";
import {
	InspectionOptionsInputSchema,
	inspectionOptionParameters,
	inspectionPolicyOf,
} from "@/cli/inspection-policy/index";

const CheckInputSchema = InspectionOptionsInputSchema.extend({
	text: z.boolean().default(false),
	strict: z.boolean().default(false),
	tail: z.array(z.string()).default([]),
});
type CheckInput = z.infer<typeof CheckInputSchema>;
const CheckCommandResultSchema = z.union([CheckResultSchema, z.string()]);
type CheckResult = z.infer<typeof CheckResultSchema>;

/**
 * Picks the strict-mode outcome for a completed inspection. Indeterminate coverage wins over any
 * severity because a report that may have missed findings cannot vouch for a clean board.
 * @param result - The parsed inspection report.
 * @returns The outcome id that maps to a nonzero strict exit, or undefined when the board is clean.
 */
function strictOutcome(result: CheckResult): "indeterminate" | "errors" | "warnings" | undefined {
	if (result.coverage === "indeterminate") return "indeterminate";
	if (result.counts.bySeverity.error > 0) return "errors";
	if (result.counts.bySeverity.warning > 0) return "warnings";
	return undefined;
}

const checkContract = defineCommand({
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
				description: "Schema-v3 inspection report",
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
		/**
		 * Chooses the text case when --text was passed and the JSON report otherwise.
		 * @param input - The parsed check input.
		 * @returns The output case id.
		 */
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
	/**
	 * Inspects the named note directly from disk and reports findings; under --strict the
	 * outcome id carries the exit code.
	 * @param input - The parsed check input.
	 * @returns The report (or its text rendering) and the strict outcome when one applies.
	 */
	async handler(input) {
		if (input.tail.length > 0) {
			throw new CliUsageError("check takes no positional arguments");
		}
		const policy = inspectionPolicyOf(input);
		const board = currentRequestedBoard();
		if (!board) {
			throw new CliUsageError("check requires --board <key>");
		}
		const report = inspectBoard(readRawBoardElementsForInspection(board), policy);
		const result = CheckResultSchema.parse({ board, ...report });
		const outcome = input.strict ? strictOutcome(result) : undefined;
		return {
			result: input.text ? formatInspectionText(result) : result,
			...(outcome ? { outcome } : {}),
		};
	},
});

export { CheckInputSchema, type CheckInput, CheckCommandResultSchema, checkContract };
