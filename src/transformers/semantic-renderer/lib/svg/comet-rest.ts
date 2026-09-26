// Where a line's traffic rests: the one streak a still picture shows on it.
// Labels are drawn over the traffic, so a streak resting where a label's border
// cuts its glow reads as a blob stuck to the label; it rests where none does.
import { inflate, type Box, type Point } from "@/transformers/semantic-renderer/lib/geometry";
import {
	curveBounds,
	pointOnSegment,
	segmentStart,
	type Curve,
} from "@/transformers/semantic-renderer/lib/layout/curves";

/** The air a resting streak's glow keeps from a label's border. */
const LABEL_AIR = 2;

/** How finely a resting place is chosen along its route, in diagram units. */
const REST_STEP = 0.5;

/** How many chords stand for a rounded piece of route. */
const CHORDS = 16;

/**
 * How a resting streak's glow meets the labels drawn over it: clear of them,
 * wholly under one, or cut by a label's border. Lower is better.
 */
const COVER = { clear: 0, hidden: 1, cut: 2 } as const;

/**
 * Whether a point lies inside a box.
 * @param box The box.
 * @param point The point.
 * @returns Whether it does.
 */
function holds(box: Box, point: Point): boolean {
	return (
		point.x > box.x &&
		point.x < box.x + box.width &&
		point.y > box.y &&
		point.y < box.y + box.height
	);
}

/**
 * How the labels drawn over a streak meet its glow at one place.
 * @param point Where the streak's head is.
 * @param glow The glow's radius.
 * @param labels The labels drawn over it.
 * @returns How much of the glow they take: clear, hidden or cut.
 */
function coverAt(point: Point, glow: number, labels: readonly Box[]): number {
	let cover: number = COVER.clear;
	for (const label of labels) {
		if (holds(inflate(label, -glow), point)) cover = Math.max(cover, COVER.hidden);
		else if (holds(inflate(label, glow + LABEL_AIR), point)) return COVER.cut;
	}
	return cover;
}

/**
 * The route as a line of short straight pieces, a rounded piece in chords.
 * @param curve The route.
 * @returns The points it passes through, in order.
 */
function polyline(curve: Curve): Point[] {
	return [
		curve.from,
		...curve.segments.flatMap((segment, index) => {
			const from = segmentStart(curve, index);
			if (segment.kind === "line") return [segment.to];
			return Array.from({ length: CHORDS }, (_, step) =>
				pointOnSegment(from, segment, (step + 1) / CHORDS),
			);
		}),
	];
}

/**
 * Points every {@link REST_STEP} along a route, from its start to its end.
 * @param curve The route.
 * @returns The points: the one at index `i` lies `i * REST_STEP` along it.
 */
function traced(curve: Curve): Point[] {
	const points = polyline(curve);
	const marks: Point[] = [curve.from];
	let behind = 0;
	for (let index = 1; index < points.length; index += 1) {
		const from = points[index - 1]!;
		const to = points[index]!;
		const length = Math.hypot(to.x - from.x, to.y - from.y);
		for (let along = REST_STEP * marks.length - behind; along <= length; along += REST_STEP) {
			const t = along / length;
			marks.push({ x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t });
		}
		behind += length;
	}
	return marks;
}

/**
 * Where a line's resting streak puts its head along the route it rides: half
 * way, unless a label drawn over the traffic would cut the head's glow there,
 * when the nearest place none does, or failing that the nearest place a label
 * hides it wholly. It stays at least a glow from both ends of the route, so a
 * still picture shows a whole streak, never a glow alone at a card; a route
 * too short for that rests its streak just before its start, where none of it
 * shows.
 * @param ride The route the traffic rides.
 * @param length How long that route is.
 * @param glow The radius of a streak's glow.
 * @param labels The labels drawn over the traffic.
 * @returns How far along the route the resting head is.
 */
function restingPlace(ride: Curve, length: number, glow: number, labels: readonly Box[]): number {
	const half = length / 2;
	if (half < glow) return -glow;
	const reach = inflate(curveBounds(ride), glow + LABEL_AIR);
	const near = labels.filter((label) => overlaps(label, reach));
	if (near.length === 0) return half;
	return leastCovered(traced(ride), nearestFirst(half, glow), glow, near);
}

/**
 * The first of some places where the labels leave a streak's glow clear, or
 * failing that the first where they cover it least.
 * @param points Points every {@link REST_STEP} along the route.
 * @param places The places to try, in order.
 * @param glow The radius of a streak's glow.
 * @param labels The labels drawn over the traffic.
 * @returns The place.
 */
function leastCovered(
	points: readonly Point[],
	places: readonly number[],
	glow: number,
	labels: readonly Box[],
): number {
	let best = { rest: places[0]!, cover: Number.POSITIVE_INFINITY };
	for (const rest of places) {
		const point = points[Math.round(rest / REST_STEP)];
		const cover = point === undefined ? COVER.clear : coverAt(point, glow, labels);
		if (cover < best.cover) best = { rest, cover };
		if (best.cover === COVER.clear) break;
	}
	return best.rest;
}

/**
 * The places a resting head may be, nearest half way first: at least a glow
 * from both ends of the route.
 * @param half Half the route's length.
 * @param glow The radius of a streak's glow.
 * @returns The places, in the order they are tried.
 */
function nearestFirst(half: number, glow: number): number[] {
	const places = [half];
	for (let away = REST_STEP; away <= half - glow; away += REST_STEP) {
		places.push(half - away, half + away);
	}
	return places;
}

/**
 * Whether two boxes share any area.
 * @param a One box.
 * @param b The other.
 * @returns Whether they do.
 */
function overlaps(a: Box, b: Box): boolean {
	return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}

export { restingPlace };
