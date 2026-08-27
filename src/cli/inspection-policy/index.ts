import { z } from "zod";

import type { TokenParameter } from "../command-contract/contract.js";
import { CliUsageError } from "../command-contract/contract.js";
import type { InspectionPolicyInput } from "../../runtime/board-inspection/index.js";

export const InspectionOptionsInputSchema = z.object({
	fontFamilies: z.array(z.string()).default([]),
	dimensionTolerance: z.string().optional(),
	intersectionTolerance: z.string().optional(),
	overlapTolerance: z.string().optional(),
});
export type InspectionOptionsInput = z.infer<typeof InspectionOptionsInputSchema>;

export const inspectionOptionParameters: readonly TokenParameter[] = [
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
];

const finiteNonnegative = (name: string, value: string | undefined): number | undefined => {
	if (value === undefined) return undefined;
	const parsed = Number(value);
	if (!Number.isFinite(parsed) || parsed < 0)
		throw new CliUsageError(`${name} takes a finite nonnegative number`);
	return parsed;
};

export function inspectionPolicyOf(input: InspectionOptionsInput): InspectionPolicyInput {
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
