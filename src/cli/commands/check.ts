import { z } from "zod";
import { CliUsageError, defineCommand } from "../command-contract/contract.js";
import { currentRequestedBoard } from "../../runtime/engine/canvas-client.js";
import { readRawBoardElementsForInspection } from "../../runtime/engine/board-io.js";
import {
	CheckResultSchema,
	formatInspectionText,
	inspectBoard,
	type InspectionPolicyInput,
} from "../../runtime/board-inspection/index.js";

export const CheckInputSchema = z.object({
	text: z.boolean().default(false),
	strict: z.boolean().default(false),
	fontFamilies: z.array(z.string()).default([]),
	dimensionTolerance: z.string().optional(),
	intersectionTolerance: z.string().optional(),
	overlapTolerance: z.string().optional(),
	tail: z.array(z.string()).default([]),
});
export type CheckInput = z.infer<typeof CheckInputSchema>;
export const CheckCommandResultSchema = z.union([CheckResultSchema, z.string()]);

const finiteNonnegative = (name: string, value: string | undefined): number | undefined => {
	if (value === undefined) return undefined;
	const parsed = Number(value);
	if (!Number.isFinite(parsed) || parsed < 0)
		throw new CliUsageError(`${name} takes a finite nonnegative number`);
	return parsed;
};

function policyOf(input: CheckInput): InspectionPolicyInput {
	let allowedFontFamilies: InspectionPolicyInput["allowedFontFamilies"];
	if (input.fontFamilies.includes("any")) {
		if (input.fontFamilies.length !== 1)
			throw new CliUsageError("--font-family any cannot be combined with a numeric family");
		allowedFontFamilies = "any";
	} else if (input.fontFamilies.length > 0) {
		const values = input.fontFamilies.map(Number);
		if (values.some((value) => !Number.isInteger(value) || ![1, 2, 3, 5, 6, 7, 8].includes(value)))
			throw new CliUsageError("--font-family takes any or one of 1, 2, 3, 5, 6, 7, 8");
		allowedFontFamilies = values as Array<1 | 2 | 3 | 5 | 6 | 7 | 8>;
	}
	return {
		...(allowedFontFamilies === undefined ? {} : { allowedFontFamilies }),
		...(input.dimensionTolerance === undefined
			? {}
			: {
					dimensionTolerance: finiteNonnegative("--dimension-tolerance", input.dimensionTolerance)!,
				}),
		...(input.intersectionTolerance === undefined
			? {}
			: {
					intersectionTolerance: finiteNonnegative(
						"--intersection-tolerance",
						input.intersectionTolerance,
					)!,
				}),
		...(input.overlapTolerance === undefined
			? {}
			: { overlapTolerance: finiteNonnegative("--overlap-tolerance", input.overlapTolerance)! }),
	};
}

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
		{
			kind: "option",
			key: "fontFamilies",
			spellings: ["--font-family"],
			value: "required",
			occurrences: "append",
			description: "Allowed persisted font family; repeat or pass any",
		},
		{
			kind: "option",
			key: "dimensionTolerance",
			spellings: ["--dimension-tolerance"],
			value: "required",
			description: "Stale linear dimension tolerance in pixels",
		},
		{
			kind: "option",
			key: "intersectionTolerance",
			spellings: ["--intersection-tolerance"],
			value: "required",
			description: "Connector endpoint/contact tolerance in pixels",
		},
		{
			kind: "option",
			key: "overlapTolerance",
			spellings: ["--overlap-tolerance"],
			value: "required",
			description: "Penetration and overlap tolerance in pixels",
		},
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
		const board = currentRequestedBoard();
		if (!board) throw new CliUsageError("check requires --board <key>");
		const report = inspectBoard(readRawBoardElementsForInspection(board), policyOf(input));
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
