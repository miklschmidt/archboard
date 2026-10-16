// The shapes a flowchart draws that are not boxes (ADR 0053): a decision's
// diamond, a loop's hexagon, and the rounded terminals where a flow starts and
// ends. Each stands where the layout put its card, holds its words in the
// middle, and meets every line on its own outline (`lib/flowchart.ts`).

import type { FlowchartShape } from "@/transformers/semantic-renderer/lib/flowchart-graph";
import type { DrawingNode } from "@/transformers/semantic-renderer/lib/drawing";
import { PILL_FONT, fontAttributes } from "@/transformers/semantic-renderer/lib/fonts";
import { coord, type Box, type Point } from "@/transformers/semantic-renderer/lib/geometry";
import type { Palette } from "@/transformers/semantic-renderer/lib/theme";
import type { ShapePainter } from "@/transformers/semantic-renderer/lib/svg/architecture";
import { lines, tag, textNode, wrap } from "@/transformers/semantic-renderer/lib/svg/primitives";
import {
	ghostOpacity,
	standingInk,
	standingPalette,
	standingPinAt,
	subjectGroup,
	warningBadge,
	type SubjectStanding,
} from "@/transformers/semantic-renderer/lib/svg/standing";
import { stylesFor } from "@/transformers/semantic-renderer/lib/svg/styles";

/** The size a shape's words are set at, and the room each of their lines takes. */
const SHAPE_TEXT = { size: 11, line: 14 } as const;
/** How heavy a shape's outline is. */
const OUTLINE_WIDTH = 1.25;
/** How heavy a lit shape's outline is. */
const LIT_WIDTH = 2.5;

/**
 * The outline of one shape, as path data.
 * @param shape What it is.
 * @param box Where it stands.
 * @returns The path.
 */
function outlinePath(shape: FlowchartShape, box: Box): string {
	const { x, y, width, height } = box;
	const middle = y + height / 2;
	if (shape === "decision") {
		const centre = x + width / 2;
		return `M ${coord(centre)} ${coord(y)} L ${coord(x + width)} ${coord(middle)} L ${coord(centre)} ${coord(y + height)} L ${coord(x)} ${coord(middle)} Z`;
	}
	if (shape === "loop") {
		const cut = height / 2;
		return `M ${coord(x + cut)} ${coord(y)} H ${coord(x + width - cut)} L ${coord(x + width)} ${coord(middle)} L ${coord(x + width - cut)} ${coord(y + height)} H ${coord(x + cut)} L ${coord(x)} ${coord(middle)} Z`;
	}
	const r = height / 2;
	return `M ${coord(x + r)} ${coord(y)} H ${coord(x + width - r)} A ${coord(r)} ${coord(r)} 0 0 1 ${coord(x + width - r)} ${coord(y + height)} H ${coord(x + r)} A ${coord(r)} ${coord(r)} 0 0 1 ${coord(x + r)} ${coord(y)} Z`;
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
 * A shape's words, centred, a line at a time.
 * @param box Where the shape stands.
 * @param words Its lines.
 * @param fill Their colour.
 * @returns The text.
 */
function centredWords(box: Box, words: readonly string[], fill: string): string {
	const top = box.y + box.height / 2 - (words.length * SHAPE_TEXT.line) / 2;
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
	if (shape === "start" || shape === "end") {
		// A terminal belongs to the picture alone: no reader picks where a flow starts.
		return ({ box }) =>
			wrap(
				"g",
				{},
				lines([
					tag("path", {
						d: outlinePath(shape, box),
						fill: palette.pill,
						stroke: palette.edge,
						"stroke-width": OUTLINE_WIDTH,
					}),
					centredWords(box, words, palette.muted),
				]),
			);
	}
	return (card, standing, unsettled) =>
		paintStepShape(shape, words, palette, card, { standing, unsettled });
}

/**
 * A decision's or loop's shape: a step a reader can pick, lit with it, and
 * marked with how it stands.
 * @param shape The shape.
 * @param words Its words, wrapped.
 * @param palette The theme's colours.
 * @param card Where the layout put it.
 * @param marks How it stands, and whether the board says nobody has decided it.
 * @param marks.standing How it stands against the variant it is read against.
 * @param marks.unsettled Whether it needs reconciliation.
 * @returns The shape's group.
 */
function paintStepShape(
	shape: FlowchartShape,
	words: readonly string[],
	palette: Palette,
	card: DrawingNode,
	{ standing, unsettled }: { standing: SubjectStanding | undefined; unsettled: boolean },
): string {
	const { box } = card;
	const d = outlinePath(shape, box);
	const ink = (standing === undefined ? undefined : standingInk(standing, palette)) ?? palette.edge;
	return wrap(
		"g",
		{ ...subjectGroup("step", card.measured.node.id, standing), opacity: ghostOpacity(standing) },
		lines([
			tag("path", { d, fill: palette.pill, stroke: ink, "stroke-width": OUTLINE_WIDTH }),
			tag("path", { class: "ab-halo", d, "stroke-width": LIT_WIDTH, ...stylesFor(palette).halo }),
			centredWords(box, words, standingPalette(palette, standing).foreground),
			standingPinAt(box.x, box.y, standing, palette),
			warningBadge(box, unsettled, palette),
		]),
	);
}

export { SHAPE_TEXT, onOutline, shapePainter };
