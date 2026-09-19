// What a reader pays for a drawing, measure by measure, and which of several
// drawings of one board to keep.
//
// No one measure decides (docs/design/layout-rules.md section 18). Fit in the
// pane rewards a shape and ignores empty space; page area and card share
// reward compactness and ignore the pane; route length, bends and crossings
// are what a reader traces; lane ink and the flank fan are wiring down the
// margins. One drawing is better than another when it is better on more of
// these than it is worse. A route through a card that is neither of its ends
// is never paid for when another drawing avoids it. The measure script reads
// the same measures off the painted SVG
// (src/runtime/semantic-renderer/tests/drawn-scorecard.ts).

import { fitIn } from "@/shared/shell-geometry/index";
import type { ArchitectureDrawing } from "@/transformers/semantic-renderer/lib/drawing";
import type { Box, Point } from "@/transformers/semantic-renderer/lib/geometry";
import { crossingCount } from "@/transformers/semantic-renderer/lib/layout/crossings";
import { segmentStart } from "@/transformers/semantic-renderer/lib/layout/curves";
import { isFlank, nearestFace } from "@/transformers/semantic-renderer/lib/layout/reading";

/** One measure: how to read it off a drawing, how finely it is compared, and which way is better. */
interface Measure {
	readonly name: string;
	readonly of: (drawing: ArchitectureDrawing) => number;
	/** Decimal places two values must differ in to count as different. */
	readonly digits: number;
	readonly better: "lower" | "higher";
	/** A count differs by any amount; a size only by more than the tolerance. */
	readonly kind: "count" | "size";
}

/**
 * Whether a straight piece of route runs through the inside of a box.
 * @param from Where the piece starts.
 * @param to Where it ends.
 * @param box The box.
 * @returns True when the piece enters the box's interior.
 */
function through(from: Point, to: Point, box: Box): boolean {
	return (
		Math.min(from.x, to.x) < box.x + box.width - 0.5 &&
		Math.max(from.x, to.x) > box.x + 0.5 &&
		Math.min(from.y, to.y) < box.y + box.height - 0.5 &&
		Math.max(from.y, to.y) > box.y + 0.5
	);
}

/**
 * Every piece of every route, with the relationship it belongs to.
 * @param drawing The drawing.
 * @returns The pieces: their ends, whether they are a rounded turn, and the relationship.
 */
function piecesOf(drawing: ArchitectureDrawing) {
	return drawing.edges.flatMap(({ edge, curve }) =>
		curve.segments.map((segment, index) => ({
			edge,
			from: segmentStart(curve, index),
			to: segment.to,
			turn: segment.kind === "cubic",
		})),
	);
}

/**
 * Routes through a card that is neither of their ends, counted per card crossed.
 * @param drawing The drawing.
 * @returns How many times a straight piece enters a card it does not connect.
 */
function routesThroughCards(drawing: ArchitectureDrawing): number {
	return piecesOf(drawing)
		.filter((piece) => !piece.turn)
		.reduce(
			(total, { edge, from, to }) =>
				total +
				drawing.cards.filter(
					(card) =>
						card.measured.node.id !== edge.from &&
						card.measured.node.id !== edge.to &&
						through(from, to, card.box),
				).length,
			0,
		);
}

/**
 * Turns per route.
 * @param drawing The drawing.
 * @returns The average number of rounded turns a route takes.
 */
function bendsPerRoute(drawing: ArchitectureDrawing): number {
	if (drawing.edges.length === 0) return 0;
	return piecesOf(drawing).filter((piece) => piece.turn).length / drawing.edges.length;
}

/**
 * The share of straight route length that runs along the reading beside no
 * card: a lane down a margin rather than a route between rows.
 * @param drawing The drawing.
 * @returns Lane length over all straight length.
 */
function laneInk(drawing: ArchitectureDrawing): number {
	const straight = piecesOf(drawing).filter((piece) => !piece.turn);
	const total = straight.reduce((sum, { from, to }) => sum + lengthOf(from, to), 0);
	const lanes = straight
		.filter(({ from, to }) => isLane(drawing, from, to))
		.reduce((sum, { from, to }) => sum + lengthOf(from, to), 0);
	return total === 0 ? 0 : lanes / total;
}

/**
 * The length of a straight piece.
 * @param from Where it starts.
 * @param to Where it ends.
 * @returns Its length along both axes.
 */
function lengthOf(from: Point, to: Point): number {
	return Math.abs(to.x - from.x) + Math.abs(to.y - from.y);
}

/**
 * Whether a straight piece runs along the reading beside no card.
 * @param drawing The drawing, for its direction and cards.
 * @param from Where the piece starts.
 * @param to Where it ends.
 * @returns True for a margin lane.
 */
function isLane(drawing: ArchitectureDrawing, from: Point, to: Point): boolean {
	const [along, across, breadth] =
		drawing.direction === "down" ? (["y", "x", "width"] as const) : (["x", "y", "height"] as const);
	const lane = from[across];
	if (lane !== to[across] || from[along] === to[along]) return false;
	return drawing.cards.every(({ box }) => lane < box[across] || lane > box[across] + box[breadth]);
}

/**
 * Page area in megapixels.
 * @param drawing The drawing.
 * @returns Its area.
 */
function megapixels(drawing: ArchitectureDrawing): number {
	return (drawing.width * drawing.height) / 1e6;
}

/**
 * The share of the page under cards.
 * @param drawing The drawing.
 * @returns Card area over page area.
 */
function cardShare(drawing: ArchitectureDrawing): number {
	const cards = drawing.cards.reduce((total, { box }) => total + box.width * box.height, 0);
	return cards / (drawing.width * drawing.height);
}

/**
 * The length of every route together.
 * @param drawing The drawing.
 * @returns The total.
 */
function routeLength(drawing: ArchitectureDrawing): number {
	return piecesOf(drawing).reduce((total, { from, to }) => total + lengthOf(from, to), 0);
}

/**
 * Crossings between routes.
 * @param drawing The drawing.
 * @returns How many.
 */
function crossings(drawing: ArchitectureDrawing): number {
	return crossingCount(drawing.edges);
}

/**
 * The most routes leaving one card by one of its flanks.
 * @param drawing The drawing.
 * @returns The largest such fan.
 */
function flankFan(drawing: ArchitectureDrawing): number {
	const counts = new Map<string, number>();
	for (const { edge, curve } of drawing.edges) {
		const source = drawing.cards.find((card) => card.measured.node.id === edge.from);
		if (source === undefined) continue;
		const face = nearestFace(curve.from, source.box);
		if (!isFlank(face)) continue;
		const key = `${edge.from}:${face}`;
		counts.set(key, (counts.get(key) ?? 0) + 1);
	}
	return Math.max(0, ...counts.values());
}

/** The measures, in the order the measure script prints them. */
const MEASURES: readonly Measure[] = [
	{ name: "fit", of: fitIn, digits: 2, better: "higher", kind: "size" },
	{ name: "megapixels", of: megapixels, digits: 2, better: "lower", kind: "size" },
	{ name: "card share", of: cardShare, digits: 2, better: "higher", kind: "size" },
	{ name: "route length", of: routeLength, digits: 0, better: "lower", kind: "size" },
	{ name: "bends per route", of: bendsPerRoute, digits: 1, better: "lower", kind: "size" },
	{ name: "crossings", of: crossings, digits: 0, better: "lower", kind: "count" },
	{ name: "lane ink", of: laneInk, digits: 2, better: "lower", kind: "size" },
	{ name: "flank fan", of: flankFan, digits: 0, better: "lower", kind: "count" },
];

/**
 * A size must differ by more than this share of itself to count: a route two
 * units shorter on a page of two thousand is the same drawing to a reader,
 * and flipped a rule on a five-card board.
 */
const SIZE_TOLERANCE = 0.02;

/**
 * One drawing's value on every measure.
 * @param drawing The drawing.
 * @returns The values, rounded to the precision they are compared at.
 */
function scoresOf(drawing: ArchitectureDrawing): number[] {
	return MEASURES.map((measure) => {
		const scale = 10 ** measure.digits;
		return Math.round(measure.of(drawing) * scale) / scale;
	});
}

/**
 * Whether two values of a measure differ enough to count: counts (whole
 * numbers compared whole) by any amount, sizes by more than the tolerance.
 * @param measure The measure.
 * @param one One value.
 * @param other The other.
 * @returns True when a reader would see the difference.
 */
function differs(measure: Measure, one: number, other: number): boolean {
	if (measure.kind === "count") return one !== other;
	return Math.abs(one - other) > SIZE_TOLERANCE * Math.max(Math.abs(one), Math.abs(other));
}

/**
 * How one drawing compares with another: the measures it is better on, less
 * the measures it is worse on.
 * @param one One drawing's scores.
 * @param other The other's.
 * @returns Positive when the first is better on more measures.
 */
function margin(one: readonly number[], other: readonly number[]): number {
	return MEASURES.reduce((total, measure, index) => {
		if (!differs(measure, one[index]!, other[index]!)) return total;
		const higher = one[index]! > other[index]!;
		return total + (higher === (measure.better === "higher") ? 1 : -1);
	}, 0);
}

/**
 * Every badge stays within reach of an endpoint: its distance to the nearer
 * endpoint cannot exceed the distance between the two endpoints. This is
 * the drawn scorecard's existing label-strand legibility contract.
 * @param drawing One settled candidate.
 * @returns Whether none of its labels are stranded beyond both endpoints.
 */
function labelsWithinReach(drawing: ArchitectureDrawing): boolean {
	return drawing.edges.every(({ label, curve }) => {
		if (label === undefined) return true;
		const from = curve.from;
		const to = curve.segments.at(-1)?.to ?? from;
		const between = Math.hypot(to.x - from.x, to.y - from.y);
		if (between === 0) return true;
		const x = label.box.x + label.box.width / 2;
		const y = label.box.y + label.box.height / 2;
		const reach = Math.min(Math.hypot(x - from.x, y - from.y), Math.hypot(x - to.x, y - to.y));
		return reach <= between;
	});
}

/**
 * The drawing a reader is better off with. The first drawing is the default;
 * another is a candidate only when it routes through no more cards and
 * crosses no more routes than the first, since a smaller page does not buy a
 * crossing a reader must untangle (a skip over two steps, freed, crossed the
 * first step to reach a lane on the other side). Of the candidates, the one
 * better than each other is kept; when none is, the one better than the most
 * others; and the earliest when they tie.
 * @param drawings The drawings, the default first.
 * @returns The kept drawing.
 */
function bestOf(drawings: readonly ArchitectureDrawing[]): ArchitectureDrawing {
	const [first, ...others] = drawings;
	const throughCards = routesThroughCards(first!);
	const crossed = crossingCount(first!.edges);
	const offered = [
		first!,
		...others.filter(
			(drawing) =>
				routesThroughCards(drawing) <= throughCards && crossingCount(drawing.edges) <= crossed,
		),
	];
	const legible = offered.filter(labelsWithinReach);
	// Preserve a renderable answer when no offered reading meets the reach
	// contract, as with the existing card/crossing guards.
	const candidates = legible.length > 0 ? legible : offered;
	const scores = candidates.map(scoresOf);
	const wins = scores.map(
		(score, index) => scores.filter((other, at) => at !== index && margin(score, other) > 0).length,
	);
	const most = Math.max(...wins);
	return candidates[wins.indexOf(most)]!;
}

export { bestOf, bendsPerRoute, routesThroughCards };
