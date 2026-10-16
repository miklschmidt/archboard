// Where a line meets a decision's diamond: at one of its four points, never on
// a slanted side. The layout spreads the lines that leave or reach a box along
// the side they cross; a diamond has no side to spread them along, so each line
// is turned in just outside the box to the point of the side it crosses, and
// every line out of a decision leaves from one point and every line into it
// arrives at one, as a flowchart draws them.

import { APPROACH_STRAIGHT, BEND_RADIUS } from "@/transformers/semantic-renderer/lib/design";
import type { Box, Point } from "@/transformers/semantic-renderer/lib/geometry";
import {
	EPSILON,
	curveThrough,
	type Curve,
} from "@/transformers/semantic-renderer/lib/layout/curves";

/** How far beyond the turn out of a point a line runs before it turns again, so the two turns do not touch. */
const CLEAR = 4;

/**
 * The point of a diamond on the side a line crosses, at the line's own
 * distance from the box.
 * @param box The diamond's box.
 * @param end Where the line ends, on or just outside the box.
 * @param way The way the line runs out of the box from that end.
 * @returns The point the line should end at instead.
 */
function pointFor(box: Box, end: Point, way: Point): Point {
	return way.x === 0
		? { x: box.x + box.width / 2, y: end.y }
		: { x: end.x, y: box.y + box.height / 2 };
}

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
 * The corners of a line's end turned to the point of the side it crosses: from
 * that point straight out, across to where the line was, and on to the far end
 * of its straight piece.
 * @param end Where the line ends on the box.
 * @param next The far end of the straight piece at that end.
 * @param box The diamond's box.
 * @param reach How far out the line turns across.
 * @returns The corners, from the point out, or undefined where the line ends at
 * the point already or its straight piece has no room for the turn.
 */
function turnedEnd(end: Point, next: Point, box: Box, reach: number): Point[] | undefined {
	const way = axisWay(end, next);
	if (way === undefined) return undefined;
	const point = pointFor(box, end, way);
	const room = Math.hypot(next.x - end.x, next.y - end.y);
	if (Math.hypot(point.x - end.x, point.y - end.y) < EPSILON || room < reach + BEND_RADIUS) {
		return undefined;
	}
	return [point, along(point, way, reach), along(end, way, reach), next];
}

/**
 * A line that leaves a diamond, turned to leave from the point of the side it
 * crosses.
 * @param curve The line as laid out.
 * @param box The diamond's box.
 * @returns The line, or undefined where it cannot or need not turn.
 */
function leavingPoint(curve: Curve, box: Box): Curve | undefined {
	const first = curve.segments[0];
	if (first?.kind !== "line") return undefined;
	const corners = turnedEnd(curve.from, first.to, box, BEND_RADIUS + CLEAR);
	if (corners === undefined) return undefined;
	const turned = curveThrough(corners, true);
	return { from: turned.from, segments: [...turned.segments, ...curve.segments.slice(1)] };
}

/**
 * A line that reaches a diamond, turned to arrive at the point of the side it
 * crosses, straight for its arrowhead.
 * @param curve The line as laid out.
 * @param box The diamond's box.
 * @returns The line, or undefined where it cannot or need not turn.
 */
function arrivingPoint(curve: Curve, box: Box): Curve | undefined {
	const last = curve.segments.at(-1);
	if (last?.kind !== "line") return undefined;
	const before = curve.segments.at(-2)?.to ?? curve.from;
	const corners = turnedEnd(last.to, before, box, APPROACH_STRAIGHT + BEND_RADIUS);
	if (corners === undefined) return undefined;
	const turned = curveThrough(corners.toReversed(), true);
	return { from: curve.from, segments: [...curve.segments.slice(0, -1), ...turned.segments] };
}

/**
 * A line with each end that meets a diamond turned to the diamond's point.
 * @param curve The line as laid out, its ends on the boxes.
 * @param from The diamond's box the line leaves, if it leaves one.
 * @param to The diamond's box the line reaches, if it reaches one.
 * @returns The line.
 */
function atDiamondPoints(curve: Curve, from: Box | undefined, to: Box | undefined): Curve {
	const left = from === undefined ? curve : (leavingPoint(curve, from) ?? curve);
	return to === undefined ? left : (arrivingPoint(left, to) ?? left);
}

export { atDiamondPoints };
