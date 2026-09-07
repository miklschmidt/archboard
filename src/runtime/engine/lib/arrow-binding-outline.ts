// A bindable shape's outline, grown by the binding's gap, and where a ray
// crosses it.
//
// Rounded rectangles use the pinned Excalidraw 0.18.1 build's corner-radius,
// diagonal gap offsets, cubic corners, and re-hung sides. The sharp
// rectangle, diamond and ellipse branches remain the small analytic forms
// that already match their outlines.

import {
	type Bindable,
	type Cubic,
	type Point,
	type Segment,
	INTERSECTION_PRECISION,
	alongSegment,
	centreOf,
	cornerOffset,
	curveSegmentIntersection,
	halfExtents,
	num,
	roundedCorner,
	rotatePinned,
	segmentIntersection,
} from "@/runtime/engine/lib/arrow-binding-geometry";

const PROPORTIONAL_CORNER_RADIUS = 0.25;
const ADAPTIVE_CORNER_RADIUS = 32;

/**
 * The radius rules used by Excalidraw's three rectangle roundness records:
 * types 1 and 2 are always proportional, type 3 is a fixed radius that falls
 * back to proportional on a shape too small to carry it.
 * @param shape The shape.
 * @returns The corner radius, 0 for a sharp rectangle.
 */
function rectangleCornerRadius(shape: Bindable): number {
	const size = Math.min(Math.abs(num(shape.width)), Math.abs(num(shape.height)));
	const roundness = shape.roundness ?? {};
	if (roundness.type === 1 || roundness.type === 2) {
		return size * PROPORTIONAL_CORNER_RADIUS;
	}
	if (roundness.type !== 3) {
		return 0;
	}
	const fixed = num(roundness.value, ADAPTIVE_CORNER_RADIUS);
	return size <= fixed / PROPORTIONAL_CORNER_RADIUS ? size * PROPORTIONAL_CORNER_RADIUS : fixed;
}

/** A rounded rectangle's outline: four straight sides and four corner curves. */
interface RoundedOutline {
	corners: Cubic[];
	sides: Segment[];
}

/**
 * The outline of a rounded rectangle, pushed out by the binding gap: each
 * corner curve moves along its own diagonal, and the sides are re-hung
 * between the moved corners.
 * @param shape The shape.
 * @param gap How far short of it the arrow stops.
 * @returns The corners and the sides between them.
 */
function roundedOutline(shape: Bindable, gap: number): RoundedOutline {
	const x0 = num(shape.x);
	const y0 = num(shape.y);
	const x1 = x0 + num(shape.width);
	const y1 = y0 + num(shape.height);
	const centre = centreOf(shape);
	const radius = rectangleCornerRadius(shape);
	const top: Segment = [
		{ x: x0 + radius, y: y0 },
		{ x: x1 - radius, y: y0 },
	];
	const right: Segment = [
		{ x: x1, y: y0 + radius },
		{ x: x1, y: y1 - radius },
	];
	const bottom: Segment = [
		{ x: x0 + radius, y: y1 },
		{ x: x1 - radius, y: y1 },
	];
	const left: Segment = [
		{ x: x0, y: y1 - radius },
		{ x: x0, y: y0 + radius },
	];
	const offsets = [
		cornerOffset({ x: x0 - gap, y: y0 - gap }, centre, gap),
		cornerOffset({ x: x1 + gap, y: y0 - gap }, centre, gap),
		cornerOffset({ x: x1 + gap, y: y1 + gap }, centre, gap),
		cornerOffset({ x: x0 - gap, y: y1 + gap }, centre, gap),
	] as const;
	const corners: Cubic[] = [
		roundedCorner(left[1], { x: x0, y: y0 }, top[0], offsets[0]),
		roundedCorner(top[1], { x: x1, y: y0 }, right[0], offsets[1]),
		roundedCorner(right[1], { x: x1, y: y1 }, bottom[1], offsets[2]),
		roundedCorner(bottom[0], { x: x0, y: y1 }, left[0], offsets[3]),
	];
	const sides = corners.map((corner, index): Segment => [
		corner[3],
		corners[(index + 1) % corners.length]![0],
	]);
	return { corners, sides };
}

/**
 * Drop points that repeat one already in the list, which a corner and the
 * side hung off it both produce.
 * @param points The crossings.
 * @returns The first of each cluster, in order.
 */
function distinct(points: readonly Point[]): Point[] {
	return points.filter(
		(point, index) =>
			points.findIndex(
				(other) =>
					Math.abs(point.x - other.x) < INTERSECTION_PRECISION &&
					Math.abs(point.y - other.y) < INTERSECTION_PRECISION,
			) === index,
	);
}

/**
 * Intersections with Excalidraw's rounded rectangle outline. The line is
 * rotated into the shape's own frame rather than the shape being turned, and
 * the crossings are rotated back.
 * @param shape The shape.
 * @param line The line the arrow travels along.
 * @param gap How far short of the shape the arrow stops.
 * @returns The distinct crossings in scene coordinates.
 */
function roundedRectangleIntersections(shape: Bindable, line: Segment, gap: number): Point[] {
	const centre = centreOf(shape);
	const angle = num(shape.angle);
	const { corners, sides } = roundedOutline(shape, gap);
	const rotatedLine: Segment = [
		rotatePinned(line[0], centre, -angle),
		rotatePinned(line[1], centre, -angle),
	];
	const crossed = [
		...sides.map((side) => segmentIntersection(rotatedLine, side)),
		...corners.map((corner) => curveSegmentIntersection(corner, rotatedLine)),
	]
		.filter((point) => point !== null)
		.map((point) => rotatePinned(point, centre, angle));
	return distinct(crossed);
}

/**
 * Is this point inside the shape's outline, grown by `gap`? The point is in
 * the shape's own unrotated frame with its centre at the origin.
 * @param shape The shape.
 * @param local The point.
 * @param gap How far the outline is grown by.
 * @returns True when the point is within the grown outline.
 */
function inside(shape: Bindable, local: Point, gap: number): boolean {
	const { a, b } = halfExtents(shape, gap);
	if (a <= 0 || b <= 0) {
		return false;
	}
	const px = Math.abs(local.x);
	const py = Math.abs(local.y);
	if (shape.type === "ellipse") {
		return (px / a) ** 2 + (py / b) ** 2 <= 1;
	}
	if (shape.type === "diamond") {
		return px / a + py / b <= 1;
	}
	return px <= a && py <= b;
}

/**
 * Where a ray crosses an ellipse, solving the quadratic in the ray's
 * parameter.
 * @param origin Where the ray starts.
 * @param direction The ray's direction.
 * @param a The ellipse's half-width.
 * @param b Its half-height.
 * @returns Both roots, or none when the ray misses or has no direction.
 */
function ellipseCrossings(origin: Point, direction: Point, a: number, b: number): number[] {
	const qa = (direction.x / a) ** 2 + (direction.y / b) ** 2;
	const qb = 2 * ((origin.x * direction.x) / a ** 2 + (origin.y * direction.y) / b ** 2);
	const qc = (origin.x / a) ** 2 + (origin.y / b) ** 2 - 1;
	const disc = qb * qb - 4 * qa * qc;
	if (qa === 0 || disc < 0) {
		return [];
	}
	const root = Math.sqrt(disc);
	return [(-qb - root) / (2 * qa), (-qb + root) / (2 * qa)];
}

/**
 * Where a ray crosses a diamond, which is its four edges.
 * @param origin Where the ray starts.
 * @param direction The ray's direction.
 * @param a The diamond's half-width.
 * @param b Its half-height.
 * @returns The crossings, in edge order.
 */
function diamondCrossings(origin: Point, direction: Point, a: number, b: number): number[] {
	const vertices: Point[] = [
		{ x: 0, y: -b },
		{ x: a, y: 0 },
		{ x: 0, y: b },
		{ x: -a, y: 0 },
	];
	const found: number[] = [];
	for (const [i, vertex] of vertices.entries()) {
		const t = alongSegment(origin, direction, vertex, vertices[(i + 1) % vertices.length]!);
		if (t !== null) {
			found.push(t);
		}
	}
	return found;
}

/**
 * Where a ray crosses a rectangle, and everything Excalidraw treats as one:
 * an image, a frame, a standalone text, an embed. Slabs, so a ray parallel to
 * an edge simply misses it.
 * @param origin Where the ray starts.
 * @param direction The ray's direction.
 * @param a The rectangle's half-width.
 * @param b Its half-height.
 * @returns The crossings, in axis order.
 */
function rectangleCrossings(origin: Point, direction: Point, a: number, b: number): number[] {
	const found: number[] = [];
	for (const [o, d, half, otherO, otherD, otherHalf] of [
		[origin.x, direction.x, a, origin.y, direction.y, b],
		[origin.y, direction.y, b, origin.x, direction.x, a],
	] as const) {
		if (d === 0) {
			continue;
		}
		for (const edge of [-half, half]) {
			const t = (edge - o) / d;
			if (Math.abs(otherO + t * otherD) <= otherHalf + 1e-9) {
				found.push(t);
			}
		}
	}
	return found;
}

/**
 * How far along the ray the outline is, for every crossing in front of the
 * origin. Distances are in units of the ray's direction vector.
 *
 * Everything is in the shape's own unrotated frame with its centre at the
 * origin, which is how a rotated shape is handled: the ray is rotated back
 * instead of the shape being turned.
 * @param shape The shape.
 * @param origin Where the ray starts, relative to the shape's centre.
 * @param direction The ray's direction.
 * @param gap How far the outline is grown by.
 * @returns The crossings ahead of the origin, nearest first.
 */
function crossings(shape: Bindable, origin: Point, direction: Point, gap: number): number[] {
	const { a, b } = halfExtents(shape, gap);
	if (a <= 0 || b <= 0) {
		return [];
	}
	const found = crossingsFor(shape, origin, direction, a, b);
	return found.filter((t) => Number.isFinite(t) && t >= 0).toSorted((p, q) => p - q);
}

/**
 * The crossings of whichever outline the shape's type names.
 * @param shape The shape.
 * @param origin Where the ray starts, relative to the shape's centre.
 * @param direction The ray's direction.
 * @param a The outline's half-width.
 * @param b Its half-height.
 * @returns The crossings, unfiltered.
 */
function crossingsFor(
	shape: Bindable,
	origin: Point,
	direction: Point,
	a: number,
	b: number,
): number[] {
	if (shape.type === "ellipse") {
		return ellipseCrossings(origin, direction, a, b);
	}
	if (shape.type === "diamond") {
		return diamondCrossings(origin, direction, a, b);
	}
	return rectangleCrossings(origin, direction, a, b);
}

export { crossings, inside, rectangleCornerRadius, roundedRectangleIntersections };
