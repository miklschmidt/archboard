// The shapes a flowchart draws that are not boxes (ADR 0053): a decision's
// diamond, a loop's hexagon, and the rounded terminals where a flow starts and
// ends. Each stands where the layout put its card, holds its words in the
// middle, and meets every line on its own outline (`lib/flowchart.ts`).
//
// A shape is a block as a card is (`slab.ts`): a face lit from above over a
// front edge that shows how thick it is, the highlight along the sides that
// face up, and a soft shadow it casts down and to the right. What a card's
// face is, a shape's is, leaning a little toward one cool tone that only the
// flow's own pieces wear, so a diamond, a hexagon and a terminal read as the
// flow's among the cards of an architecture. A proposal's standing takes over
// the outline of the face as it does a card's.

import type { FlowchartShape } from "@/transformers/semantic-renderer/lib/flowchart-graph";
import type { DrawingNode } from "@/transformers/semantic-renderer/lib/drawing";
import { CARD_THICKNESS } from "@/transformers/semantic-renderer/lib/design";
import { PILL_FONT, fontAttributes } from "@/transformers/semantic-renderer/lib/fonts";
import { coord, type Box, type Point } from "@/transformers/semantic-renderer/lib/geometry";
import { token, type Palette } from "@/transformers/semantic-renderer/lib/theme";
import type { ShapePainter } from "@/transformers/semantic-renderer/lib/svg/architecture";
import { HALO_INSET, HALO_WIDTH } from "@/transformers/semantic-renderer/lib/svg/cards";
import { inset, polygonPath, type Polygon } from "@/transformers/semantic-renderer/lib/svg/polygon";
import { lines, tag, textNode, wrap } from "@/transformers/semantic-renderer/lib/svg/primitives";
import { SHADOW_REACH, polygonShadow } from "@/transformers/semantic-renderer/lib/svg/shadow";
import {
	shadowGroup,
	solidGhost,
	solidSeat,
	solidSlab,
	tinted,
	type SlabLook,
	type Share,
} from "@/transformers/semantic-renderer/lib/svg/slab";
import {
	OUTLINE_WIDTH,
	standingPalette,
	standingPinAt,
	subjectGroup,
	warningOnLine,
	type SubjectStanding,
} from "@/transformers/semantic-renderer/lib/svg/standing";
import { stylesFor } from "@/transformers/semantic-renderer/lib/svg/styles";

/** The size a shape's words are set at, and the room each of their lines takes. */
const SHAPE_TEXT = { size: 11, line: 14 } as const;

/**
 * The cool tone a flow's own pieces lean toward: the palette's blue, mixed in
 * lightly. It is the hue of the light ground's own neutrals, so a shape reads as
 * a card of another make rather than a part of another colour, and the colours
 * a part, a group or a standing wears keep what they say.
 */
const FLOW_INK = token("--semantic-blue");
/** How much of it a shape's face and its front edge carry, on each ground. */
const FACE_TINT: Share = { light: 0.06, dark: 0.1 };
const EDGE_TINT: Share = { light: 0.16, dark: 0.18 };

/** How round the corners of a diamond and of a hexagon are: a little less than a card's, as a point of a shape is small. */
const CORNER = 5;

/** How many sides a terminal's round end is drawn with. */
const END_SIDES = 16;

/**
 * The outline of a terminal: a box with ends as round as it is tall.
 * @param box Where it stands.
 * @returns The outline, a side of the round end at a time.
 */
function terminalOutline(box: Box): Polygon {
	const r = box.height / 2;
	/**
	 * One round end, from the flat above it to the flat below.
	 * @param centre How far across its centre is.
	 * @param from The angle it starts at.
	 * @returns Its corners.
	 */
	const end = (centre: number, from: number): Point[] =>
		Array.from({ length: END_SIDES + 1 }, (_, step) => {
			const angle = from + (Math.PI * step) / END_SIDES;
			return { x: centre + r * Math.cos(angle), y: box.y + r + r * Math.sin(angle) };
		});
	return [...end(box.x + box.width - r, -Math.PI / 2), ...end(box.x + r, Math.PI / 2)];
}

/**
 * The outline of one shape.
 * @param shape What it is.
 * @param box Where it stands.
 * @returns The outline, clockwise.
 */
function outlineOf(shape: FlowchartShape, box: Box): Polygon {
	const { x, y, width, height } = box;
	const middle = y + height / 2;
	if (shape === "decision") {
		const centre = x + width / 2;
		return [
			{ x: centre, y },
			{ x: x + width, y: middle },
			{ x: centre, y: y + height },
			{ x, y: middle },
		];
	}
	if (shape === "loop") {
		const cut = height / 2;
		return [
			{ x: x + cut, y },
			{ x: x + width - cut, y },
			{ x: x + width, y: middle },
			{ x: x + width - cut, y: y + height },
			{ x: x + cut, y: y + height },
			{ x, y: middle },
		];
	}
	return terminalOutline(box);
}

/**
 * Where a line that ends on a shape's box meets the shape itself: moved from
 * the box's edge along the line's own direction onto the outline, keeping the
 * gap the line kept from the box for its arrowhead.
 *
 * A diamond meets a line at its slanted sides, a hexagon at its cut corners;
 * a terminal's ends are round, but a line meets its flat top or foot.
 * @param shape What the line meets.
 * @param box The shape's box.
 * @param end Where the line ends, on or just outside the box.
 * @returns Where it should end.
 */
function onOutline(shape: FlowchartShape, box: Box, end: Point): Point {
	const half = { x: box.width / 2, y: box.height / 2 };
	const centre = { x: box.x + half.x, y: box.y + half.y };
	const offset = { x: end.x - centre.x, y: end.y - centre.y };
	// The line runs into the box across the side it is nearest to, as a share of the box.
	const across = Math.abs(offset.x) / half.x > Math.abs(offset.y) / half.y;
	const reach = outlineReach(shape, half, across ? offset.y : offset.x, across);
	if (across) {
		const gap = Math.abs(offset.x) - half.x;
		return { x: centre.x + Math.sign(offset.x) * (reach + gap), y: end.y };
	}
	const gap = Math.abs(offset.y) - half.y;
	return { x: end.x, y: centre.y + Math.sign(offset.y) * (reach + gap) };
}

/**
 * How far from a shape's centre its outline stands, along a line parallel to
 * one axis.
 * @param shape The shape.
 * @param half Half its box's width and height.
 * @param half.x Half its width.
 * @param half.y Half its height.
 * @param along Where the line crosses the other axis, from the centre.
 * @param across Whether the line runs across the shape (meets a side) rather than down it.
 * @returns The distance from the centre to the outline.
 */
function outlineReach(
	shape: FlowchartShape,
	half: { readonly x: number; readonly y: number },
	along: number,
	across: boolean,
): number {
	const [reach, span] = across ? [half.x, half.y] : [half.y, half.x];
	const share = Math.min(Math.abs(along) / span, 1);
	if (shape === "decision") return reach * (1 - share);
	if (shape !== "loop") return reach;
	// A hexagon's top and foot are flat over all but a cut as wide as half its height.
	const cut = half.y / half.x;
	if (across) return half.x - half.y * share;
	return share <= 1 - cut ? half.y : (half.y * (1 - share)) / cut;
}

/**
 * How a shape looks: a card's face and front edge, leaning toward the flow's tone.
 * @param shape What it is.
 * @param palette The theme's colours.
 * @returns The shape's look.
 */
function lookOf(shape: FlowchartShape, palette: Palette): SlabLook {
	return {
		face: tinted(palette.slabFace, FLOW_INK, FACE_TINT),
		ground: palette.slabFace,
		edge: tinted(palette.slabEdge, FLOW_INK, EDGE_TINT),
		thickness: CARD_THICKNESS,
		// A terminal is as round as it is tall already.
		radius: shape === "decision" || shape === "loop" ? CORNER : 0,
		sheen: true,
	};
}

/**
 * A shape's words, centred on its face, a line at a time.
 * @param box Where the shape stands.
 * @param words Its lines.
 * @param fill Their colour.
 * @returns The text.
 */
function centredWords(box: Box, words: readonly string[], fill: string): string {
	// The words stand on the face, above the front edge, as a card's do.
	const top = box.y + (box.height - CARD_THICKNESS) / 2 - (words.length * SHAPE_TEXT.line) / 2;
	return words
		.map((text, index) =>
			textNode(
				{
					x: coord(box.x + box.width / 2),
					y: coord(top + (index + 0.78) * SHAPE_TEXT.line),
					"text-anchor": "middle",
					"font-size": SHAPE_TEXT.size,
					...fontAttributes(PILL_FONT),
					fill,
				},
				text,
			),
		)
		.join("");
}

/**
 * The middle of the side of an outline nearest a corner of its box.
 * @param outline The outline.
 * @param corner The corner.
 * @returns The middle of that side.
 */
function sideNear(outline: Polygon, corner: Point): Point {
	const middles = outline.map((from, index) => {
		const to = outline[(index + 1) % outline.length]!;
		return { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 };
	});
	return middles.reduce((nearest, middle) =>
		Math.hypot(middle.x - corner.x, middle.y - corner.y) <
		Math.hypot(nearest.x - corner.x, nearest.y - corner.y)
			? middle
			: nearest,
	);
}

/**
 * The ring a viewer turns on to show a step's shape is selected: round the
 * outline as a card's is round its box, and over the border of a removal.
 * @param outline The shape's outline.
 * @param radius How round its corners are.
 * @param standing How the step stands, when this is a proposal.
 * @param palette The theme's colours.
 * @returns The ring.
 */
function ring(
	outline: Polygon,
	radius: number,
	standing: SubjectStanding | undefined,
	palette: Palette,
): string {
	const by = standing === "removed" ? OUTLINE_WIDTH / 2 : -HALO_INSET;
	return tag("path", {
		class: "ab-halo",
		d: polygonPath(inset(outline, by), Math.max(0, radius - by)),
		"stroke-width": HALO_WIDTH,
		...stylesFor(palette).halo,
	});
}

/**
 * The painter of one shape.
 * @param shape What it is.
 * @param words Its words, wrapped.
 * @param palette The theme's colours.
 * @returns What paints it where the layout put its card.
 */
function shapePainter(
	shape: FlowchartShape,
	words: readonly string[],
	palette: Palette,
): ShapePainter {
	const look = lookOf(shape, palette);
	const isStep = shape === "decision" || shape === "loop";
	/**
	 * What the shape casts, under every line and card.
	 * @param card Where the layout put it.
	 * @param standing How it stands, when this is a proposal.
	 * @returns Its shadow, or nothing for a removed step, which has lost its thickness.
	 */
	function shadow(card: DrawingNode, standing: SubjectStanding | undefined): string {
		if (standing === "removed") return "";
		const cast = polygonShadow(outlineOf(shape, card.box), look.radius, SHADOW_REACH, palette);
		// A terminal is no subject a viewer lights.
		return shadowGroup(cast, isStep ? card.measured.node.id : undefined);
	}
	/**
	 * The shape itself.
	 * @param card Where the layout put it.
	 * @param standing How it stands, when this is a proposal.
	 * @param unsettled Whether the board says nobody has decided it.
	 * @returns Its group.
	 */
	function paint(
		card: DrawingNode,
		standing: SubjectStanding | undefined,
		unsettled: boolean,
	): string {
		if (isStep) {
			return paintStepShape(shape, words, { look, palette }, card, { standing, unsettled });
		}
		// A terminal belongs to the picture alone: no reader picks where a flow starts.
		return wrap(
			"g",
			{},
			lines([
				solidSlab(outlineOf(shape, card.box), look, palette),
				centredWords(card.box, words, palette.muted),
			]),
		);
	}
	return { shadow, paint };
}

/**
 * A decision's or loop's shape: a step a reader can pick, lit with it, and
 * marked with how it stands.
 * @param shape The shape.
 * @param words Its words, wrapped.
 * @param paint How it is painted.
 * @param paint.look How it looks.
 * @param paint.palette The theme's colours.
 * @param card Where the layout put it.
 * @param marks How it stands, and whether the board says nobody has decided it.
 * @param marks.standing How it stands against the variant it is read against.
 * @param marks.unsettled Whether it needs reconciliation.
 * @returns The shape's group.
 */
function paintStepShape(
	shape: FlowchartShape,
	words: readonly string[],
	paint: { readonly look: SlabLook; readonly palette: Palette },
	card: DrawingNode,
	{ standing, unsettled }: { standing: SubjectStanding | undefined; unsettled: boolean },
): string {
	const { look, palette } = paint;
	const { box } = card;
	const outline = outlineOf(shape, box);
	// The pin and the warning stand where a card's do, on the side that cuts its top corners off.
	const pin = sideNear(outline, { x: box.x, y: box.y });
	const warning = sideNear(outline, { x: box.x + box.width, y: box.y });
	return wrap(
		"g",
		subjectGroup("step", card.measured.node.id, standing),
		lines([
			solidSeat(outline, look.radius),
			// A removed step's ghost; a step's shadow lies under every line and card (`shadow`).
			standing === "removed" ? solidGhost(outline, look.radius, palette) : "",
			ring(outline, look.radius, standing, palette),
			solidSlab(outline, look, palette, standing),
			centredWords(box, words, standingPalette(palette, standing).foreground),
			standingPinAt(pin.x, pin.y, standing, palette),
			warningOnLine(warning, unsettled, palette),
		]),
	);
}

export { SHAPE_TEXT, onOutline, shapePainter };
