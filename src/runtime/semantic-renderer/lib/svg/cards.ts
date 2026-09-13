// Cards and frame headings for the message-sequence grammar.
//
// Forked from PR Lens's `svg/architecture.ts`, minus its badge strip and its
// strike-through for a removed node. Two things were added: the selection halo
// every subject carries, and the `data-semantic-*` attributes that let a pane
// map a click back onto the board. What a proposal's standing does to either
// shape — the outline it takes over and the pin on its corner — is decided in
// `lib/svg/standing.ts` and applied here without moving anything.
//
// Hierarchy here is built from weight, size, colour, case, tracking and space,
// in that order. A card's name is the medium face and its responsibility the
// regular one, which is a step a reader takes in before reading either; a
// container's title is the medium face too, but small, tracked, uppercase and
// grey, so it reads as the label on a frame rather than as a name. The same
// title treatment is used at every depth: what says how deeply a box is nested
// is where it sits and how far it is set in, not a different kind of lettering.
//
// Both weights are real files (`lib/fonts.ts`). Nothing above 500 exists, and
// nothing here may ask for one: a browser would invent it, wider than what was
// measured, and a fitted title would overflow the card it was fitted to.

import {
	BASELINE_RATIO,
	CARD_PADDING_X,
	CARD_RADIUS,
	HEADER_NAME_SIZE,
	HEADER_NAME_TRACKING,
	HEADER_NOTE_SIZE,
	ICON_CHIP_GAP,
	ICON_CHIP_RADIUS,
	ICON_CHIP_SIZE,
	NOTE_SIZE,
	TEXT_LINE_HEIGHT,
} from "@/runtime/semantic-renderer/lib/design";
import { coord, type Box } from "@/runtime/semantic-renderer/lib/geometry";
import { truncate, truncateTracked } from "@/runtime/semantic-renderer/lib/text";
import {
	CARD_NOTE_FONT,
	CARD_TITLE_FONT,
	HEADER_NAME_FONT,
	HEADER_NOTE_FONT,
} from "@/runtime/semantic-renderer/lib/fonts";
import type { Palette } from "@/runtime/semantic-renderer/lib/theme";
import {
	cardTextWidth,
	type SequenceCard,
} from "@/runtime/semantic-renderer/lib/layout/sequence-card";
import { iconColour } from "@/runtime/semantic-renderer/lib/group-colour";
import { glyphGroup } from "@/runtime/semantic-renderer/lib/svg/icons";
import { lines, tag, textNode, wrap } from "@/runtime/semantic-renderer/lib/svg/primitives";
import {
	standingOutline,
	standingPin,
	subjectGroup,
	warningBadge,
	type SubjectStanding,
} from "@/runtime/semantic-renderer/lib/svg/standing";
import { stylesFor, type SvgStyles } from "@/runtime/semantic-renderer/lib/svg/styles";

/** How far outside its subject a selection ring sits. */
const HALO_INSET = 3;
const HALO_WIDTH = 2;

/** Where a card's name sits when it carries a responsibility under it. */
const TITLE_BASELINE_WITH_NOTE = 23;
const NOTE_BASELINE = 39;
/** How far below a baseline the same text's optical centre is. */
const OPTICAL_CENTRE = 0.34;

/**
 * The ring a viewer turns on to show what is selected. It is always in the
 * document and always invisible until a class says otherwise, which is what
 * keeps selection out of the geometry: turning it on moves nothing.
 * @param box What is being ringed.
 * @param radius The corner radius of the thing inside it.
 * @param styles The palette's attribute bundles.
 * @returns The halo element.
 */
function halo(box: Box, radius: number, styles: SvgStyles): string {
	return tag("rect", {
		class: "ab-halo",
		x: coord(box.x - HALO_INSET),
		y: coord(box.y - HALO_INSET),
		width: coord(box.width + HALO_INSET * 2),
		height: coord(box.height + HALO_INSET * 2),
		rx: coord(radius + HALO_INSET),
		"stroke-width": HALO_WIDTH,
		...styles.halo,
	});
}

/**
 * How much of the group's colour the chip's own ground is worth.
 *
 * A wash rather than a fill: the colour has to read at a glance from across a
 * page of cards, and a saturated tile behind a glyph makes the glyph the
 * quietest thing in it. The rule around it is one pixel, like every other rule
 * in the picture.
 */
const CHIP_WASH = 0.14;

/**
 * The kind chip and its glyph, at the left of a card.
 *
 * Three things carry the colour and nothing else does: the glyph, the hairline
 * around the tile it sits on, and that tile's wash. Not the card, not the card's
 * border, and not a line — a group is a family of parts, and a coloured card
 * border would compete with the one thing a border already says, which is how
 * the node stands against the variant it came from.
 * @param placed The card.
 * @param styles The palette's attribute bundles.
 * @param ink The colour this node's group is drawn in.
 * @returns The chip and glyph.
 */
function chipOf(placed: SequenceCard, styles: SvgStyles, ink: string): string {
	const { box, node } = placed;
	return (
		tag("rect", {
			x: coord(box.x + CARD_PADDING_X),
			y: coord(box.y + (box.height - ICON_CHIP_SIZE) / 2),
			width: ICON_CHIP_SIZE,
			height: ICON_CHIP_SIZE,
			rx: ICON_CHIP_RADIUS,
			fill: ink,
			"fill-opacity": CHIP_WASH,
			stroke: ink,
			"stroke-width": 1,
			"stroke-opacity": 0.45,
		}) +
		glyphGroup(
			node.kind,
			box.x + CARD_PADDING_X + ICON_CHIP_SIZE / 2,
			box.y + box.height / 2,
			styles,
			ink,
		)
	);
}

/**
 * One card: its name, the responsibility under it when there is one, and the
 * glyph that says what sort of thing it is.
 * @param placed The card.
 * @param palette The theme's colours.
 * @param standing How this node stands against the variant it came from, when the caller said.
 * @param unsettled Whether the board says nobody has decided this node yet.
 * @returns The card's group.
 */
function paintCard(
	placed: SequenceCard,
	palette: Palette,
	standing?: SubjectStanding,
	unsettled = false,
): string {
	const styles = stylesFor(palette);
	const { node, box, titleSize } = placed;
	const textX = box.x + CARD_PADDING_X + ICON_CHIP_SIZE + ICON_CHIP_GAP;
	const room = cardTextWidth(box.width);
	const hasNote = node.responsibility !== undefined;

	const title = textNode(
		{
			x: coord(textX),
			y: coord(
				hasNote
					? box.y + TITLE_BASELINE_WITH_NOTE
					: box.y + box.height / 2 + titleSize * OPTICAL_CENTRE,
			),
			"font-size": titleSize,
			...styles.title,
		},
		truncate(node.name, CARD_TITLE_FONT, titleSize, room),
	);

	const note =
		node.responsibility === undefined
			? ""
			: textNode(
					{ x: coord(textX), y: coord(box.y + NOTE_BASELINE), ...styles.note },
					truncate(node.responsibility, CARD_NOTE_FONT, NOTE_SIZE, room),
				);

	return wrap(
		"g",
		subjectGroup("node", node.id, standing),
		lines([
			halo(box, CARD_RADIUS, styles),
			tag("rect", {
				x: coord(box.x),
				y: coord(box.y),
				width: coord(box.width),
				height: coord(box.height),
				rx: CARD_RADIUS,
				...styles.card,
				...standingOutline(standing, palette),
			}),
			chipOf(placed, styles, iconColour(placed.node, palette.ground)),
			title,
			note,
			standingPin(box, standing, palette),
			// The opposite corner from the pin, inside the padding the words already
			// stop short of, so a card can say both at once and neither mark lands on
			// a letter.
			warningBadge(box, unsettled, palette),
		]),
	);
}

/**
 * A container's title block: its name in small tracked capitals, and its
 * responsibility under it in a quieter grey.
 *
 * Capitals and tracking are what a header uses instead of weight. They read as
 * a label rather than as a name, which is exactly the relationship a container
 * has to the things inside it — at any depth, because a box nested inside
 * another is still a frame around its contents and not a bigger card.
 * @param header Where the block goes.
 * @param name The container's name.
 * @param responsibility Its responsibility, when it has one.
 * @param styles The palette's attribute bundles.
 * @returns The header's text.
 */
function paintHeader(
	header: Box,
	name: string,
	responsibility: string | undefined,
	styles: SvgStyles,
): string {
	const nameBaseline = header.y + HEADER_NAME_SIZE * BASELINE_RATIO;
	const noteBaseline = nameBaseline + HEADER_NOTE_SIZE * TEXT_LINE_HEIGHT;
	return lines([
		// One hairline, the shell's own way of separating two things without a
		// rule of weight or a change of ground.
		tag("line", {
			x1: coord(header.x),
			y1: coord(header.y + header.height),
			x2: coord(header.x + header.width),
			y2: coord(header.y + header.height),
			...styles.headerRule,
		}),
		textNode(
			{ x: coord(header.x), y: coord(nameBaseline), ...styles.headerName },
			truncateTracked(
				name.toUpperCase(),
				HEADER_NAME_FONT,
				HEADER_NAME_SIZE,
				HEADER_NAME_TRACKING,
				header.width,
			),
		),
		responsibility === undefined
			? ""
			: textNode(
					{ x: coord(header.x), y: coord(noteBaseline), ...styles.headerNote },
					truncate(responsibility, HEADER_NOTE_FONT, HEADER_NOTE_SIZE, header.width),
				),
	]);
}

export { halo, paintCard, paintHeader };
