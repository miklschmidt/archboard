// A card seen from far away is its name: every card carries a far layer, its
// name grown and its chip grown to match, hidden until a viewer puts the far
// class on the picture, when the picture's stylesheet swaps it for the near one.
import { ICON_CHIP_SIZE } from "@/transformers/semantic-renderer/lib/design";
import { coord, type Box } from "@/transformers/semantic-renderer/lib/geometry";
import { measureFarTitle } from "@/transformers/semantic-renderer/lib/measurement";
import type { NodeAppearance } from "@/transformers/semantic-renderer/lib/semantic-appearance";
import type { Palette } from "@/transformers/semantic-renderer/lib/theme";
import { typeChip } from "@/transformers/semantic-renderer/lib/svg/appearance";
import { DRILL_MARK_RADIUS, drillMark } from "@/transformers/semantic-renderer/lib/svg/drill-mark";
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
 * What a card or a caption draws only when the picture is seen from far
 * away. It is hidden by its own attribute, so a reader of the picture that
 * ignores its stylesheet draws it as it is seen near.
 * @param markup Its markup.
 * @returns The far layer.
 */
function farLayer(markup: string): string {
	return wrap("g", { class: FAR_CLASS, display: "none" }, markup);
}

/**
 * A card's name and chip as they are drawn from far away, hidden until a
 * viewer says the picture is far: the name grown, the chip grown to match,
 * the responsibility left out.
 * @param name The card's name.
 * @param box The card's box, or a container's header.
 * @param place The name's size, and whether it stands centred or at the start.
 * @param place.size The name's size.
 * @param place.align Centred in the box, or at its start.
 * @param look Its type chip's colour and glyph, and the selected theme.
 * @param look.appearance Its type chip's colour and glyph.
 * @param look.palette The selected theme.
 * @returns The far layer.
 */
function paintFarTitle(
	name: string,
	box: Box,
	place: { size: number; align: "centre" | "start" },
	{ appearance, palette }: { appearance: NodeAppearance; palette: Palette },
): string {
	const far = measureFarTitle(name, box, place);
	const scale = far.chip.size / ICON_CHIP_SIZE;
	// The mark of a part that opens another board grows with the chip and keeps
	// its corner, as far in from the top and the side as it is wide over two.
	const reach = DRILL_MARK_RADIUS * scale;
	const mark =
		appearance.drill === null
			? ""
			: drillMark(
					box.x + box.width - reach * 1.5,
					box.y + reach * 1.5,
					appearance.drill,
					palette.glyph,
					scale,
				);
	return farLayer(
		wrap(
			"g",
			{
				transform: `translate(${coord(box.x + far.chip.x)},${coord(box.y + far.chip.y)}) scale(${coord(scale)})`,
			},
			typeChip(0, 0, appearance, palette),
		) +
			paintTextRuns(far.runs, box, palette) +
			mark,
	);
}

export { FAR_CLASS, FAR_VIEW_CLASS, NEAR_CLASS, farLayer, nearLayer, paintFarTitle };
