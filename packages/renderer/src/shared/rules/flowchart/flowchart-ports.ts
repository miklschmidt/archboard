// Where a line meets a decision's diamond or a terminal: at the middle of the
// side it crosses, a diamond's point, never on a slanted side or off to one
// side of a terminal. The layout spreads the lines that leave or reach a box
// along the side they cross; a diamond has no side to spread them along, and a
// terminal is a mark that every line of a flow starts at or ends at. So every
// line into a decision arrives at one point, as a flowchart draws them.
//
// The answers out of a decision leave it apart: one from its left point, one
// from its right point and a third from its bottom point. The layout holds
// each answer to its point of the decision's box, which is wider than the
// diamond on either side (`shared/rules/track/routes/points.ts`). An answer held near the left or
// right edge of the box starts beside the diamond, and here it is drawn out
// of the point on that side: it runs out sideways and turns down where it was
// laid out, clear of the diamond (`fromSide`).
//
// A line is moved in one of two ways: it turns in just outside the box to the
// middle, or its first leg moves over to the middle and the run after its
// first turn starts there instead. A line that leaves a shape turns in where it
// can, so it still passes the words of its answer, which stand beside its first
// leg; a line that reaches a shape moves its last leg where it can. A line that
// reaches a shape is the same line read backwards.

import { APPROACH_STRAIGHT, BEND_RADIUS } from "#shared/constants/spacing.ts";
import type { Box, Point } from "#shared/rules/geometry.ts";
import type { FlowchartShape } from "#shared/rules/flowchart/flowchart-graph.ts";
import {
	EPSILON,
	curveThrough,
	reversed,
	segmentStart,
	verticesOf,
	type Curve,
	type Segment,
} from "#shared/rules/layout/routes/curves.ts";

/** How far beyond the turn out of a point a line runs before it turns again, so the two turns do not touch. */
const CLEAR = 4;

/**
 * The unit way along a straight piece, when it runs along one axis.
 * @param from Where it starts.
 * @param to Where it ends.
 * @returns The way, or undefined for a piece that is not straight along an axis.
 */
function axisWay(from: Point, to: Point): Point | undefined {
	const dx = to.x - from.x;
	const dy = to.y - from.y;
	if (Math.abs(dx) < EPSILON && Math.abs(dy) > EPSILON) return { x: 0, y: Math.sign(dy) };
	if (Math.abs(dy) < EPSILON && Math.abs(dx) > EPSILON) return { x: Math.sign(dx), y: 0 };
	return undefined;
}

/**
 * The middle of the side of a box a line crosses, at the line's own distance from the box.
 * @param box The shape's box.
 * @param end Where the line ends, on or just outside the box.
 * @param way The way the line runs out of the box from that end.
 * @returns The point the line should end at instead.
 */
function middleFor(box: Box, end: Point, way: Point): Point {
	return way.x === 0
		? { x: box.x + box.width / 2, y: end.y }
		: { x: end.x, y: box.y + box.height / 2 };
}

/**
 * A point moved along a way.
 * @param point The point.
 * @param way The way.
 * @param by How far.
 * @returns The moved point.
 */
function along(point: Point, way: Point, by: number): Point {
	return { x: point.x + way.x * by, y: point.y + way.y * by };
}

/**
 * How far apart two points are.
 * @param a One point.
 * @param b The other.
 * @returns The distance.
 */
function apart(a: Point, b: Point): number {
	return Math.hypot(b.x - a.x, b.y - a.y);
}

/**
 * Whether a piece is one of the route's quarter turns, which moves it as far
 * across as along, rather than a hop over another line, which comes back to
 * the line it left.
 * @param from Where the piece starts.
 * @param segment The piece.
 * @returns True for a turn.
 */
function isTurn(from: Point, segment: Segment | undefined): boolean {
	if (segment?.kind !== "cubic") return false;
	const across = Math.abs(segment.to.x - from.x);
	return across > EPSILON && Math.abs(across - Math.abs(segment.to.y - from.y)) < EPSILON;
}

/**
 * The corners of the first legs of a line, as far as its second turn or a hop
 * over another line, with the rest of it.
 * @param curve The line.
 * @returns The corners, from its start, and the pieces after the last of them.
 */
function firstLegs(curve: Curve): { readonly corners: Point[]; readonly rest: readonly Segment[] } {
	let turns = 0;
	let end = 0;
	for (const [index, segment] of curve.segments.entries()) {
		if (segment.kind === "line") {
			end = index + 1;
			if (turns === 2) break;
			continue;
		}
		if (!isTurn(segmentStart(curve, index), segment)) break;
		turns += 1;
	}
	const head = { from: curve.from, segments: curve.segments.slice(0, end) };
	return { corners: verticesOf(head), rest: curve.segments.slice(end) };
}

/**
 * A line with its first leg moved over to start at the middle of the side: the
 * run after its first turn then starts or ends there instead.
 * @param corners The corners of its first legs.
 * @param start Where it should leave from.
 * @returns The moved corners, or undefined where the run after the turn would
 * turn back on itself or has no room left for its turns.
 */
function movedLeg(corners: readonly Point[], start: Point): Point[] | undefined {
	const [from, knee, after] = corners;
	if (from === undefined || knee === undefined || after === undefined) return undefined;
	const moved = { x: knee.x + start.x - from.x, y: knee.y + start.y - from.y };
	return keepsWay(knee, moved, after) ? [start, moved, ...corners.slice(2)] : undefined;
}

/**
 * Whether a run from a moved corner still goes the way it went, with room left for its turns.
 * @param knee The corner where it was.
 * @param moved The corner where it is moved to.
 * @param after Where the run ends.
 * @returns True when it does.
 */
function keepsWay(knee: Point, moved: Point, after: Point): boolean {
	const was = axisWay(knee, after);
	const now = axisWay(moved, after);
	return (
		was !== undefined &&
		now?.x === was.x &&
		now.y === was.y &&
		apart(moved, after) >= BEND_RADIUS + CLEAR
	);
}

/**
 * A line whose first leg runs straight out of the box for a while, turned in
 * just outside the box to the middle of the side.
 * @param corners The corners of its first legs.
 * @param start Where it should leave from.
 * @param reach How far out it turns across.
 * @returns The corners with the turn in, or undefined where its first leg has no room for it.
 */
function turnedIn(corners: readonly Point[], start: Point, reach: number): Point[] | undefined {
	const [from, next] = corners;
	if (from === undefined || next === undefined) return undefined;
	if (apart(from, next) < reach + BEND_RADIUS * 2) return undefined;
	const way = axisWay(from, next);
	if (way === undefined) return undefined;
	return [start, along(start, way, reach), along(from, way, reach), ...corners.slice(1)];
}

/**
 * The corners of a line's first legs moved to start at the middle of a side.
 * @param corners The corners.
 * @param start Where the line should leave from.
 * @param end Which end of the line it is ({@link fromMiddle}).
 * @returns The moved corners, or undefined where the line cannot be moved.
 */
function startedAt(
	corners: readonly Point[],
	start: Point,
	end: "leaves" | "arrives",
): Point[] | undefined {
	if (end === "arrives") {
		return movedLeg(corners, start) ?? turnedIn(corners, start, APPROACH_STRAIGHT + BEND_RADIUS);
	}
	return turnedIn(corners, start, BEND_RADIUS + CLEAR) ?? movedLeg(corners, start);
}

/**
 * A line that leaves a shape, moved to leave from the middle of the side it crosses.
 * @param curve The line, from the shape.
 * @param box The shape's box.
 * @param end Which end of the line this is: where it leaves keeps its first leg,
 * which its words stand beside, and turns in; where it arrives moves its last leg.
 * @returns The line, moved where it can be.
 */
function fromMiddle(curve: Curve, box: Box, end: "leaves" | "arrives"): Curve {
	const { corners, rest } = firstLegs(curve);
	const way = corners.length > 1 ? axisWay(corners[0]!, corners[1]!) : undefined;
	if (way === undefined) return curve;
	const start = middleFor(box, curve.from, way);
	if (apart(start, curve.from) < EPSILON) return curve;
	const turned = startedAt(corners, start, end);
	if (turned === undefined) return curve;
	const head = curveThrough(turned, true);
	return { from: head.from, segments: [...head.segments, ...rest] };
}

/**
 * A line laid out to leave beside a shape's box, as a decision's answer held
 * to an edge of its box is (`shared/rules/track/routes/points.ts`), drawn out of the point on that
 * side: it runs out sideways and turns down where it was laid out.
 * @param curve The line, from the shape.
 * @param box The shape's box.
 * @returns The line, or undefined where it leaves from the box's own face.
 */
function fromSide(curve: Curve, box: Box): Curve | undefined {
	const { x } = curve.from;
	const right = box.x + box.width;
	const side = x < box.x - EPSILON ? box.x : x > right + EPSILON ? right : undefined;
	if (side === undefined) return undefined;
	const { corners, rest } = firstLegs(curve);
	const middle = box.y + box.height / 2;
	const head = curveThrough([{ x: side, y: middle }, { x, y: middle }, ...corners], true);
	return { from: head.from, segments: [...head.segments, ...rest] };
}

/**
 * A line with each end that meets a diamond or a terminal moved to the middle
 * of the side it crosses, or, where it was laid out to leave beside the
 * shape, out of the point on that side.
 * @param curve The line as laid out, its ends on the boxes.
 * @param from The box the line leaves, if it leaves one of those.
 * @param to The box the line reaches, if it reaches one of those.
 * @returns The line.
 */
function atShapePoints(curve: Curve, from: Box | undefined, to: Box | undefined): Curve {
	const left =
		from === undefined ? curve : (fromSide(curve, from) ?? fromMiddle(curve, from, "leaves"));
	if (to === undefined) return left;
	return reversed(fromMiddle(reversed(left), to, "arrives"));
}

/**
 * Where a line that ends on a shape's box meets the shape itself: moved from
 * the box's edge along the line's own direction onto the outline, keeping the
 * gap the line kept from the box for its arrowhead.
 *
 * A diamond meets a line at one of its points, where the line was turned to
 * (`flowchart-ports.ts`), or at a slanted side where the line had no room to
 * turn; a hexagon at its cut corners; a terminal's ends are round, but a line
 * meets its flat top or foot.
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
 * @param offset Where the line crosses the other axis, from the centre.
 * @param across Whether the line runs across the shape (meets a side) rather than down it.
 * @returns The distance from the centre to the outline.
 */
function outlineReach(
	shape: FlowchartShape,
	half: { readonly x: number; readonly y: number },
	offset: number,
	across: boolean,
): number {
	const [reach, span] = across ? [half.x, half.y] : [half.y, half.x];
	const share = Math.min(Math.abs(offset) / span, 1);
	if (shape === "decision") return reach * (1 - share);
	if (shape !== "loop") return reach;
	// A hexagon's top and foot are flat over all but a cut as wide as half its height.
	const cut = half.y / half.x;
	if (across) return half.x - half.y * share;
	return share <= 1 - cut ? half.y : (half.y * (1 - share)) / cut;
}

export { atShapePoints, onOutline };
