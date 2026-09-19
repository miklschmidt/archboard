import { SELF_LOOP_REACH } from "@/transformers/semantic-renderer/config";
// A route's shape: the polyline the planner produced, rounded at its turns,
// and the handful of questions the painter and the label pass ask of it.
//
// Forked from PR Lens's `layout/edges.ts`, which was one 1061-line file. Split
// here along its real seams: this is the geometry of a drawn route, with no
// opinion about which gaps the route travelled through.

import { APPROACH_STRAIGHT, BEND_RADIUS } from "@/transformers/semantic-renderer/lib/design";
import { coord, type Box, type Point } from "@/transformers/semantic-renderer/lib/geometry";

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
	return a !== undefined && Math.hypot(a.x - b.x, a.y - b.y) < EPSILON;
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
	return (
		(Math.abs(a.x - b.x) < EPSILON && Math.abs(b.x - c.x) < EPSILON) ||
		(Math.abs(a.y - b.y) < EPSILON && Math.abs(b.y - c.y) < EPSILON)
	);
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
 * One ordinary turn always uses the same radius. Intermediate layout attempts
 * may lack room; the completed reading is checked before it can be emitted.
 * @param corner The turn.
 * @param start Where the route currently stands.
 * @returns The straight approach and fixed-radius turn.
 */
function bendThrough(corner: Corner, start: Point): Segment[] {
	const { previous, vertex, next } = corner;
	const inLength = Math.hypot(vertex.x - previous.x, vertex.y - previous.y);
	const outLength = Math.hypot(next.x - vertex.x, next.y - vertex.y);
	const radius = BEND_RADIUS;
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
 * How far a corner may round along one leg before reaching its reserved label.
 * @param vertex The corner.
 * @param end The far end of the leg.
 * @param label The reserved label footprint.
 * @returns Its distance along the leg, or infinity when the label does not meet it.
 */
function labelClearance(vertex: Point, end: Point, label: Box): number {
	const inside = (
		[
			["x", "width"],
			["y", "height"],
		] as const
	).every(
		([axis, extent]) => vertex[axis] >= label[axis] && vertex[axis] <= label[axis] + label[extent],
	);
	if (inside) return 0;
	const [axis, cross, extent, breadth] =
		end.x === vertex.x
			? (["y", "x", "height", "width"] as const)
			: (["x", "y", "width", "height"] as const);
	if (vertex[cross] < label[cross] || vertex[cross] > label[cross] + label[breadth])
		return Infinity;
	return Math.min(
		...[label[axis], label[axis] + label[extent]].map(
			(at) => distanceOnLeg(vertex, end, { ...vertex, [axis]: at }) ?? Infinity,
		),
	);
}

/**
 * The polyline as one continuous line: long runs stay dead straight and only
 * the turns curve.
 * @param waypoints The native orthogonal waypoints.
 * @returns The route.
 */
function curveThrough(waypoints: readonly Point[]): Curve {
	const points = simplify(waypoints);
	const first = points[0] ?? ORIGIN;
	const segments: Segment[] = [];
	const last = points.length - 1;
	for (let index = 1; index < last; index += 1) {
		const corner = cornerAt(points, index);
		if (corner !== undefined) {
			segments.push(...bendThrough(corner, endOf(segments, first)));
		}
	}
	closeOn(segments, first, points[points.length - 1]);
	return { from: first, segments };
}

/**
 * Recover native vertices from ordinary quarter-circle bends, before bridges.
 * Each vertex is the intersection of the incoming and outgoing tangents.
 * @param curve An ordinary rounded route, without crossing arcs.
 * @returns Its original endpoint and corner positions.
 */
function verticesOf(curve: Curve): Point[] {
	const points = [curve.from];
	let from = curve.from;
	for (const segment of curve.segments) {
		if (segment.kind === "cubic") {
			const vertical = Math.abs(segment.first.x - from.x) < Math.abs(segment.first.y - from.y);
			points.push(vertical ? { x: from.x, y: segment.to.y } : { x: segment.to.x, y: from.y });
		}
		from = segment.to;
	}
	points.push(from);
	return points;
}

/**
 * A straight piece cannot run backward through an adjoining fixed bend.
 * @param curve The ordinary route.
 * @param index The straight segment being checked.
 * @returns Whether its direction opposes either adjoining tangent.
 */
function reversesBend(curve: Curve, index: number): boolean {
	const from = segmentStart(curve, index);
	const to = curve.segments[index]!.to;
	const previous = curve.segments[index - 1];
	const next = curve.segments[index + 1];
	const tangents = [
		...(previous?.kind === "cubic"
			? [{ x: from.x - previous.second.x, y: from.y - previous.second.y }]
			: []),
		...(next?.kind === "cubic" ? [{ x: next.first.x - to.x, y: next.first.y - to.y }] : []),
	];
	return tangents.some(
		(tangent) => (to.x - from.x) * tangent.x + (to.y - from.y) * tangent.y < -EPSILON,
	);
}

/**
 * Check a completed route without interrupting intermediate label attempts.
 * A source has no head; adjoining turns share a leg; the target keeps its full
 * straight approach. Labels must leave the whole bend outside their footprint.
 * @param curve The ordinary route, before crossing bridges are added.
 * @param label Its final label footprint, if present.
 * @returns The first shortage, or undefined when the fixed geometry fits.
 */
function curveClearanceIssue(curve: Curve, label?: Box): string | undefined {
	const points = verticesOf(curve);
	return segmentIssue(curve) ?? legIssue(points) ?? labelBendIssue(points, label);
}

/**
 * Reject a shrunken bend or a straight run that reverses through its tangent.
 * @param curve The ordinary rounded route.
 * @returns The first malformed piece, if any.
 */
function segmentIssue(curve: Curve): string | undefined {
	for (let index = 0; index < curve.segments.length; index += 1) {
		const segment = curve.segments[index]!;
		if (segment.kind !== "cubic") {
			if (reversesBend(curve, index)) return `Route run ${index} reverses through a fixed bend`;
			continue;
		}
		const from = segmentStart(curve, index);
		if (
			Math.abs(Math.abs(segment.to.x - from.x) - BEND_RADIUS) > EPSILON ||
			Math.abs(Math.abs(segment.to.y - from.y) - BEND_RADIUS) > EPSILON
		)
			return `Route bend ${index} does not have the fixed radius ${BEND_RADIUS}`;
	}
	return undefined;
}

/**
 * Check the space each original leg supplies to its turns and arrowhead.
 * @param points Original endpoints and vertices.
 * @returns The first leg lacking room, if any.
 */
function legIssue(points: readonly Point[]): string | undefined {
	for (let index = 1; index < points.length; index += 1) {
		const start = points[index - 1]!;
		const end = points[index]!;
		const required =
			(index === 1 ? 0 : BEND_RADIUS) +
			(index === points.length - 1 ? APPROACH_STRAIGHT : BEND_RADIUS);
		const available = Math.hypot(end.x - start.x, end.y - start.y);
		if (available + EPSILON < required)
			return `Route leg ${index} has ${coord(available)} units; fixed bends and approach require ${required}`;
	}
	return undefined;
}

/**
 * A settled badge cannot cover any part of an ordinary bend.
 * @param points Original endpoints and vertices.
 * @param label The final badge footprint.
 * @returns The first corner entering the label, if any.
 */
function labelBendIssue(points: readonly Point[], label: Box | undefined): string | undefined {
	if (label !== undefined) {
		for (let index = 1; index < points.length - 1; index += 1) {
			const corner = cornerAt(points, index)!;
			if (
				[corner.previous, corner.next].some(
					(end) => labelClearance(corner.vertex, end, label) + EPSILON < BEND_RADIUS,
				)
			)
				return `Label occupies the fixed bend at route corner ${index}`;
		}
	}
	return undefined;
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
	curveClearanceIssue,
	labelAnchorOf,
};
