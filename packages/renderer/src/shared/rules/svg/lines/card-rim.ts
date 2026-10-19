// How long a pulse is held in a card (ADR 0027).
//
// A pulse that sinks into a card takes the shorter way round the card's edge to
// the place the next line leaves, and nothing of it is drawn there: the card holds
// it for as long as that takes, so the line out lies the line in by the way round.
// The edge is walked as a ring of short straight pieces: a corner's quarter turn is
// a few of them, which is as far from the drawn arc as a hairline.
import { CARD_RADIUS } from "#shared/constants/design.ts";
import type { Box, Point } from "#shared/rules/geometry.ts";

/** How many straight pieces walk a quarter turn of a corner. */
const CORNER_PIECES = 3;

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
 * How far the shorter way round the edge of a card is from one place to another.
 * @param box The card.
 * @param from Where the pulse comes in: the end of a line, on the card.
 * @param to Where it leaves: the start of a line, on the card.
 * @returns The distance, never more than halfway round.
 */
function rimLength(box: Box, from: Point, to: Point): number {
	const ring = ringOf(box);
	const forward =
		(((locate(ring, to) - locate(ring, from)) % ring.length) + ring.length) % ring.length;
	return Math.min(forward, ring.length - forward);
}

export { rimLength };
