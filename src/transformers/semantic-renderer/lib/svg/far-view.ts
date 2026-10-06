// What a part draws from far away is a layer of its own: every card, container
// header and group caption carries a far layer, hidden until a viewer puts the
// far class on the picture, when the picture's stylesheet swaps it for the near
// one. A card's, and a container's header, which reads like a card from far
// away, are drawn by far-card.ts; a group's caption by regions.ts. This file
// holds the layers and the parts they share: the grown chip and the grown mark.
import { ICON_CHIP_SIZE } from "@/transformers/semantic-renderer/lib/design";
import { coord, type Box } from "@/transformers/semantic-renderer/lib/geometry";
import type { NodeAppearance } from "@/transformers/semantic-renderer/lib/semantic-appearance";
import type { Palette } from "@/transformers/semantic-renderer/lib/theme";
import { typeChip } from "@/transformers/semantic-renderer/lib/svg/appearance";
import {
	DRILL_MARK_RADIUS,
	DRILL_MARK_REACH,
	drillMark,
} from "@/transformers/semantic-renderer/lib/svg/drill-mark";
import { wrap } from "@/transformers/semantic-renderer/lib/svg/primitives";
import { BADGE_DEPTH } from "@/transformers/semantic-renderer/lib/svg/standing";

/** The part of a card drawn when the picture is seen near: its chip, name and responsibility. */
const NEAR_CLASS = "ab-near";
/** The part drawn when it is seen from far away. */
const FAR_CLASS = "ab-far";
/** The class a viewer puts on the picture while it is seen from far away. */
const FAR_VIEW_CLASS = "is-far";
/** The room a far mark keeps below the warning badge in its corner. */
const BADGE_GAP = 2;

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
 * A type chip grown to a side and stood where a far layer puts it.
 * @param box The box the place is relative to.
 * @param chip Where the chip stands in the box, and its side.
 * @param chip.x Its left edge.
 * @param chip.y Its top edge.
 * @param chip.size Its side.
 * @param look Its colour and glyph, and the selected theme.
 * @param look.appearance Its colour and glyph.
 * @param look.palette The selected theme.
 * @returns The chip.
 */
function farChip(
	box: Box,
	chip: { x: number; y: number; size: number },
	{ appearance, palette }: { appearance: NodeAppearance; palette: Palette },
): string {
	const scale = chip.size / ICON_CHIP_SIZE;
	return wrap(
		"g",
		{
			transform: `translate(${coord(box.x + chip.x)},${coord(box.y + chip.y)}) scale(${coord(scale)})`,
		},
		typeChip(0, 0, appearance, palette),
	);
}

/**
 * The mark of a part that opens another board, grown, in the corner it keeps
 * from near: its centre a radius and a half in from the top and the side.
 * The warning badge does not grow and stands in the same corner, so on an
 * unsettled part the mark stands lower, its ring starting {@link BADGE_GAP}
 * below the badge.
 * @param box The card's box, or a container's header.
 * @param scale How much larger than near it is drawn.
 * @param look Which way the board it opens lies, and the selected theme.
 * @param look.appearance Whether the part opens a board and which way.
 * @param look.palette The selected theme.
 * @param unsettled Whether the part wears the warning badge.
 * @returns The mark, or nothing for a part that opens none.
 */
function farMark(
	box: Box,
	scale: number,
	{ appearance, palette }: { appearance: NodeAppearance; palette: Palette },
	unsettled: boolean,
): string {
	if (appearance.drill === null) return "";
	const inset = DRILL_MARK_RADIUS * scale * 1.5;
	const down = unsettled ? BADGE_DEPTH + BADGE_GAP + DRILL_MARK_REACH * scale : inset;
	return drillMark(box.x + box.width - inset, box.y + down, appearance.drill, palette.glyph, scale);
}

export { FAR_CLASS, FAR_VIEW_CLASS, NEAR_CLASS, farChip, farLayer, farMark, nearLayer };
