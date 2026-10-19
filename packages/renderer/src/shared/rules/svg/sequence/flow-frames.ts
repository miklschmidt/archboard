// The frames of a sequence: the one around each flow, with its name on a
// header slab and the shade its head of cards stands on when a viewer moves
// it, and the one around each decision and loop (ADR 0053).
//
// A decision's or loop's frame is drawn as UML draws a combined fragment: a
// thin outline around the messages it governs, an operator in a tab at its
// corner (`alt` or `loop`), the question or condition beside it, and for a
// decision each alternative's label at the start of its operand, the operands
// parted by dashed lines. The outline passes over the lifelines and under the
// messages, so every message still reads as one unbroken run.

import { BAND_RADIUS, CARD_THICKNESS, PILL_TEXT_SIZE } from "#shared/constants/design.ts";
import { paintHeadingViews } from "#shared/rules/svg/parts/far-card.ts";
import {
	FRAME_GUARD_HEIGHT,
	FRAME_HEAD_HEIGHT,
	FRAME_PAD,
	FRAME_TAB_PADDING,
	HEAD_REACH,
	HEAD_SHADE_CLASS,
} from "#shared/rules/layout/sequence/sequence-design.ts";
import { coord } from "#shared/rules/geometry.ts";
import { fontAttributes, PILL_FONT } from "#shared/rules/text/fonts.ts";
import type { Palette } from "#shared/rules/svg/page/theme.ts";
import type { FlowLayout } from "#shared/rules/layout/sequence/dataflow.ts";
import type { PlacedFrame } from "#shared/rules/layout/sequence/frames.ts";
import { trayLook } from "#shared/rules/svg/parts/appearance.ts";
import { halo, headerAnchor, paintHeader } from "#shared/rules/svg/sequence/cards.ts";
import { lines, tag, textNode, wrap } from "#shared/rules/svg/page/primitives.ts";
import { ghostFace, slabSeat, slabShadow } from "#shared/rules/svg/parts/slab.ts";
import { SHADOW_REACH } from "#shared/rules/svg/parts/shadow.ts";
import { floorOf, tray } from "#shared/rules/svg/parts/tray.ts";
import {
	MEMBERS_ATTRIBUTE,
	PIN_INSET,
	ghostOpacity,
	standingInk,
	standingPalette,
	standingPin,
	standingPinAt,
	subjectGroup,
	warningBadge,
	type SubjectStanding,
} from "#shared/rules/svg/parts/standing.ts";
import { stylesFor } from "#shared/rules/svg/page/styles.ts";

/** How round a decision's or loop's frame is at its corners. */
const FRAGMENT_RADIUS = 3;
/** How far the tab's lower right corner is cut, which is what makes it read as a tab. */
const TAB_CUT = 5;
/** Where a frame's words stand in their row, as a share of its height. */
const WORDS_BASELINE = 0.68;
/** How the dashed line between two alternatives is broken. */
const DIVIDER_DASH = "4 3";
/** How far a frame's standing pin and warning stand apart on its head row. */
const MARK_SPACING = 24;

/**
 * The frame around one flow, with the flow's name and summary on it.
 *
 * A flow is the one subject of this grammar that has no counterpart in the
 * architecture one, and the frame is what makes it a subject at all: it is what
 * a reader clicks to mean "this exchange", and it is what keeps several flows on
 * one page from reading as one very long sequence.
 *
 * It is built as an architecture's container is: a neutral well the exchange
 * stands in, with a header slab standing on its floor that the flow's name is
 * printed on.
 *
 * Its standing is the pin on its corner, and its face stays the frame's own:
 * the frame is the page of its flow, and a page washed in a standing's ink said
 * the flow's name or cast changed as loudly as every message inside it. A
 * removed flow is the one exception, a ghost like every removed block.
 * @param layout The flow.
 * @param palette The theme's colours.
 * @param standing How this flow stands against the variant it came from, when the caller said.
 * @param unsettled Whether the board says nobody has decided this exchange yet.
 * @returns The frame's group.
 */
function paintFrame(
	layout: FlowLayout,
	palette: Palette,
	standing: SubjectStanding | undefined,
	unsettled: boolean,
): string {
	const { frame, header, slab } = layout;
	const styles = stylesFor(palette);
	const ghosted = standing === "removed" ? standing : undefined;
	const look = trayLook(slab, palette, 0);
	// The header slab's face across the heading, which its far words stand on.
	const plate = { ...header, y: slab.y, height: slab.height - CARD_THICKNESS };
	return wrap(
		"g",
		subjectGroup("flow", layout.flow.id, standing),
		lines([
			slabSeat(frame, BAND_RADIUS),
			slabShadow(frame, BAND_RADIUS, "tray", palette, ghosted),
			halo(frame, BAND_RADIUS, styles, ghosted),
			tray(frame, look, palette, ghosted),
			paintHeadingViews(layout.flow, plate, palette, {
				markup: paintHeader(header, layout.flow.name, layout.flow.summary, styles),
				anchor: headerAnchor(header),
			}),
			standingPin(frame, standing, palette),
			warningBadge(frame, unsettled, palette),
		]),
	);
}

/**
 * The frame's own face behind a flow's head of cards, and a strip of it
 * above them, shown only while a viewer has moved the head down to keep it in
 * view over rows further down.
 *
 * A moved head stands over the columns of time and the rows it passes, and a
 * card a presented step veils is seen through: without this, what it stands
 * over would show through it and run on above it. So the page's ground is laid
 * first and the frame's face over it, standing with the frame (it lists the
 * flow as its member): a frame a step veils is seen through to the page, and so
 * is this. Hidden in the picture (`visibility`), and shown under a head the
 * viewer marks as moved (`is-stuck`).
 * @param layout The flow.
 * @param standing How the flow stands: a removed flow's face is its ghost's.
 * @param palette The theme's colours.
 * @returns The shade.
 */
function headShade(
	layout: FlowLayout,
	standing: SubjectStanding | undefined,
	palette: Palette,
): string {
	const card = layout.columns[0]?.card.box;
	if (card === undefined) {
		return "";
	}
	// Across the floor, through the card shadow's foot: a moved shadow must not
	// darken the lifelines it passes over.
	const floor = floorOf(layout.frame);
	const shape = {
		x: coord(floor.x),
		y: coord(card.y - HEAD_REACH),
		width: coord(floor.width),
		height: coord(card.height + HEAD_REACH + SHADOW_REACH),
	};
	// A top-level tray's floor, which is the frame's (`paintFrame`).
	const face = standing === "removed" ? ghostFace(palette) : { fill: palette.trayFloor };
	return wrap(
		"g",
		{ class: HEAD_SHADE_CLASS, visibility: "hidden" },
		lines([
			tag("rect", { ...shape, fill: palette.background }),
			wrap("g", { [MEMBERS_ATTRIBUTE]: layout.flow.id }, tag("rect", { ...shape, ...face })),
		]),
	);
}

/**
 * The tab a decision's or loop's operator stands in: its top left corner, cut
 * at the foot of its right side.
 * @param frame The frame.
 * @param ink The outline's colour.
 * @param face The tab's ground.
 * @returns The tab.
 */
function tabPath(frame: PlacedFrame, ink: string, face: string): string {
	const { x, y, width, height } = frame.tab;
	const d =
		`M ${coord(x)} ${coord(y)} H ${coord(x + width)} V ${coord(y + height - TAB_CUT)} ` +
		`L ${coord(x + width - TAB_CUT)} ${coord(y + height)} H ${coord(x)} Z`;
	return tag("path", { d, fill: face, stroke: ink, "stroke-width": 1 });
}

/**
 * The words of one row of a frame, left aligned at a height.
 * @param x Where they start.
 * @param top The top of their row.
 * @param height The row's height.
 * @param text The words.
 * @param fill Their colour.
 * @returns The text.
 */
function rowWords(x: number, top: number, height: number, text: string, fill: string): string {
	return textNode(
		{
			x: coord(x),
			y: coord(top + height * WORDS_BASELINE),
			...fontAttributes(PILL_FONT),
			"font-size": PILL_TEXT_SIZE,
			fill,
		},
		text,
	);
}

/**
 * Each alternative's label at the start of its operand, and the dashed line
 * that parts it from the one before.
 * @param frame The decision's frame.
 * @param ink The outline's colour.
 * @param words The labels' colour.
 * @returns The guards.
 */
function paintGuards(frame: PlacedFrame, ink: string, words: string): string {
	const { box } = frame;
	return lines(
		frame.guards.map((guard) =>
			lines([
				guard.divider === undefined
					? ""
					: tag("line", {
							x1: coord(box.x),
							y1: coord(guard.divider),
							x2: coord(box.x + box.width),
							y2: coord(guard.divider),
							stroke: ink,
							"stroke-width": 1,
							"stroke-dasharray": DIVIDER_DASH,
						}),
				rowWords(box.x + FRAME_PAD, guard.top, FRAME_GUARD_HEIGHT, `[${guard.label}]`, words),
			]),
		),
	);
}

/**
 * One decision's or loop's frame: its outline, its tab and words, its
 * alternatives' labels, and the marks of how it stands.
 * @param frame The frame.
 * @param palette The theme's colours.
 * @param standing How the decision or loop stands against the variant it came from.
 * @param unsettled Whether the board says nobody has decided it yet.
 * @returns The frame's group.
 */
function paintFragment(
	frame: PlacedFrame,
	palette: Palette,
	standing: SubjectStanding | undefined,
	unsettled: boolean,
): string {
	const { box, tab } = frame;
	const ink = (standing === undefined ? undefined : standingInk(standing, palette)) ?? palette.edge;
	const words = standingPalette(palette, standing).pillText;
	const outline = {
		x: coord(box.x),
		y: coord(box.y),
		width: coord(box.width),
		height: coord(box.height),
		rx: FRAGMENT_RADIUS,
	};
	const markX = box.x + box.width - PIN_INSET;
	return wrap(
		"g",
		{ ...subjectGroup("step", frame.step.id, standing), opacity: ghostOpacity(standing) },
		lines([
			tag("rect", { ...outline, fill: "none", stroke: ink, "stroke-width": 1 }),
			tag("rect", { class: "ab-halo", ...outline, "stroke-width": 2, ...stylesFor(palette).halo }),
			tabPath(frame, ink, palette.pill),
			rowWords(tab.x + FRAME_TAB_PADDING, tab.y, FRAME_HEAD_HEIGHT, frame.operator, words),
			rowWords(tab.x + tab.width + FRAME_TAB_PADDING, tab.y, FRAME_HEAD_HEIGHT, frame.words, words),
			paintGuards(frame, ink, words),
			standingPinAt(markX, box.y + PIN_INSET, standing, palette),
			warningBadge({ ...box, width: box.width - MARK_SPACING }, unsettled, palette),
		]),
	);
}

export { headShade, paintFragment, paintFrame };
