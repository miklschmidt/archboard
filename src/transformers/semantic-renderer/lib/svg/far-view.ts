// A card seen from far away is its name: every card carries a far layer, its
// name grown and its chip grown to match, hidden until a viewer puts the far
// class on the picture, when the picture's stylesheet swaps it for the near one.
import { ICON_CHIP_SIZE } from "@/transformers/semantic-renderer/lib/design";
import { coord, type Box } from "@/transformers/semantic-renderer/lib/geometry";
import { measureFarTitle } from "@/transformers/semantic-renderer/lib/measurement";
import type { NodeAppearance } from "@/transformers/semantic-renderer/lib/semantic-appearance";
import type { Palette } from "@/transformers/semantic-renderer/lib/theme";
import { typeChip } from "@/transformers/semantic-renderer/lib/svg/appearance";
import { wrap } from "@/transformers/semantic-renderer/lib/svg/primitives";
import { paintTextRuns } from "@/transformers/semantic-renderer/lib/svg/text-runs";

/** The part of a card drawn when the picture is seen near: its chip, name and responsibility. */
const NEAR_CLASS = "ab-near";
/** The part drawn when it is seen from far away: its name and chip, grown to fill it. */
const FAR_CLASS = "ab-far";
/** The class a viewer puts on the picture while it is seen from far away. */
const FAR_VIEW_CLASS = "is-far";

/**
 * What a card draws when the picture is seen near: its chip, name and responsibility.
 * @param markup Their markup.
 * @returns The near layer.
 */
function nearLayer(markup: string): string {
	return wrap("g", { class: NEAR_CLASS }, markup);
}

/**
 * A card's name and chip as they are drawn from far away, hidden until a
 * viewer says the picture is far: the name grown, the chip grown to match,
 * the responsibility left out.
 * @param name The card's name.
 * @param box The card's box.
 * @param size The name's size.
 * @param look Its type chip's colour and glyph, and the selected theme.
 * @param look.appearance Its type chip's colour and glyph.
 * @param look.palette The selected theme.
 * @returns The far layer.
 */
function paintFarTitle(
	name: string,
	box: Box,
	size: number,
	{ appearance, palette }: { appearance: NodeAppearance; palette: Palette },
): string {
	const far = measureFarTitle(name, box, size);
	const scale = far.chip.size / ICON_CHIP_SIZE;
	// Hidden by its own attribute, so a reader of the picture that ignores its
	// stylesheet draws the card as it is seen near.
	return wrap(
		"g",
		{ class: FAR_CLASS, display: "none" },
		wrap(
			"g",
			{
				transform: `translate(${coord(box.x + far.chip.x)},${coord(box.y + far.chip.y)}) scale(${coord(scale)})`,
			},
			typeChip(0, 0, appearance, palette),
		) + paintTextRuns(far.runs, box, palette),
	);
}

export { FAR_CLASS, FAR_VIEW_CLASS, NEAR_CLASS, nearLayer, paintFarTitle };
