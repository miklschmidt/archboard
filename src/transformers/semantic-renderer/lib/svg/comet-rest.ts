// Where a line's traffic rests: the one streak a still picture shows on it.
// Labels are drawn over the traffic, so a streak resting where a label's border
// cuts its glow reads as a blob stuck to the label; it rests where none does.
// A streak whose glow merely clears a label still reads as stuck to it: Agent
// workbench's "turn/start when idle" rested 2 px above its own label, and
// Board rasterizer's "CDP over a WebSocket" rested below its label with its
// tail running up out of the label's border. So a streak, its head and the
// body of its tail, rests a lane from every label where its line has room, as
// a line keeps a lane from another. So it does from where another line meets
// its own: a streak on a crossing's hop ("renderBoard on the core" in Semantic
// renderer), or past a junction dot on the stretch two lines share into one
// card ("requestJson" in Command interface), reads as either line's traffic.
// Where its line has no such room, the streak rests where it keeps the most:
// "board operation" in Command interface's "What the CLI can be asked" came
// to rest touching a junction dot, beside a place 20 px clear of it.
import type { PaintedDrawing } from "@/transformers/semantic-renderer/lib/drawing";
import { inflate, type Box, type Point } from "@/transformers/semantic-renderer/lib/geometry";
import { ROUTE_LANE } from "@/transformers/semantic-renderer/lib/layout/routing-clearance";
import {
	curveBounds,
	pointOnSegment,
	segmentStart,
	type Curve,
} from "@/transformers/semantic-renderer/lib/layout/curves";
import { joinRoutes, sharedStretches } from "@/transformers/semantic-renderer/lib/svg/junctions";

/** The air a resting streak's glow keeps from a label's border. */
const LABEL_AIR = 2;

/** How finely a resting place is chosen along its route, in diagram units. */
const REST_STEP = 0.5;

/** How many chords stand for a rounded piece of route. */
const CHORDS = 16;

/**
 * How a resting streak's glow meets the labels drawn over it: a lane or more
 * from every one and from every place another line meets its own, clear of
 * the labels, wholly under one, or cut by a label's border. Lower is better;
 * short of a lane, a streak with more room reads better at each.
 */
const COVER = { apart: 0, clear: 1, hidden: 2, cut: 3 } as const;

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

/** A resting streak as the labels over it are judged against. */
interface Streak {
	/** The radius of its glow. */
	readonly glow: number;
	/** How far behind its head its tail reads as its body. */
	readonly body: number;
}

/** What a resting streak keeps clear of. */
interface Around {
	/** Every relationship's label, drawn over the traffic. */
	readonly labels: readonly Box[];
	/** The hops and stretches where another line meets the streak's own. */
	readonly met: readonly Box[];
}

/**
 * How far a point stands outside a box, along the axis it stands furthest off
 * on, as a box grown by that much would reach it.
 * @param box The box.
 * @param point The point.
 * @returns The distance, negative inside the box.
 */
function outside(box: Box, point: Point): number {
	return Math.max(
		box.x - point.x,
		point.x - box.x - box.width,
		box.y - point.y,
		point.y - box.y - box.height,
	);
}

/**
 * How the labels drawn over a streak meet its head.
 * @param head Where the head rests.
 * @param glow The radius of its glow.
 * @param labels The labels drawn over it.
 * @returns Clear, hidden or cut.
 */
function labelCover(head: Point, glow: number, labels: readonly Box[]): number {
	let cover: number = COVER.clear;
	for (const label of labels) {
		if (holds(inflate(label, -glow), head)) cover = COVER.hidden;
		else if (holds(inflate(label, glow + LABEL_AIR), head)) return COVER.cut;
	}
	return cover;
}

/**
 * How the labels drawn over a streak and the places other lines meet its own
 * meet it with its head at one place: apart when its head and body keep a
 * lane from all of them, else how its head meets the labels, the less room
 * the streak keeps the worse within each.
 * @param points Points every {@link REST_STEP} along the route.
 * @param at The index of the head's point.
 * @param streak The streak.
 * @param around The labels drawn over it and the places other lines meet its line.
 * @returns How much of it they take: apart, clear, hidden or cut, with a share for its room.
 */
function coverAt(points: readonly Point[], at: number, streak: Streak, around: Around): number {
	const { glow, body } = streak;
	const head = points[at];
	if (head === undefined) return COVER.apart;
	const boxes = [...around.labels, ...around.met];
	const behind = points.slice(Math.max(0, at - Math.round(body / REST_STEP)), at + 1);
	const room =
		Math.min(...behind.flatMap((point) => boxes.map((box) => outside(box, point)))) - glow;
	if (room >= ROUTE_LANE) return COVER.apart;
	return labelCover(head, glow, around.labels) + (ROUTE_LANE - Math.max(room, 0)) / ROUTE_LANE / 2;
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
 * way, unless a label drawn over the traffic or a place another line meets
 * this one stands within a lane of the streak there, when the nearest place
 * none does; failing that the place no label's border cuts the head's glow
 * where the streak keeps the most room; and failing that the place a label
 * hides it wholly. It stays at least a glow from both ends of the route, so a
 * still picture shows a whole streak, never a glow alone at a card; a route
 * too short for that rests its streak just before its start, where none of it
 * shows.
 * @param ride The route the traffic rides.
 * @param length How long that route is.
 * @param streak The streak's glow and the body of its tail.
 * @param around The labels drawn over the traffic and the places other lines meet its line.
 * @returns How far along the route the resting head is.
 */
function restingPlace(ride: Curve, length: number, streak: Streak, around: Around): number {
	const half = length / 2;
	if (half < streak.glow) return -streak.glow;
	const reach = inflate(curveBounds(ride), streak.glow + ROUTE_LANE);
	const near = {
		labels: around.labels.filter((label) => overlaps(label, reach)),
		met: around.met.filter((box) => overlaps(box, reach)),
	};
	if (near.labels.length + near.met.length === 0) return half;
	return leastCovered(traced(ride), nearestFirst(half, streak.glow), streak, near);
}

/**
 * The first of some places where the labels and the places other lines meet
 * leave a streak a lane clear, or failing that the first where they cover it
 * least ({@link coverAt}).
 * @param points Points every {@link REST_STEP} along the route.
 * @param places The places to try, in order.
 * @param streak The streak.
 * @param around The labels drawn over the traffic and the places other lines meet its line.
 * @returns The place.
 */
function leastCovered(
	points: readonly Point[],
	places: readonly number[],
	streak: Streak,
	around: Around,
): number {
	let best = { rest: places[0]!, cover: Number.POSITIVE_INFINITY };
	for (const rest of places) {
		const cover = coverAt(points, Math.round(rest / REST_STEP), streak, around);
		if (cover < best.cover) best = { rest, cover };
		if (best.cover === COVER.apart) break;
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

/**
 * Where other lines meet each line of a drawing: the hops it carries or
 * passes under, and the stretches it shares with another line as one stroke.
 * @param drawing The drawing as painted.
 * @returns The places, by relationship id.
 */
function meetingPlaces(drawing: PaintedDrawing): ReadonlyMap<string, readonly Box[]> {
	const shared = sharedStretches(joinRoutes(drawing.edges, () => 1));
	const { bridges } = drawing.bridged;
	return new Map(
		drawing.edges.map(({ edge }, index) => [
			edge.id,
			[
				...shared[index]!,
				...bridges
					.filter(({ edgeId, under }) => edgeId === edge.id || under.includes(edge.id))
					.map(({ curve }) => curveBounds(curve)),
			],
		]),
	);
}

export { meetingPlaces, restingPlace, type Around, type Streak };
