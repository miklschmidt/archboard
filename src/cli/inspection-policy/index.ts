import { z } from "zod";

import type { TokenParameter } from "@/cli/command-contract/contract";
import { CliUsageError } from "@/cli/command-contract/contract";
import type { InspectionPolicyInput } from "@/runtime/board-inspection/index";

const InspectionOptionsInputSchema = z.object({
	fontFamilies: z.array(z.string()).default([]),
	dimensionTolerance: z.string().optional(),
	intersectionTolerance: z.string().optional(),
	overlapTolerance: z.string().optional(),
});
type InspectionOptionsInput = z.infer<typeof InspectionOptionsInputSchema>;

const inspectionOptionParameters: readonly TokenParameter[] = [
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

/**
 * Reads a tolerance flag, which is a distance in pixels and so may be neither
 * negative nor infinite.
 * @param name - The flag's name, for the refusal message.
 * @param value - The value as the person wrote it, if they wrote one.
 * @returns The number, or undefined when the flag was not given.
 * @throws {CliUsageError} When the value is not a finite nonnegative number.
 */
const finiteNonnegative = (name: string, value: string | undefined): number | undefined => {
	if (value === undefined) {
		return undefined;
	}
	const parsed = Number(value);
	if (!Number.isFinite(parsed) || parsed < 0) {
		throw new CliUsageError(`${name} takes a finite nonnegative number`);
	}
	return parsed;
};

/** The Excalidraw font families an inspection may be told to allow. */
const fontFamilySchema = z.union([
	z.literal(1),
	z.literal(2),
	z.literal(3),
	z.literal(5),
	z.literal(6),
	z.literal(7),
	z.literal(8),
]);
const fontFamilyListSchema = z.array(fontFamilySchema);

/**
 * Reads the `--font-family` flags into the policy's allowed families: `any`,
 * which cannot be combined with a specific family, or the numeric families
 * Excalidraw defines.
 * @param fontFamilies - The values given for `--font-family`.
 * @returns The allowed families, or undefined when none were named.
 * @throws {CliUsageError} When `any` is combined with a family, or a value is not a known family.
 */
function allowedFontFamiliesOf(
	fontFamilies: readonly string[],
): InspectionPolicyInput["allowedFontFamilies"] {
	if (fontFamilies.includes("any")) {
		if (fontFamilies.length !== 1) {
			throw new CliUsageError("--font-family any cannot be combined with a numeric family");
		}
		return "any";
	}
	if (fontFamilies.length === 0) {
		return undefined;
	}
	const families = fontFamilyListSchema.safeParse(fontFamilies.map(Number));
	if (!families.success) {
		throw new CliUsageError("--font-family takes any or one of 1, 2, 3, 5, 6, 7, 8");
	}
	return families.data;
}

/**
 * Turns the inspection flags into the policy the inspection runs under, so the
 * `check` and `render findings` commands read those flags exactly alike.
 * @param input - The parsed inspection options.
 * @returns The policy, carrying only what the person actually asked to change.
 * @throws {CliUsageError} When a flag's value is not one the policy accepts.
 */
function inspectionPolicyOf(input: InspectionOptionsInput): InspectionPolicyInput {
	const allowedFontFamilies = allowedFontFamiliesOf(input.fontFamilies);
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

export {
	InspectionOptionsInputSchema,
	type InspectionOptionsInput,
	inspectionOptionParameters,
	inspectionPolicyOf,
};
