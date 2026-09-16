import { type Box, type Point } from "@/transformers/semantic-renderer/lib/geometry";
import {
	curveBounds,
	segmentStart,
	type Curve,
	type Segment,
} from "@/transformers/semantic-renderer/lib/layout/curves";

/**
 * Halfway between two control points for exact de Casteljau subdivision.
 * @param a First point.
 * @param b Second point.
 * @returns Their midpoint.
 */
function midpoint(a: Point, b: Point): Point {
	return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

/**
 * Conservative local bounds distinguish a curve from empty space in its hull.
 * Subdivision never approximates the curve or permits an unchecked collision.
 * @param from Segment start.
 * @param segment Segment to bound.
 * @param depth Remaining refinements; unresolved overlaps remain obstructed.
 * @returns Boxes that together enclose the entire segment.
 */
function segmentBoxes(from: Point, segment: Segment, depth: number): Box[] {
	if (segment.kind === "line" || depth === 0) return [curveBounds({ from, segments: [segment] })];
	const a = midpoint(from, segment.first);
	const b = midpoint(segment.first, segment.second);
	const c = midpoint(segment.second, segment.to);
	const d = midpoint(a, b);
	const e = midpoint(b, c);
	const middle = midpoint(d, e);
	return [
		...segmentBoxes(from, { kind: "cubic", first: a, second: d, to: middle }, depth - 1),
		...segmentBoxes(middle, { kind: "cubic", first: e, second: c, to: segment.to }, depth - 1),
	];
}

/**
 * Refine cubic hulls only for the bridge pass's nearby-obstruction checks.
 * @param curve The ink being checked.
 * @returns Conservative bounds for small pieces of the curve.
 */
function curveBoxes(curve: Curve): Box[] {
	return curve.segments.flatMap((segment, index) =>
		segmentBoxes(segmentStart(curve, index), segment, 4),
	);
}

export { curveBoxes };
