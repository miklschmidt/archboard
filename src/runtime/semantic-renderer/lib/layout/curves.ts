// A route's shape: the polyline the planner produced, rounded at its turns,
// and the handful of questions the painter and the label pass ask of it.
//
// Forked from PR Lens's `layout/edges.ts`, which was one 1061-line file. Split
// here along its real seams: this is the geometry of a drawn route, with no
// opinion about which gaps the route travelled through.

import {
	APPROACH_STRAIGHT,
	BEND_RADIUS_MAX,
	BRIDGE_RADIUS,
	BRIDGE_CLEARANCE,
} from "@/runtime/semantic-renderer/lib/design";
import { coord, type Box, type Point } from "@/runtime/semantic-renderer/lib/geometry";

/** One piece of a route. */
type Segment =
	| { readonly kind: "line"; readonly to: Point }
	| {
			readonly kind: "cubic";
			readonly first: Point;
			readonly second: Point;
			readonly to: Point;
	  };

/**
 * A route, kept as its own segments rather than as a path string, because the
 * label pill has to be placed on a point of it after the fact.
 */
interface Curve {
	/** Where the route starts. */
	readonly from: Point;
	/** Every piece of it, in order. */
	readonly segments: readonly Segment[];
}

const ORIGIN: Point = { x: 0, y: 0 };
const EPSILON = 0.01;
const KAPPA = 0.5523;

/**
 * Where one segment of a route begins.
 * @param curve The route.
 * @param index Which segment.
 * @returns The segment's start point.
 */
function segmentStart(curve: Curve, index: number): Point {
	return index === 0 ? curve.from : (curve.segments[index - 1]?.to ?? curve.from);
}

/**
 * A point partway along one segment.
 * @param from Where the segment starts.
 * @param segment The segment.
 * @param t How far along, from 0 to 1.
 * @returns The point.
 */
function pointOnSegment(from: Point, segment: Segment, t: number): Point {
	if (segment.kind === "line") {
		return { x: from.x + (segment.to.x - from.x) * t, y: from.y + (segment.to.y - from.y) * t };
	}
	const inverse = 1 - t;
	const weights = [inverse ** 3, 3 * inverse ** 2 * t, 3 * inverse * t ** 2, t ** 3];
	const points = [from, segment.first, segment.second, segment.to];
	return {
		x: points.reduce((sum, point, index) => sum + point.x * (weights[index] ?? 0), 0),
		y: points.reduce((sum, point, index) => sum + point.y * (weights[index] ?? 0), 0),
	};
}

/**
 * A point at `t` of the whole route, with every segment weighted equally.
 * @param curve The route.
 * @param t How far along, from 0 to 1.
 * @returns The point.
 */
function pointAt(curve: Curve, t: number): Point {
	const count = curve.segments.length;
	const scaled = Math.min(Math.max(t, 0), 1) * count;
	const index = Math.min(Math.floor(scaled), count - 1);
	const segment = curve.segments[index];
	if (segment === undefined) {
		return curve.from;
	}
	return pointOnSegment(segmentStart(curve, index), segment, scaled - index);
}

/**
 * One segment as SVG path data.
 * @param segment The segment.
 * @returns Its path command.
 */
function segmentPath(segment: Segment): string {
	if (segment.kind === "line") {
		return ` L${coord(segment.to.x)},${coord(segment.to.y)}`;
	}
	return (
		` C${coord(segment.first.x)},${coord(segment.first.y)}` +
		` ${coord(segment.second.x)},${coord(segment.second.y)}` +
		` ${coord(segment.to.x)},${coord(segment.to.y)}`
	);
}

/**
 * The route as SVG path data.
 * @param curve The route.
 * @returns Its `d` attribute.
 */
function pathOf(curve: Curve): string {
	return (
		`M${coord(curve.from.x)},${coord(curve.from.y)}` + curve.segments.map(segmentPath).join("")
	);
}

/**
 * A box the route cannot leave. A cubic stays inside the hull of its own
 * control points, so taking every point of every segment is a bound rather than
 * an estimate — which is what the canvas needs, since a route that ran off the
 * edge would simply be clipped.
 * @param curve The route.
 * @returns The box covering it.
 */
function curveBounds(curve: Curve): Box {
	const points: Point[] = [curve.from];
	for (const segment of curve.segments) {
		if (segment.kind === "cubic") {
			points.push(segment.first, segment.second);
		}
		points.push(segment.to);
	}
	const xs = points.map((point) => point.x);
	const ys = points.map((point) => point.y);
	const left = Math.min(...xs);
	const top = Math.min(...ys);
	return { x: left, y: top, width: Math.max(...xs) - left, height: Math.max(...ys) - top };
}

const SELF_LOOP_REACH = 26;

/**
 * A node that calls itself gets a loop off one of its side faces. There is no
 * second card to aim at, so the loop is drawn at a fixed size rather than
 * derived from a distance that is zero.
 *
 * It goes off the right face unless something shares the row to the right, in
 * which case the loop would be drawn straight through that card's words. PR
 * Lens always used the right face; it had no reason not to, because it never
 * drew a loop on a paired card.
 * @param box The card.
 * @param toTheLeft Whether to loop off the left face instead.
 * @returns The loop.
 */
function selfLoop(box: Box, toTheLeft: boolean): Curve {
	const x = toTheLeft ? box.x : box.x + box.width;
	const reach = toTheLeft ? -SELF_LOOP_REACH : SELF_LOOP_REACH;
	const top = { x, y: box.y + box.height / 3 };
	const bottom = { x, y: box.y + (box.height * 2) / 3 };
	// Out square, down, and square back in — the same rounding every other route
	// gets, which is what keeps the head on straight line. One cubic from the
	// face to the face was the old shape, and its tangents left and arrived some
	// twenty degrees off the side: a head drawn on a curve, pointing next to the
	// card rather than at it.
	return curveThrough([
		top,
		{ x: top.x + reach, y: top.y },
		{ x: bottom.x + reach, y: bottom.y },
		bottom,
	]);
}

/**
 * Drops repeated points and merges runs of three collinear ones, which is what
 * lets a snapped neighbour pair come out as two points — a dead-straight line —
 * from the same machinery as everything else.
 * @param points The waypoints.
 * @returns The waypoints with nothing redundant left in them.
 */
function simplify(points: readonly Point[]): Point[] {
	const kept: Point[] = [];
	for (const point of points) {
		if (samePoint(kept[kept.length - 1], point)) {
			continue;
		}
		if (redundantTail(kept, point)) {
			kept.pop();
		}
		kept.push(point);
	}
	return kept;
}

/**
 * Whether a point is the one already at the end of the walk.
 * @param a The point already there, if any.
 * @param b The point being added.
 * @returns True when they are the same place.
 */
function samePoint(a: Point | undefined, b: Point): boolean {
	return a !== undefined && a.x === b.x && a.y === b.y;
}

/**
 * Whether the last point kept becomes redundant once this one is added.
 * @param kept The walk so far.
 * @param point The point being added.
 * @returns True when the last point kept lies on the run.
 */
function redundantTail(kept: readonly Point[], point: Point): boolean {
	const last = kept[kept.length - 1];
	const previous = kept[kept.length - 2];
	return last !== undefined && previous !== undefined && collinear(previous, last, point);
}

/**
 * Whether three points lie on one axis-aligned run.
 * @param a The first point.
 * @param b The second.
 * @param c The third.
 * @returns True when the middle point is redundant.
 */
function collinear(a: Point, b: Point, c: Point): boolean {
	return (a.x === b.x && b.x === c.x) || (a.y === b.y && b.y === c.y);
}

/** The three points of one turn. */
interface Corner {
	/** Where the incoming leg started. */
	readonly previous: Point;
	/** The turn itself. */
	readonly vertex: Point;
	/** Where the outgoing leg ends. */
	readonly next: Point;
}

/**
 * One turn of a polyline, when the index names a real one.
 * @param points The waypoints.
 * @param index Which waypoint is the turn.
 * @returns The turn, or undefined at an end.
 */
function cornerAt(points: readonly Point[], index: number): Corner | undefined {
	const previous = points[index - 1];
	const vertex = points[index];
	const next = points[index + 1];
	if (previous === undefined || vertex === undefined || next === undefined) {
		return undefined;
	}
	return { previous, vertex, next };
}

/**
 * Where the route stands after the segments built so far.
 * @param segments What has been built.
 * @param first Where the route started.
 * @returns The current end point.
 */
function endOf(segments: readonly Segment[], first: Point): Point {
	return segments[segments.length - 1]?.to ?? first;
}

/**
 * The straight run into a turn and the turn itself, sized by the shorter of its
 * two legs. Deriving the radius from the longer leg is the known failure — it
 * balloons a route with one short leg clear out of the corridor the planner put
 * it in.
 *
 * A turn next to one of the route's own ends is held back further, because that
 * leg is carrying an arrowhead or leaving a card and has to stay straight where
 * it touches: `APPROACH_STRAIGHT` of the leg is reserved, and the turn rounds
 * with whatever is left. It is the same arc either way — a corner takes its
 * radius off both legs — so the only way to keep an approach straight is to
 * turn later, which is what this does.
 * @param corner The turn.
 * @param start Where the route currently stands.
 * @param reserved How much of the incoming and outgoing legs the route's ends need left straight.
 * @param reserved.entering How much of the incoming leg to leave alone.
 * @param reserved.leaving How much of the outgoing leg to leave alone.
 * @param maximum The radius allowed by nearby perpendicular crossings.
 * @returns The segments to append.
 */
function bendThrough(
	corner: Corner,
	start: Point,
	reserved: { readonly entering: number; readonly leaving: number },
	maximum: number,
): Segment[] {
	const { previous, vertex, next } = corner;
	const inLength = Math.hypot(vertex.x - previous.x, vertex.y - previous.y);
	const outLength = Math.hypot(next.x - vertex.x, next.y - vertex.y);
	const radius = Math.max(
		0,
		Math.min(
			maximum,
			Math.min(inLength, outLength) / 2,
			inLength - reserved.entering,
			outLength - reserved.leaving,
		),
	);
	const inDir = { x: (vertex.x - previous.x) / inLength, y: (vertex.y - previous.y) / inLength };
	const outDir = { x: (next.x - vertex.x) / outLength, y: (next.y - vertex.y) / outLength };
	const arrive = { x: vertex.x - inDir.x * radius, y: vertex.y - inDir.y * radius };
	const leave = { x: vertex.x + outDir.x * radius, y: vertex.y + outDir.y * radius };

	const bend: Segment = {
		kind: "cubic",
		first: { x: arrive.x + inDir.x * radius * KAPPA, y: arrive.y + inDir.y * radius * KAPPA },
		second: { x: leave.x - outDir.x * radius * KAPPA, y: leave.y - outDir.y * radius * KAPPA },
		to: leave,
	};
	if (Math.hypot(arrive.x - start.x, arrive.y - start.y) > EPSILON) {
		return [{ kind: "line", to: arrive }, bend];
	}
	return [bend];
}

/**
 * The last straight run into the route's end point, where the turns have not
 * already taken it there.
 * @param segments What has been built, appended to in place.
 * @param first Where the route started.
 * @param last Where it ends.
 */
function closeOn(segments: Segment[], first: Point, last: Point | undefined): void {
	if (last === undefined) {
		return;
	}
	const start = endOf(segments, first);
	if (segments.length === 0 || Math.hypot(last.x - start.x, last.y - start.y) > EPSILON) {
		segments.push({ kind: "line", to: last });
	}
}

/**
 * Measure a point along one of an orthogonal corner's legs.
 * @param vertex The corner being rounded.
 * @param end The far end of this leg.
 * @param point A crossing elsewhere on the route.
 * @returns Distance from the corner, only when the crossing lies on this leg.
 */
function distanceOnLeg(vertex: Point, end: Point, point: Point): number | undefined {
	const dx = end.x - vertex.x,
		dy = end.y - vertex.y;
	const px = point.x - vertex.x,
		py = point.y - vertex.y;
	if (px * dy - py * dx !== 0) return undefined;
	const projection = px * dx + py * dy;
	if (projection < 0 || projection > dx * dx + dy * dy) return undefined;
	return Math.hypot(px, py);
}

/**
 * Leave enough straight route beside a crossing for the existing bridge policy.
 * @param corner The corner whose incoming and outgoing legs may cross other routes.
 * @param crossings Proper perpendicular crossings on this route.
 * @returns The usual radius, reduced only when a nearby crossing needs the space.
 */
function crossingRadius(corner: Corner, crossings: readonly Point[] | undefined): number {
	let radius = BEND_RADIUS_MAX;
	// Touching obstacle bounds count as occupied; retain numerical clearance too.
	const clearance = BRIDGE_RADIUS + BRIDGE_CLEARANCE + EPSILON;
	for (const point of crossings ?? []) {
		for (const end of [corner.previous, corner.next]) {
			const distance = distanceOnLeg(corner.vertex, end, point);
			if (distance !== undefined) radius = Math.min(radius, distance - clearance);
		}
	}
	return radius;
}

/**
 * The polyline as one continuous line: long runs stay dead straight and only
 * the turns curve.
 * @param points The waypoints.
 * @param crossings Proper crossings whose bridge clearance must remain straight.
 * @returns The route.
 */
function curveThrough(points: readonly Point[], crossings?: readonly Point[]): Curve {
	const first = points[0] ?? ORIGIN;
	const segments: Segment[] = [];
	const last = points.length - 1;
	for (let index = 1; index < last; index += 1) {
		const corner = cornerAt(points, index);
		if (corner !== undefined) {
			// The first turn's incoming leg leaves the route's source, and the last
			// turn's outgoing leg arrives at its target. Both have to stay straight
			// where they touch; every leg in between is the planner's business.
			segments.push(
				...bendThrough(
					corner,
					endOf(segments, first),
					{
						entering: index === 1 ? APPROACH_STRAIGHT : 0,
						leaving: index === last - 1 ? APPROACH_STRAIGHT : 0,
					},
					crossingRadius(corner, crossings),
				),
			);
		}
	}
	closeOn(segments, first, points[points.length - 1]);
	return { from: first, segments };
}

/**
 * The midpoint of the longest straight run, or the route's middle if it only
 * bends.
 * @param curve The route.
 * @returns Where its label wants to sit.
 */
function labelAnchorOf(curve: Curve): Point {
	let best: { length: number; middle: Point } | undefined;
	curve.segments.forEach((segment, index) => {
		if (segment.kind !== "line") {
			return;
		}
		const start = segmentStart(curve, index);
		const length = Math.hypot(segment.to.x - start.x, segment.to.y - start.y);
		if (best === undefined || length > best.length) {
			best = {
				length,
				middle: { x: (start.x + segment.to.x) / 2, y: (start.y + segment.to.y) / 2 },
			};
		}
	});
	return best?.middle ?? pointAt(curve, 0.5);
}

export {
	type Segment,
	type Curve,
	EPSILON,
	segmentStart,
	pointAt,
	pathOf,
	curveBounds,
	selfLoop,
	simplify,
	curveThrough,
	labelAnchorOf,
};
