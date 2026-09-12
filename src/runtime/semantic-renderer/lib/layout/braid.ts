// Which trunk groups actually braid.
//
// Forked from PR Lens's `layout/edges.ts`. Judged on the geometry that was
// drawn rather than predicted from endpoints: a predicate on endpoints either
// rejects fans whose lines never come near each other, or — once the port is
// shared — never fires at all. Touching at a shared point is not a crossing;
// running along one another is.

import { EPSILON } from "@/runtime/semantic-renderer/lib/layout/curves";
import type { Point } from "@/runtime/semantic-renderer/lib/geometry";

/**
 * A polyline as its consecutive pairs of points.
 * @param points The polyline.
 * @returns Each segment as its two ends.
 */
function segmentsOf(points: readonly Point[]): [Point, Point][] {
	const pairs: [Point, Point][] = [];
	for (let index = 0; index + 1 < points.length; index += 1) {
		const a = points[index];
		const b = points[index + 1];
		if (a !== undefined && b !== undefined) {
			pairs.push([a, b]);
		}
	}
	return pairs;
}

/**
 * Whether a horizontal segment and a vertical one properly cross, rather than
 * merely touching at an end.
 * @param h1 One end of the horizontal segment.
 * @param h2 Its other end.
 * @param v1 One end of the vertical segment.
 * @param v2 Its other end.
 * @returns True when they cross.
 */
function crossesPerpendicular(h1: Point, h2: Point, v1: Point, v2: Point): boolean {
	return (
		Math.min(h1.x, h2.x) + EPSILON < v1.x &&
		v1.x < Math.max(h1.x, h2.x) - EPSILON &&
		Math.min(v1.y, v2.y) + EPSILON < h1.y &&
		h1.y < Math.max(v1.y, v2.y) - EPSILON
	);
}

/**
 * Whether two intervals share more than a point.
 * @param a1 One end of the first interval.
 * @param a2 Its other end.
 * @param b1 One end of the second.
 * @param b2 Its other end.
 * @returns True when they overlap.
 */
function overlaps(a1: number, a2: number, b1: number, b2: number): boolean {
	const high = Math.min(Math.max(a1, a2), Math.max(b1, b2));
	const low = Math.max(Math.min(a1, a2), Math.min(b1, b2));
	return high - low > EPSILON;
}

/**
 * Proper crossing or collinear overlap of two axis-aligned segments.
 * @param a1 One end of the first segment.
 * @param a2 Its other end.
 * @param b1 One end of the second.
 * @param b2 Its other end.
 * @returns True when the two segments are not merely touching.
 */
function segmentsCross(a1: Point, a2: Point, b1: Point, b2: Point): boolean {
	const aHorizontal = Math.abs(a1.y - a2.y) < EPSILON;
	const bHorizontal = Math.abs(b1.y - b2.y) < EPSILON;
	if (aHorizontal !== bHorizontal) {
		const [h1, h2, v1, v2] = aHorizontal ? [a1, a2, b1, b2] : [b1, b2, a1, a2];
		return crossesPerpendicular(h1, h2, v1, v2);
	}
	if (aHorizontal) {
		return Math.abs(a1.y - b1.y) <= EPSILON && overlaps(a1.x, a2.x, b1.x, b2.x);
	}
	return Math.abs(a1.x - b1.x) <= EPSILON && overlaps(a1.y, a2.y, b1.y, b2.y);
}

/**
 * Whether two polylines cross anywhere.
 * @param a One polyline.
 * @param b The other.
 * @returns True when any of their segments cross.
 */
function polylinesCross(a: readonly Point[], b: readonly Point[]): boolean {
	for (const [a1, a2] of segmentsOf(a)) {
		for (const [b1, b2] of segmentsOf(b)) {
			if (segmentsCross(a1, a2, b1, b2)) {
				return true;
			}
		}
	}
	return false;
}

/**
 * Whether any two members of one group cross.
 * @param members Each member's waypoints.
 * @returns True when the group braids.
 */
function groupBraids(members: readonly Point[][]): boolean {
	for (let a = 0; a < members.length; a += 1) {
		for (let b = a + 1; b < members.length; b += 1) {
			if (polylinesCross(members[a] ?? [], members[b] ?? [])) {
				return true;
			}
		}
	}
	return false;
}

/**
 * The trunk groups whose members run along one another and so should be routed
 * again without a shared stem.
 * @param branches Each trunk's members, minus the shared head segment.
 * @returns The keys of the groups that braid.
 */
function braidingTrunks(branches: ReadonlyMap<string, Point[][]>): Set<string> {
	const braiding = new Set<string>();
	for (const [key, members] of branches) {
		if (members.length >= 2 && groupBraids(members)) {
			braiding.add(key);
		}
	}
	return braiding;
}

export { braidingTrunks };
