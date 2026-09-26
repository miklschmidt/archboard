// Where a stream's comets rest: the still picture, and the moment its clock
// starts. Labels are drawn over the comets, so a comet resting where a label's
// border cuts its glow reads as a blob stuck to the label; each stream starts
// its clock where none does.
import { inflate, type Box, type Point } from "@/transformers/semantic-renderer/lib/geometry";
import {
	curveBounds,
	pointOnSegment,
	segmentStart,
	type Curve,
} from "@/transformers/semantic-renderer/lib/layout/curves";

/** The air a resting comet's glow keeps from a label's border. */
const LABEL_AIR = 2;

/** How finely a resting place is chosen along its route, in diagram units. */
const REST_STEP = 0.5;

/** How many chords stand for a rounded piece of route. */
const CHORDS = 16;

/**
 * How a resting comet's glow meets the labels drawn over it: clear of them,
 * wholly under one, or cut by a label's border.
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
 * How the labels drawn over a comet meet its glow at one place.
 * @param point Where the comet's head is.
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
 * How badly the comets of one stream would rest at one place: every head a
 * label cuts outweighs every head one hides.
 * @param covers How the labels meet a glow at each traced point of the route.
 * @param rest How far along the route the first head rests.
 * @param spacing How far apart the heads are.
 * @returns The weight: lower is better, and 0 is every head clear.
 */
function restWeight(covers: readonly number[], rest: number, spacing: number): number {
	let weight = 0;
	for (let along = rest; along / REST_STEP < covers.length; along += spacing) {
		const cover = covers[Math.round(along / REST_STEP)] ?? COVER.clear;
		weight += cover === COVER.cut ? covers.length : cover;
	}
	return weight;
}

/**
 * Where the first comet of a stream rests along the route it rides: half a
 * spacing from its start, unless a label drawn over the comets would cut a
 * resting comet's glow there, when the nearest place none does, or failing
 * that the place fewest do. It stays at least a glow from where the route
 * starts and from where the comet behind would rest, so a still picture shows
 * whole comets, never one's glow alone at the card it leaves.
 * @param ride The route the comets ride.
 * @param spacing How far apart the comets travel.
 * @param glow The radius of a comet's glow.
 * @param labels The labels drawn over the comets.
 * @returns How far along the route the first comet's head rests.
 */
function restingPlace(ride: Curve, spacing: number, glow: number, labels: readonly Box[]): number {
	const half = spacing / 2;
	const reach = inflate(curveBounds(ride), glow + LABEL_AIR);
	const near = labels.filter((label) => overlaps(label, reach));
	if (near.length === 0 || spacing < glow * 2) return half;
	const covers = traced(ride).map((point) => coverAt(point, glow, near));
	let best = { rest: half, weight: Number.POSITIVE_INFINITY };
	for (const rest of nearestFirst(half, glow, (covers.length - 1) * REST_STEP)) {
		const weight = restWeight(covers, rest, spacing);
		if (weight < best.weight) best = { rest, weight };
		if (best.weight === 0) break;
	}
	return best.rest;
}

/**
 * The places a stream's first comet may rest, nearest half a spacing first:
 * at least a glow from the route's start and from where the comet behind
 * rests, and on the route. A route shorter than half a spacing rests no
 * comet on it wherever its clock starts, so it keeps half a spacing.
 * @param half Half the spacing between comets.
 * @param glow The radius of a comet's glow.
 * @param length How long the route is.
 * @returns The places, in the order they are tried.
 */
function nearestFirst(half: number, glow: number, length: number): number[] {
	if (half > length) return [half];
	const places: number[] = [];
	for (let away = REST_STEP; away <= half - glow; away += REST_STEP) {
		places.push(half - away, half + away);
	}
	return [half, ...places.filter((place) => place <= length)];
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
