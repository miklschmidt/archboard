// Convex polygons, clockwise on the page, for the shapes that are not boxes
// (`flowchart-shapes.ts`): the three operations a block of that shape is built
// from. A face is the shape cut by itself lifted (`intersection`), a border runs
// inside an outline and a selection ring outside it (`inset`), and a shadow is
// the shape moved (`translated`).

import { coord, type Point } from "@/transformers/semantic-renderer/lib/geometry";

/** A convex outline, its corners clockwise on the page: the inside is on the right of each side. */
type Polygon = readonly Point[];

/** Less than this is nothing: two sides this near to parallel have no corner between them, two corners this near are one. */
const TINY = 1e-9;

/**
 * The corner of a polygon, rounded: where its curve leaves one side and where
 * it comes into the next, with the corner itself between them.
 * @param before The corner before it.
 * @param corner The corner.
 * @param after The corner after it.
 * @param radius How round the corner is.
 * @returns The two ends of its curve.
 */
function roundedCorner(
	before: Point,
	corner: Point,
	after: Point,
	radius: number,
): { readonly leaves: Point; readonly comes: Point } {
	const back = { x: before.x - corner.x, y: before.y - corner.y };
	const forth = { x: after.x - corner.x, y: after.y - corner.y };
	const lengths = [Math.hypot(back.x, back.y), Math.hypot(forth.x, forth.y)] as const;
	const cosine = (back.x * forth.x + back.y * forth.y) / (lengths[0] * lengths[1]);
	const half = Math.acos(Math.min(Math.max(cosine, -1), 1)) / 2;
	// A curve of this radius takes this much of each side, and no more than half of either.
	const reach = Math.min(radius / Math.tan(half), lengths[0] / 2, lengths[1] / 2);
	return {
		leaves: {
			x: corner.x + (back.x / lengths[0]) * reach,
			y: corner.y + (back.y / lengths[0]) * reach,
		},
		comes: {
			x: corner.x + (forth.x / lengths[1]) * reach,
			y: corner.y + (forth.y / lengths[1]) * reach,
		},
	};
}

/**
 * One point as path data.
 * @param point The point.
 * @param point.x Across.
 * @param point.y Down.
 * @returns Its coordinates.
 */
function at({ x, y }: Point): string {
	return `${coord(x)} ${coord(y)}`;
}

/**
 * A polygon as path data.
 * @param polygon The polygon.
 * @param radius How round its corners are; none for sharp ones.
 * @returns The path.
 */
function polygonPath(polygon: Polygon, radius = 0): string {
	if (radius <= 0) return `M ${polygon.map(at).join(" L ")} Z`;
	const turns = polygon.map((corner, index) => {
		const { leaves, comes } = roundedCorner(
			polygon[(index + polygon.length - 1) % polygon.length]!,
			corner,
			polygon[(index + 1) % polygon.length]!,
			radius,
		);
		return `${index === 0 ? "M" : "L"} ${at(leaves)} Q ${at(corner)} ${at(comes)}`;
	});
	return `${turns.join(" ")} Z`;
}

/**
 * A polygon moved.
 * @param polygon The polygon.
 * @param by How far across and down.
 * @param by.x Across.
 * @param by.y Down.
 * @returns The polygon where it is moved to.
 */
function translated(polygon: Polygon, by: Point): Polygon {
	return polygon.map(({ x, y }) => ({ x: x + by.x, y: y + by.y }));
}

/**
 * Which side of the line from one point to another a point is on.
 * @param from Where the line starts.
 * @param to Where it goes.
 * @param point The point.
 * @returns Positive on the inside of a clockwise polygon's side, negative outside.
 */
function sideOf(from: Point, to: Point, point: Point): number {
	return (to.x - from.x) * (point.y - from.y) - (to.y - from.y) * (point.x - from.x);
}

/**
 * Where the segment between two points on either side of a line crosses it.
 * @param a One point, and which side of the line it is on, as far as it is from it.
 * @param a.at The point.
 * @param a.side How far, and to which side.
 * @param b The other point, the same.
 * @param b.at The point.
 * @param b.side How far, and to which side.
 * @returns The crossing.
 */
function crossing(
	a: { readonly at: Point; readonly side: number },
	b: { readonly at: Point; readonly side: number },
): Point {
	const share = a.side / (a.side - b.side);
	return { x: a.at.x + (b.at.x - a.at.x) * share, y: a.at.y + (b.at.y - a.at.y) * share };
}

/**
 * A polygon cut to one side of a line.
 * @param polygon The polygon.
 * @param from Where the line starts.
 * @param to Where it goes.
 * @returns What lies on its inside.
 */
function cutBy(polygon: Polygon, from: Point, to: Point): Polygon {
	const kept = polygon.flatMap((corner, index) => {
		const before = polygon[(index + polygon.length - 1) % polygon.length]!;
		const now = { at: corner, side: sideOf(from, to, corner) };
		const earlier = { at: before, side: sideOf(from, to, before) };
		const meets = now.side >= 0 !== earlier.side >= 0 ? [crossing(earlier, now)] : [];
		return now.side >= 0 ? [...meets, corner] : meets;
	});
	// A corner that lies on the line is met where it stands: it is one corner, not two.
	return kept.filter((corner, index) => {
		const before = kept[(index + kept.length - 1) % kept.length]!;
		return Math.hypot(corner.x - before.x, corner.y - before.y) > TINY;
	});
}

/**
 * What two convex polygons share.
 * @param polygon The polygon to cut.
 * @param by The polygon to cut it to.
 * @returns The polygon within both.
 */
function intersection(polygon: Polygon, by: Polygon): Polygon {
	return by.reduce((kept, from, index) => cutBy(kept, from, by[(index + 1) % by.length]!), polygon);
}

/**
 * The corner where two lines meet, each given by a point on it and its direction.
 * @param one The first line.
 * @param one.at A point on it.
 * @param one.way Its direction.
 * @param other The second line.
 * @param other.at A point on it.
 * @param other.way Its direction.
 * @returns The corner, or the first line's point where the two run side by side.
 */
function meeting(
	one: { readonly at: Point; readonly way: Point },
	other: { readonly at: Point; readonly way: Point },
): Point {
	const turn = one.way.x * other.way.y - one.way.y * other.way.x;
	if (Math.abs(turn) < TINY) return one.at;
	const along =
		((other.at.x - one.at.x) * other.way.y - (other.at.y - one.at.y) * other.way.x) / turn;
	return { x: one.at.x + one.way.x * along, y: one.at.y + one.way.y * along };
}

/**
 * A polygon with every side moved inward, its corners kept sharp; a negative
 * distance moves them outward.
 * @param polygon The polygon.
 * @param distance How far each side moves.
 * @returns The polygon.
 */
function inset(polygon: Polygon, distance: number): Polygon {
	const sides = polygon.map((from, index) => {
		const to = polygon[(index + 1) % polygon.length]!;
		const length = Math.hypot(to.x - from.x, to.y - from.y);
		const way = { x: (to.x - from.x) / length, y: (to.y - from.y) / length };
		// The inside of a clockwise side is the way turned a quarter turn clockwise.
		return { at: { x: from.x - way.y * distance, y: from.y + way.x * distance }, way };
	});
	return sides.map((side, index) =>
		meeting(sides[(index + sides.length - 1) % sides.length]!, side),
	);
}

export { type Polygon, inset, intersection, polygonPath, translated };
