// What both drawing commands declare for what a picture carries beside its
// drawing: the title above it and the key under or beside it (TASK-467,
// TASK-468), with how each option is read and refused. A picture draws its key
// unless it is asked for none (ADR 0057).

import { z } from "zod";
import { LegendLayoutSchema, type LegendLayout } from "@archboard/board/render-reply";

/**
 * The key a drawn picture carries when the command names no layout for it: a
 * picture that marks a comparison says what its marks mean.
 */
const DEFAULT_LEGEND: LegendLayout = "horizontal";

/** The options both drawing commands declare for the legend, and how they are read. */
const LEGEND_OPTIONS = [
	{
		kind: "option",
		key: "legend",
		spellings: ["--legend"],
		value: "required",
		placeholder: "layout",
		choices: LegendLayoutSchema.options,
		default: DEFAULT_LEGEND,
		description:
			"How the key that the picture draws is laid out: a row under it (horizontal) or a column beside it (vertical)",
	},
	{
		kind: "option",
		key: "noLegend",
		spellings: ["--no-legend"],
		value: "none",
		description: "Draw no key",
	},
	{
		kind: "option",
		key: "legendOnly",
		spellings: ["--legend-only"],
		value: "none",
		description: "Draw the key by itself, without the picture, in the layout --legend names",
	},
] as const;
const LegendInputSchema = {
	legend: LegendLayoutSchema.optional(),
	noLegend: z.boolean().default(false),
	legendOnly: z.boolean().default(false),
};

/**
 * Whether a drawing's input asks for no key and for one at once.
 * @param input The parsed input.
 * @param input.legend How the legend is laid out, when it was named.
 * @param input.noLegend Whether no legend is drawn.
 * @param input.legendOnly Whether the legend is drawn alone.
 * @returns True when it may be drawn.
 */
function legendStated(input: {
	legend?: unknown;
	noLegend: boolean;
	legendOnly: boolean;
}): boolean {
	return !input.noLegend || (input.legend === undefined && !input.legendOnly);
}
const NO_LEGEND_REFUSAL = {
	message: "--no-legend draws no key, so it cannot be combined with --legend or --legend-only.",
	path: ["noLegend"],
};

/**
 * The legend a drawing command draws.
 * @param input The parsed input.
 * @param input.legend How the legend is laid out, when it was named.
 * @param input.noLegend Whether no legend is drawn.
 * @returns Its layout, or undefined for none.
 */
function drawnLegend(input: {
	legend?: LegendLayout | undefined;
	noLegend: boolean;
}): LegendLayout | undefined {
	return input.noLegend ? undefined : (input.legend ?? DEFAULT_LEGEND);
}

/**
 * What `--title` takes: words of its own, or nothing for the names of what is
 * drawn. Blank words are refused here, as the render route refuses them.
 */
const TitleOptionSchema = z
	.union([z.string().regex(/\S/u, "A title needs words"), z.literal(true)])
	.optional();

/** The `--title` option both drawing commands declare. */
const TITLE_OPTION = {
	kind: "option",
	key: "title",
	spellings: ["--title"],
	value: "optional",
	placeholder: "text",
	description:
		"Draw a title above the picture: this text, or without text the board's, view's and variant's names",
} as const;

export {
	drawnLegend,
	LEGEND_OPTIONS,
	LegendInputSchema,
	legendStated,
	NO_LEGEND_REFUSAL,
	TITLE_OPTION,
	TitleOptionSchema,
};
