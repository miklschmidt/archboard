// libavoid joins the pins of one class to a point at their shape's centre and
// charges each pin its distance from there. A pin in the middle of a face then
// wins over a side pin that a route reaches with less length, so a line to a
// target beside and just below its card drops out of the bottom and runs under
// the trunk its siblings leave along, and every one of them hops it (Command
// interface's "lifecycle command", Skill evaluation's "One author run").
// Evening that charge lets a line leave on the side it travels. Charging a
// side pin even half a bend more moved labels, and so placements: Board
// rasterizer went from 2777 to 3495 wide and Board persistence from 3381 to
// 3744 and tangled, so the reading direction is kept by the choice below
// instead.
//
// Evened pins move routes, so they move where labels land, which labels are
// reserved, and the placement those reservations buy. That can fall either way
// for a whole drawing: with evened pins no release of Browser application's
// reserved rows kept its crossings down, so it stayed 2734 wide instead of
// 2156 and drew 24 crossings instead of 15. Each reading is therefore settled
// and finished both ways (compound.ts) and the tidier drawing is kept. It may
// have no more of any defect a reader sees: crossings; lines that touch, and a
// fan's branches crowded into one blot; the length unrelated lines share a
// stroke over; and hooks into a card's side. Evened pins that saved crossings
// kept a 450 px trunk of two unrelated lines in Command interface, and
// finishing only the settlement chosen left the other no chance to cure its
// trunks (What the CLI can be asked). Among drawings with no more of any, the
// one with fewer crossings, hooks and ports beside a card's corner together is
// kept; then fewer line ends across the reading direction, so a fan into the
// cards below a card is not traded for side exits with a bend fewer (Skill
// evaluation's "Grading"); then less line. A challenger that ranks no better
// is kept only for defects the rank does not count that it cures (the labels a
// cleared drawing clears, label-clearance.ts). A drawing that saves defects by
// growing its page or its lines by more than each saved defect is worth is not
// tidier (Command dispatch took a page a third taller with a third more line
// to save two crossings).
import type { ArchitectureDrawing } from "@/transformers/semantic-renderer/lib/drawing";
import type { Box, Point } from "@/transformers/semantic-renderer/lib/geometry";
import { eitherRouting } from "@/transformers/semantic-renderer/lib/layout/checked-routes";
import { verticesOf } from "@/transformers/semantic-renderer/lib/layout/curves";
import { cornerPorts } from "@/transformers/semantic-renderer/lib/layout/lone-pins";
import { sideHooks } from "@/transformers/semantic-renderer/lib/layout/pin-feedback";
import {
	crowdedJoinCount,
	stackedLanes,
	stackKeys,
	touchKeys,
} from "@/transformers/semantic-renderer/lib/layout/stacked-runs";
import { crossingsOf } from "@/transformers/semantic-renderer/lib/track/score";

/** The share a drawing may grow its page or its lines by for every defect it saves. */
const CROSSING_WORTH = 0.05;

/**
 * Whether a proportional pin position lies on one of its shape's edges.
 * @param position The position across or down the shape.
 * @returns True at either edge.
 */
function onEdge(position: number): boolean {
	return position === 0 || position === 1;
}

/**
 * The cost that evens out libavoid's charge for reaching a pin from its
 * shape's centre, so every pin of a shape costs the same in total.
 * @param box The shape's routing box.
 * @param at The pin's proportional position on it.
 * @param inset How far inside the routing box the pin stands on a side face.
 * @returns The pin's connection cost.
 */
function centreHandicap(box: Box, at: Point, inset: number): number {
	const dx = Math.abs(at.x - 0.5) * box.width - (onEdge(at.x) ? inset : 0);
	const dy = Math.abs(at.y - 0.5) * box.height - (onEdge(at.y) ? inset : 0);
	return box.width / 2 + box.height / 2 - dx - dy;
}

/**
 * How long an orthogonal line is.
 * @param points Its vertices.
 * @returns The length of its runs.
 */
function lengthOf(points: readonly Point[]): number {
	return points
		.slice(1)
		.reduce(
			(sum, point, index) =>
				sum + Math.abs(point.x - points[index]!.x) + Math.abs(point.y - points[index]!.y),
			0,
		);
}

/**
 * The crossings a reader sees in a drawing, and the places two unrelated
 * lines share one stroke, where a reader cannot tell which goes where and
 * which may hide a crossing (stacked-runs.ts).
 * @param drawing The drawing.
 * @returns Their number.
 */
function crossingsSeen(drawing: ArchitectureDrawing): number {
	return (
		crossingsOf(drawing.edges.map(({ curve }) => verticesOf(curve))) + stackKeys(drawing).length
	);
}

/**
 * How long a drawing's lines are together.
 * @param drawing The drawing.
 * @returns Their length.
 */
function lineLength(drawing: ArchitectureDrawing): number {
	return drawing.edges.reduce((sum, { curve }) => sum + lengthOf(verticesOf(curve)), 0);
}

/**
 * What a drawing may have no more of than the drawing it would replace: drawn
 * crossings; pairs of lines that touch, where a corner of one reads as a
 * junction on the other, together with pairs of joins crowded into one blot;
 * the lanes' worth of line unrelated lines draw on one stroke; and line ends
 * hooking into a card's side. Ranked on crossings seen alone, evened pins kept
 * Command interface's 450 px trunk of two unrelated lines for the crossings it
 * saved.
 * @param drawing A settled drawing.
 * @returns Its crossings, touching lines and crowded joins, stacked lanes, and hooks.
 */
function defectsIn(drawing: ArchitectureDrawing): readonly number[] {
	return [
		crossingsOf(drawing.edges.map(({ curve }) => verticesOf(curve))),
		touchKeys(drawing).length + crowdedJoinCount(drawing),
		stackedLanes(drawing),
		sideHooks(drawing).length,
	];
}

/**
 * What a drawing is ranked on, most important first.
 * @param drawing A settled drawing.
 * @returns Its crossings and hooks together with the ports beside a card's corner, then its line
 * ends across the reading direction and line length.
 */
function untidiness(drawing: ArchitectureDrawing): readonly number[] {
	const [crossings, , , hooks] = defectsIn(drawing);
	const seen = crossings! + hooks! + cornerPorts(drawing).length;
	return [seen, sideEnds(drawing), lineLength(drawing)];
}

/**
 * How many line ends leave or enter a card by its side, across the reading direction.
 * @param drawing The drawing.
 * @returns The ends.
 */
function sideEnds(drawing: ArchitectureDrawing): number {
	const cards = new Set(drawing.cards.map(({ measured }) => measured.node.id));
	return drawing.edges.reduce((sum, { edge, curve }) => {
		const points = verticesOf(curve);
		const ends = [
			[edge.from, points[0]!, points[1]!],
			[edge.to, points.at(-1)!, points.at(-2)!],
		] as const;
		return (
			sum +
			ends.filter(([card, tip, next]) => cards.has(card) && Math.abs(tip.y - next.y) < 0.5).length
		);
	}, 0);
}

/**
 * How much bigger one drawing is than another, page and line alike.
 * @param one A drawing.
 * @param other Another.
 * @returns The larger of the page area's and the line length's growth, as a share.
 */
function growth(one: ArchitectureDrawing, other: ArchitectureDrawing): number {
	const [mine, theirs] = [lineLength(one), lineLength(other)];
	return Math.max(
		(one.width * one.height) / (other.width * other.height) - 1,
		theirs === 0 ? 0 : mine / theirs - 1,
	);
}

/**
 * Whether one drawing is tidier than another: it has no more of any defect
 * ({@link defectsIn}), ranks strictly better or cures others that are not
 * ranked, and grows the page and
 * its lines by no more than every defect it saves buys
 * ({@link CROSSING_WORTH}). Two crossings saved do not pay for a page a
 * third taller with a third more line (Command dispatch).
 * @param one The challenger.
 * @param other The drawing kept so far, which wins a tie.
 * @param cured How many defects the ranking does not count the challenger cures, less those it brings.
 * @returns True when the challenger is kept.
 */
function tidierThan(one: ArchitectureDrawing, other: ArchitectureDrawing, cured = 0): boolean {
	const [mine, theirs] = [defectsIn(one), defectsIn(other)];
	if (mine.some((value, at) => value > theirs[at]!)) return false;
	const [ranked, against] = [untidiness(one), untidiness(other)];
	if (!ranksBetter(ranked, against) && cured <= 0) return false;
	const saved = Math.max(0, against[0]! - ranked[0]!) + cured;
	return growth(one, other) <= saved * CROSSING_WORTH;
}

/**
 * Whether one ranking is strictly better than another at the first place they differ.
 * @param ranked A drawing's ranking ({@link untidiness}).
 * @param against Another's.
 * @returns True when the first ranks better.
 */
function ranksBetter(ranked: readonly number[], against: readonly number[]): boolean {
	const index = ranked.findIndex((value, at) => Math.abs(value - against[at]!) > 0.5);
	return index !== -1 && ranked[index]! < against[index]!;
}

/**
 * The tidier of a reading settled with plain pins and with evened pins. A
 * settlement the router refuses leaves the other; a fault in either is thrown.
 * @param plain The reading settled with plain pins.
 * @param even The reading settled with evened pins.
 * @returns The settlement kept.
 */
async function tidierSettlement<Settled extends { readonly drawing: ArchitectureDrawing }>(
	plain: Promise<Settled>,
	even: Promise<Settled>,
): Promise<Settled> {
	const [one, other] = await eitherRouting(plain, even);
	if (one === undefined || other === undefined) return (one ?? other)!;
	return tidierThan(other.drawing, one.drawing) ? other : one;
}

export { centreHandicap, crossingsSeen, tidierSettlement, tidierThan };
