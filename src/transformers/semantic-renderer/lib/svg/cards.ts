// Cards and frame headings for the message-sequence grammar.
//
// Forked from PR Lens's `svg/architecture.ts`, minus its badge strip and its
// strike-through for a removed node. Two things were added: the selection halo
// every subject carries, and the `data-semantic-*` attributes that let a pane
// map a click back onto the board. A card is drawn as a slab (`lib/svg/slab.ts`).
// What a proposal's standing does to it — the wash or the ghost on its face and
// the pin on its corner — is decided in `lib/svg/slab.ts` and
// `lib/svg/standing.ts` and applied here without moving anything.
//
// Hierarchy here is built from weight, size, colour and space, in that order. A
// card's name is the medium face and its responsibility the regular one, which
// is a step a reader takes in before reading either. A flow's frame is a
// container's family: its name and summary are set on its nameplate in the
// medium and regular faces and at the sizes a container's nameplate uses, so
// a sequence's frame and an architecture's container read alike. What sets the
// frame's name apart from the cards under it is the nameplate it lies on.
//
// Both weights are real files (`lib/fonts.ts`). Nothing above 500 exists, and
// nothing here may ask for one: a browser would invent it, wider than what was
// measured, and a fitted title would overflow the card it was fitted to.

import { ARCHITECTURE_NOTE_GAP } from "@/transformers/semantic-renderer/config";
import {
	CARD_PADDING_X,
	ICON_CHIP_GAP,
	ICON_CHIP_SIZE,
	NOTE_SIZE,
	PART_NOTE,
	PART_TITLE,
	SLAB_RADIUS,
} from "@/transformers/semantic-renderer/lib/design";
import { coord, type Box } from "@/transformers/semantic-renderer/lib/geometry";
import { truncate } from "@/transformers/semantic-renderer/lib/text";
import { CARD_NOTE_FONT, CARD_TITLE_FONT } from "@/transformers/semantic-renderer/lib/fonts";
import type { Palette } from "@/transformers/semantic-renderer/lib/theme";
import {
	titleRoom,
	type SequenceCard,
} from "@/transformers/semantic-renderer/lib/layout/sequence-card";
import type { NodeAppearance } from "@/transformers/semantic-renderer/lib/semantic-appearance";
import {
	appearanceAttributes,
	cardLook,
	typeChip,
} from "@/transformers/semantic-renderer/lib/svg/appearance";
import { cornerDrillMark } from "@/transformers/semantic-renderer/lib/svg/drill-mark";
import { paintFarCard } from "@/transformers/semantic-renderer/lib/svg/far-card";
import { nearLayer } from "@/transformers/semantic-renderer/lib/svg/far-view";
import { lines, tag, textNode, wrap } from "@/transformers/semantic-renderer/lib/svg/primitives";
import {
	FOOTPRINT_WIDTH,
	slab,
	slabSeat,
	slabShadow,
} from "@/transformers/semantic-renderer/lib/svg/slab";
import {
	standingPalette,
	standingPin,
	subjectGroup,
	warningBadge,
	type SubjectStanding,
} from "@/transformers/semantic-renderer/lib/svg/standing";
import { stylesFor, type SvgStyles } from "@/transformers/semantic-renderer/lib/svg/styles";

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
 *
 * Round a removed part it is drawn over the dashed footprint the part left
 * (`slab.ts`), so a selected ghost wears one ring, not the selection's ring
 * round the standing's.
 * @param box What is being ringed.
 * @param radius The corner radius of the thing inside it.
 * @param styles The palette's attribute bundles.
 * @param standing How the part stands, when this is a proposal.
 * @returns The halo element.
 */
function halo(box: Box, radius: number, styles: SvgStyles, standing?: SubjectStanding): string {
	const inset = standing === "removed" ? -FOOTPRINT_WIDTH / 2 : HALO_INSET;
	return tag("rect", {
		class: "ab-halo",
		x: coord(box.x - inset),
		y: coord(box.y - inset),
		width: coord(box.width + inset * 2),
		height: coord(box.height + inset * 2),
		rx: coord(radius + inset),
		"stroke-width": HALO_WIDTH,
		...styles.halo,
	});
}

/**
 * One card: its name, the responsibility under it when there is one, the
 * glyph that says what sort of thing it is, and, when it opens another board,
 * the mark in its other top corner that says which way that board lies.
 * @param placed The card.
 * @param palette The theme's colours.
 * @param standing How this node stands against the variant it came from, when the caller said.
 * @param unsettled Whether the board says nobody has decided this node yet.
 * @param appearance Resolved containment and type channels.
 * @returns The card's group.
 */
function paintCard(
	placed: SequenceCard,
	palette: Palette,
	standing: SubjectStanding | undefined,
	unsettled: boolean,
	appearance: NodeAppearance,
): string {
	const styles = stylesFor(standingPalette(palette, standing));
	const { node, box, titleSize, notes } = placed;
	const textX = box.x + CARD_PADDING_X + ICON_CHIP_SIZE + ICON_CHIP_GAP;
	// A card that opens another board keeps its name clear of the mark.
	const room = titleRoom(node, box.width);
	const hasNote = notes.length > 0;
	const titleY = hasNote
		? box.y + TITLE_BASELINE_WITH_NOTE
		: box.y + box.height / 2 + titleSize * OPTICAL_CENTRE;

	const title = textNode(
		{
			x: coord(textX),
			y: coord(titleY),
			"font-size": titleSize,
			...styles.title,
		},
		truncate(node.name, CARD_TITLE_FONT, titleSize, room),
	);

	const note = lines(
		notes.map((run) =>
			textNode(
				{
					"xml:space": "preserve",
					x: coord(textX),
					y: coord(box.y + NOTE_BASELINE - NOTE_SIZE + run.y),
					...styles.note,
				},
				run.text,
			),
		),
	);

	return wrap(
		"g",
		{ ...subjectGroup("node", node.id, standing), ...appearanceAttributes(appearance) },
		lines([
			slabSeat(box, SLAB_RADIUS),
			slabShadow(box, SLAB_RADIUS, "card", palette, standing),
			halo(box, SLAB_RADIUS, styles, standing),
			slab(box, cardLook(appearance, palette), palette, standing),
			nearLayer(
				lines([
					typeChip(
						box.x + CARD_PADDING_X,
						box.y + (box.height - ICON_CHIP_SIZE) / 2,
						appearance,
						palette,
						standing,
					),
					title,
					note,
					appearance.drill === null
						? ""
						: cornerDrillMark(
								box,
								CARD_PADDING_X,
								titleY - titleSize * OPTICAL_CENTRE - box.y,
								appearance.drill,
								palette.glyph,
							),
				]),
			),
			paintFarCard(
				node,
				box,
				{ appearance, palette: standingPalette(palette, standing) },
				unsettled,
			),
			standingPin(box, standing, palette),
			// The opposite corner from the pin, inside the padding the words already
			// stop short of, so a card can say both at once and neither mark lands on
			// a letter.
			warningBadge(box, unsettled, palette),
		]),
	);
}

/**
 * A flow's title block, printed on its frame's nameplate: its name as a
 * container's is, and its summary under it in the secondary ink, each line
 * set where a container's measured lines are, a line's size below its top.
 * @param header Where the block goes.
 * @param name The flow's name.
 * @param responsibility Its summary, when it has one.
 * @param styles The palette's attribute bundles.
 * @returns The header's text.
 */
function paintHeader(
	header: Box,
	name: string,
	responsibility: string | undefined,
	styles: SvgStyles,
): string {
	const nameBaseline = header.y + PART_TITLE.size;
	const noteBaseline = header.y + PART_TITLE.line + ARCHITECTURE_NOTE_GAP + PART_NOTE.size;
	return lines([
		textNode(
			{ x: coord(header.x), y: coord(nameBaseline), ...styles.headerName },
			truncate(name, CARD_TITLE_FONT, PART_TITLE.size, header.width),
		),
		responsibility === undefined
			? ""
			: textNode(
					{ x: coord(header.x), y: coord(noteBaseline), ...styles.headerNote },
					truncate(responsibility, CARD_NOTE_FONT, PART_NOTE.size, header.width),
				),
	]);
}

export { halo, paintCard, paintHeader };
