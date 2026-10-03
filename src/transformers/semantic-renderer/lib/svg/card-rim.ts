// The way around the edge of a card (ADR 0027).
//
// A pulse that sinks into a card runs the card's edge, the shorter way round, to
// the place the next line leaves, so it never crosses what the card says. The
// edge is walked as a ring of short straight pieces: a corner's quarter turn is
// a few of them, which is as far from the drawn arc as a hairline.
import { CARD_RADIUS } from "@/transformers/semantic-renderer/lib/design";
import { coord, type Box, type Point } from "@/transformers/semantic-renderer/lib/geometry";
import type { Curve } from "@/transformers/semantic-renderer/lib/layout/curves";

/** How many straight pieces walk a quarter turn of a corner. */
const CORNER_PIECES = 3;

/** The way from one place on a card's edge to another. */
interface Rim {
	/** The way, as a route. */
	readonly curve: Curve;
	/** The way, as path data. */
	readonly path: string;
	/** How long it is. */
	readonly length: number;
}

/** A card's edge, walked clockwise from where its top edge begins. */
interface Ring {
	readonly points: readonly Point[];
	/** How far along the ring each point is. */
	readonly along: readonly number[];
	/** How long the whole ring is. */
	readonly length: number;
}

/**
 * The points of a quarter turn of a corner, after the one it starts at.
 * @param centre The corner's centre.
 * @param radius The corner's radius.
 * @param from The angle it starts at, in quarter turns.
 * @returns The points, the last at the end of the turn.
 */
function corner(centre: Point, radius: number, from: number): Point[] {
	return Array.from({ length: CORNER_PIECES }, (_, step) => {
		const angle = ((from + (step + 1) / CORNER_PIECES) * Math.PI) / 2;
		return { x: centre.x + radius * Math.cos(angle), y: centre.y + radius * Math.sin(angle) };
	});
}

/**
 * A card's edge as a ring of points.
 * @param box The card.
 * @returns The ring.
 */
function ringOf(box: Box): Ring {
	const r = Math.min(CARD_RADIUS, box.width / 2, box.height / 2);
	const { x, y, width, height } = box;
	const points: Point[] = [
		{ x: x + r, y },
		{ x: x + width - r, y },
		...corner({ x: x + width - r, y: y + r }, r, -1),
		{ x: x + width, y: y + height - r },
		...corner({ x: x + width - r, y: y + height - r }, r, 0),
		{ x: x + r, y: y + height },
		...corner({ x: x + r, y: y + height - r }, r, 1),
		{ x, y: y + r },
		...corner({ x: x + r, y: y + r }, r, 2),
	];
	// The last corner ends where the ring began.
	points.pop();
	const along: number[] = [0];
	points.forEach((point, index) => {
		const next = points[(index + 1) % points.length]!;
		along.push(along[index]! + Math.hypot(next.x - point.x, next.y - point.y));
	});
	const length = along.pop()!;
	return { points, along, length };
}

/**
 * How far along the ring the place nearest a point is.
 * @param ring The ring.
 * @param point The point.
 * @returns The distance along the ring.
 */
function locate(ring: Ring, point: Point): number {
	let best = { gap: Number.POSITIVE_INFINITY, at: 0 };
	ring.points.forEach((from, index) => {
		const to = ring.points[(index + 1) % ring.points.length]!;
		const dx = to.x - from.x;
		const dy = to.y - from.y;
		const size = dx * dx + dy * dy;
		const t =
			size === 0
				? 0
				: Math.min(Math.max(((point.x - from.x) * dx + (point.y - from.y) * dy) / size, 0), 1);
		const gap = Math.hypot(from.x + dx * t - point.x, from.y + dy * t - point.y);
		if (gap < best.gap) best = { gap, at: ring.along[index]! + t * Math.sqrt(size) };
	});
	return best.at;
}

/**
 * The point a distance along the ring.
 * @param ring The ring.
 * @param distance How far, held to one turn.
 * @returns The point.
 */
function pointAlong(ring: Ring, distance: number): Point {
	const at = ((distance % ring.length) + ring.length) % ring.length;
	const index = Math.max(
		0,
		ring.along.findLastIndex((along) => along <= at),
	);
	const from = ring.points[index]!;
	const to = ring.points[(index + 1) % ring.points.length]!;
	const size = Math.hypot(to.x - from.x, to.y - from.y);
	const t = size === 0 ? 0 : (at - ring.along[index]!) / size;
	return { x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t };
}

/**
 * The shorter way round the edge of a card from one place to another.
 * @param box The card.
 * @param from Where the pulse comes in: the end of a line, on the card.
 * @param to Where it leaves: the start of a line, on the card.
 * @returns The way and its length.
 */
function rimRoute(box: Box, from: Point, to: Point): Rim {
	const ring = ringOf(box);
	const start = locate(ring, from);
	const forward = (((locate(ring, to) - start) % ring.length) + ring.length) % ring.length;
	const clockwise = forward <= ring.length - forward;
	const length = clockwise ? forward : ring.length - forward;
	const direction = clockwise ? 1 : -1;
	// The ring's own points the way passes, nearest first.
	const between = ring.points
		.map((point, index) => ({
			point,
			reach:
				(((direction * (ring.along[index]! - start)) % ring.length) + ring.length) % ring.length,
		}))
		.filter(({ reach }) => reach > 1e-6 && reach < length - 1e-6)
		.toSorted((a, b) => a.reach - b.reach)
		.map(({ point }) => point);
	const way = [pointAlong(ring, start), ...between, pointAlong(ring, start + direction * length)];
	return {
		curve: { from: way[0]!, segments: way.slice(1).map((point) => ({ kind: "line", to: point })) },
		path: way
			.map(({ x, y }, index) => `${index === 0 ? "M" : "L"}${coord(x)},${coord(y)}`)
			.join(" "),
		length,
	};
}

export { rimRoute, type Rim };
