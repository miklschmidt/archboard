// What a part draws from far away is a layer of its own: every card, container
// header and group caption carries a far layer, hidden until a viewer puts the
// far class on the picture, when the picture's stylesheet swaps it for the near
// one. A card's, and a container's header, which reads like a card from far
// away, are drawn by far-card.ts; a group's caption by regions.ts. This file
// holds the layers and the parts they share: the shared chip, the words that
// move and the grown mark.
//
// A card's swap is a shared element transition (TASK-428). Its kind's chip is
// one element, outside both layers, drawn at its near place. The picture's
// stylesheet moves and scales it to its far place while the picture is far. The
// words of each layer stand in a group that the stylesheet moves to where the
// other layer's words stand while its own layer is hidden, so the words move
// and fade between the two places. A reader that ignores the stylesheet draws
// the chip and the words where they stand near.
import { ICON_CHIP_SIZE } from "@/transformers/semantic-renderer/lib/design";
import { coord, type Box } from "@/transformers/semantic-renderer/lib/geometry";
import type { NodeAppearance } from "@/transformers/semantic-renderer/lib/semantic-appearance";
import type { Palette } from "@/transformers/semantic-renderer/lib/theme";
import {
	DRILL_MARK_RADIUS,
	DRILL_MARK_REACH,
	drillMark,
} from "@/transformers/semantic-renderer/lib/svg/drill-mark";
import { wrap } from "@/transformers/semantic-renderer/lib/svg/primitives";
import { BADGE_DEPTH } from "@/transformers/semantic-renderer/lib/svg/standing";

/** The part of a card drawn when the picture is seen near: its name, responsibility and mark. */
const NEAR_CLASS = "ab-near";
/** The part drawn when it is seen from far away. */
const FAR_CLASS = "ab-far";
/** The class a viewer puts on the picture while it is seen from far away. */
const FAR_VIEW_CLASS = "is-far";
/** A card's kind's chip, one element that both views share. */
const CHIP_CLASS = "ab-chip";
/** A layer's words, which move to the other layer's place while their layer is hidden. */
const WORDS_CLASS = "ab-words";
/** The property that holds a chip's near place. */
const NEAR_PLACE = "--near";
/** The property that holds a chip's far place. */
const FAR_PLACE = "--far";
/** The property that holds where a layer's words stand while their layer is hidden. */
const AWAY_PLACE = "--away";
/** The room a far mark keeps below the warning badge in its corner. */
const BADGE_GAP = 2;

/** Where a chip stands: its top left corner and its side. */
interface ChipPlace {
	readonly x: number;
	readonly y: number;
	readonly size: number;
}

/** Where a block of words starts: the left end of its first baseline, and the size of its first line. */
interface Anchor {
	readonly x: number;
	readonly y: number;
	readonly size: number;
}

/**
 * A scale as the document writes it: to a ten thousandth. A move that depends
 * on a scale is worked out from the scale as written, so the rounding of the
 * scale does not move a word that stands far from the origin.
 * @param value The scale.
 * @returns The scale as written.
 */
function written(value: number): number {
	return Math.round(value * 10_000) / 10_000;
}

/**
 * A move and a scale about the origin, as an attribute or a stylesheet writes it.
 * @param move How far across and down.
 * @param move.x Across.
 * @param move.y Down.
 * @param scale How much larger, as written.
 * @param unit "px" for a stylesheet, which needs units on a length, or nothing for an attribute.
 * @returns The transform.
 */
function placed(move: { x: number; y: number }, scale: number, unit: "" | "px"): string {
	return `translate(${coord(move.x)}${unit},${coord(move.y)}${unit}) scale(${String(scale)})`;
}

/**
 * A card's kind's chip as one element that both views share. It is drawn at
 * its near place, by its own attribute as well, so an export with no far class
 * and a reader that ignores the stylesheet both draw it near. The stylesheet
 * moves and scales it to its far place while the picture is far.
 * @param chip The chip, drawn at the origin at its near size.
 * @param near Where it stands near.
 * @param far Where it stands from far away.
 * @returns The chip.
 */
function sharedChip(chip: string, near: ChipPlace, far: ChipPlace): string {
	const nearScale = written(near.size / ICON_CHIP_SIZE);
	const farScale = written(far.size / ICON_CHIP_SIZE);
	return wrap(
		"g",
		{
			class: CHIP_CLASS,
			transform: placed(near, nearScale, ""),
			style: `${NEAR_PLACE}:${placed(near, nearScale, "px")};${FAR_PLACE}:${placed(far, farScale, "px")}`,
		},
		chip,
	);
}

/**
 * A layer's words, which the stylesheet moves to where the other layer's words
 * start while their own layer is hidden: the anchor goes to the other anchor,
 * and the words grow or shrink by as much as the first line's size differs.
 * @param words The words, drawn where they stand.
 * @param home Where they start.
 * @param away Where the other layer's words start.
 * @returns The words.
 */
function movingWords(words: string, home: Anchor, away: Anchor): string {
	const scale = written(away.size / home.size);
	const move = { x: away.x - home.x * scale, y: away.y - home.y * scale };
	return wrap(
		"g",
		{ class: WORDS_CLASS, style: `${AWAY_PLACE}:${placed(move, scale, "px")}` },
		words,
	);
}

/**
 * What a part draws when the picture is seen near.
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

export {
	AWAY_PLACE,
	CHIP_CLASS,
	FAR_CLASS,
	FAR_PLACE,
	FAR_VIEW_CLASS,
	NEAR_CLASS,
	NEAR_PLACE,
	WORDS_CLASS,
	farLayer,
	farMark,
	movingWords,
	nearLayer,
	sharedChip,
	type Anchor,
	type ChipPlace,
};
