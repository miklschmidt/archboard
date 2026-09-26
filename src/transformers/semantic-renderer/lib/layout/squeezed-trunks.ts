// Lines that share a pin form one trunk. When the router squeezes two of them
// through a passage one line wide, it nudges their runs a fraction of a lane
// apart, and the painter draws the pair as a notched double stroke with its
// junction mark at the pin rather than where the lines meet. Walking out from
// the shared pin, the first squeezed pair of runs is put on one coordinate,
// so the lines coincide from their real meeting point to the pin.
import type { ElkExtendedEdge } from "@archboard/elk-rs";
import type { Box, Point } from "@/transformers/semantic-renderer/lib/geometry";
import { SHARED_INK } from "@/transformers/semantic-renderer/lib/layout/drawn-lines";
import {
	curveClearanceIssue,
	curveThrough,
	simplify,
} from "@/transformers/semantic-renderer/lib/layout/curves";
import { boxOf } from "@/transformers/semantic-renderer/lib/layout/avoid-geometry";
import { forcedLabel } from "@/transformers/semantic-renderer/lib/layout/avoid-routes";

type End = "start" | "end";

/** One route read from one of its ends outward. */
interface Leg {
	readonly edge: ElkExtendedEdge;
	readonly end: End;
	readonly points: Point[];
}

/**
 * A route's corners ordered away from one end.
 * @param edge The routed relationship.
 * @param end The end it is read from.
 * @returns The leg.
 */
function legOf(edge: ElkExtendedEdge, end: End): Leg {
	const section = edge.sections![0]!;
	const points = [section.startPoint, ...(section.bendPoints ?? []), section.endPoint].map(
		({ x, y }) => ({ x, y }),
	);
	return { edge, end, points: end === "start" ? points : points.toReversed() };
}

/**
 * Whether two routes leave or reach one card at one pin.
 * @param one A route.
 * @param other Another route.
 * @param end The end they would share.
 * @returns True when that end is one pin.
 */
function sharePin(one: ElkExtendedEdge, other: ElkExtendedEdge, end: End): boolean {
	const ends = end === "start" ? "sources" : "targets";
	const [at, otherAt] = [legOf(one, end).points[0]!, legOf(other, end).points[0]!];
	return one[ends][0] === other[ends][0] && Math.hypot(at.x - otherAt.x, at.y - otherAt.y) < 0.01;
}

/**
 * Where the run starting at a corner lies across its axis.
 * @param points A leg's corners.
 * @param index The run's first corner.
 * @returns Its axis and coordinate across it.
 */
function runAt(points: readonly Point[], index: number): readonly ["x" | "y", number] {
	const [from, to] = [points[index]!, points[index + 1]!];
	const across = Math.abs(from.x - to.x) < Math.abs(from.y - to.y) ? "x" : "y";
	return [across, from[across]];
}

/**
 * Whether a leg's run may move sideways: not the run held on either pin, and
 * not the run carrying the label its route is forced through.
 * @param leg The leg.
 * @param index The run's first corner.
 * @returns True when it may move.
 */
function movable(leg: Leg, index: number): boolean {
	if (index === 0 || index + 1 >= leg.points.length - 1) return false;
	const [from, to] = [leg.points[index]!, leg.points[index + 1]!];
	return !forcedLabel(leg.edge) || !touches(from, to, boxOf(leg.edge.labels![0]!));
}

/**
 * Whether a straight run touches a box.
 * @param from The run's start.
 * @param to Its end.
 * @param box The box.
 * @returns True when they meet.
 */
function touches(from: Point, to: Point, box: Box): boolean {
	return (
		Math.max(from.x, to.x) >= box.x &&
		Math.min(from.x, to.x) <= box.x + box.width &&
		Math.max(from.y, to.y) >= box.y &&
		Math.min(from.y, to.y) <= box.y + box.height
	);
}

/**
 * Move a leg's run onto a coordinate and publish the route when its bends
 * and approaches still fit.
 * @param leg The leg.
 * @param index The run's first corner.
 * @param at The coordinate across the run's axis.
 * @returns Whether the route moved.
 */
function moveRun(leg: Leg, index: number, at: number): boolean {
	const [across] = runAt(leg.points, index);
	const points = leg.points.map((point, corner) =>
		corner === index || corner === index + 1 ? { ...point, [across]: at } : point,
	);
	const route = simplify(leg.end === "start" ? points : points.toReversed());
	const label = forcedLabel(leg.edge) ? boxOf(leg.edge.labels![0]!) : undefined;
	if (curveClearanceIssue(curveThrough(route), label) !== undefined) return false;
	const section = leg.edge.sections![0]!;
	section.bendPoints = route.slice(1, -1);
	return true;
}

/**
 * The first run, walking out from two legs' shared pin, where the legs part
 * by more than rounding but no more than one stroke.
 * @param one A leg.
 * @param other Another leg from the same pin.
 * @returns That run's first corner, or nothing when the legs part otherwise.
 */
function squeezedRun(one: Leg, other: Leg): number | undefined {
	const runs = Math.min(one.points.length, other.points.length) - 1;
	for (let index = 0; index < runs; index++) {
		const gap = runGap(one, other, index);
		if (gap > SHARED_INK) return undefined;
		if (gap >= 0.01) return index;
	}
	return undefined;
}

/**
 * How far apart two legs' runs from the same corner lie, when they are parallel.
 * @param one A leg.
 * @param other Another leg.
 * @param index The runs' first corner.
 * @returns The gap, or infinity for runs that cross.
 */
function runGap(one: Leg, other: Leg, index: number): number {
	const [axis, at] = runAt(one.points, index);
	const [otherAxis, otherAt] = runAt(other.points, index);
	return axis === otherAxis ? Math.abs(at - otherAt) : Infinity;
}

/**
 * A run's length.
 * @param leg Its leg.
 * @param index Its first corner.
 * @returns The length.
 */
function runLength(leg: Leg, index: number): number {
	const [from, to] = [leg.points[index]!, leg.points[index + 1]!];
	return Math.hypot(to.x - from.x, to.y - from.y);
}

/**
 * Join two legs from one pin at their first squeezed pair of runs, moving the
 * shorter run onto the longer one's coordinate, or the longer when the shorter
 * cannot move.
 * @param one A leg.
 * @param other Another leg from the same pin.
 */
function joinLegs(one: Leg, other: Leg): void {
	const index = squeezedRun(one, other);
	if (index === undefined) return;
	const [shorter, longer] =
		runLength(one, index) <= runLength(other, index) ? [one, other] : [other, one];
	for (const [leg, onto] of [
		[shorter, longer],
		[longer, shorter],
	] as const)
		if (movable(leg, index) && moveRun(leg, index, runAt(onto.points, index)[1])) return;
}

/**
 * Put every pair of lines that share a pin on one trunk where the router
 * squeezed them a fraction of a lane apart. Routes change in place.
 * @param edges The routed relationships.
 */
export function joinSqueezedTrunks(edges: readonly ElkExtendedEdge[]): void {
	const routed = edges.filter(
		(edge) => edge.sections?.length && edge.sources[0] !== edge.targets[0],
	);
	for (const [index, one] of routed.entries())
		for (const other of routed.slice(index + 1))
			for (const end of ["start", "end"] as const)
				if (sharePin(one, other, end)) joinLegs(legOf(one, end), legOf(other, end));
}
