// Route-piece geometry shared by natural badge placement and native waypoint proposals.
import type { DrawingEdge } from "@/transformers/semantic-renderer/lib/drawing";
import type { Box, Point } from "@/transformers/semantic-renderer/lib/geometry";
import { curveBounds } from "@/transformers/semantic-renderer/lib/layout/curves";

/** A route piece and its conservative bounds, including rounded corners. */
interface RoutePiece {
	readonly edgeId: string;
	readonly index: number;
	readonly box: Box;
	readonly axis: "x" | "y" | undefined;
}

/** A feasible badge box and the physical length of its unobstructed run. */
interface Candidate {
	readonly axis: "x" | "y";
	readonly box: Box;
	readonly length: number;
	readonly index: number;
	/** How far the badge sits from the nearer of its route's two ends. */
	readonly reach: number;
}

type Interval = readonly [number, number];

/** Obstacle groups already enlarged by their declared clearances. */
interface Obstacles {
	readonly groups: readonly (readonly Box[])[];
	readonly pieces: readonly Box[];
	readonly ownPiece: number;
}

/** Native whole-unit route snapping can offset a centered badge by half a unit. */
const ROUTE_SNAP = 0.5;

const DIMENSIONS = {
	x: { cross: "y", length: "width", breadth: "height" },
	y: { cross: "x", length: "height", breadth: "width" },
} as const;

/**
 * Bound rounded pieces; only straight pieces hold badges.
 * @param edges The authoritative routes.
 * @returns Runs and corner obstacles in drawing coordinates.
 */
function piecesOf(edges: readonly DrawingEdge[]): RoutePiece[] {
	return edges.flatMap(({ edge, curve }) => {
		let from = curve.from;
		return curve.segments.map((segment, index) => {
			const box = curveBounds({ from, segments: [segment] });
			from = segment.to;
			return {
				edgeId: edge.id,
				index,
				box,
				axis:
					segment.kind !== "line"
						? undefined
						: box.height <= 0.01
							? "x"
							: box.width <= 0.01
								? "y"
								: undefined,
			};
		});
	});
}

/**
 * Remove occupied positions, allowing only native half-unit route snapping.
 * @param intervals Available leading-edge positions.
 * @param blocked Forbidden positions on the same axis.
 * @returns Remaining intervals in coordinate order.
 */
function without(intervals: readonly Interval[], blocked: Interval): readonly Interval[] {
	const [low, high] = blocked;
	// Most obstacles miss every interval; those leave the intervals as they are.
	if (intervals.every(([start, end]) => high <= start || low >= end)) return intervals;
	return intervals.flatMap(([start, end]): Interval[] => {
		if (high <= start || low >= end) return [[start, end]];
		return [
			...(low + ROUTE_SNAP >= start
				? ([[start, Math.max(start, Math.min(low, end))]] as const)
				: []),
			...(high <= end + ROUTE_SNAP ? ([[Math.min(end, Math.max(high, start)), end]] as const) : []),
		];
	});
}

/**
 * What is left of a run once every obstacle beside it has taken its span.
 * @param run The badge's leading-edge positions the run allows.
 * @param obstacles The obstacles, in the order they are applied.
 * @param label The badge.
 * @param axis The run's axis.
 * @param across Where the badge's leading edge sits across the run.
 * @returns The clear intervals, in coordinate order.
 */
function clearIntervals(
	run: readonly Interval[],
	obstacles: Obstacles,
	label: Box,
	axis: "x" | "y",
	across: number,
): readonly Interval[] {
	const { length } = DIMENSIONS[axis];
	let intervals = run;
	for (const group of obstacles.groups) {
		for (let index = 0; index < group.length; index += 1) {
			const box = group[index]!;
			const own = group === obstacles.pieces && index === obstacles.ownPiece;
			if (!own && levelWith(box, label, axis, across)) {
				intervals = without(intervals, [box[axis] - label[length], box[axis] + box[length]]);
			}
		}
	}
	return intervals;
}

/**
 * Whether an obstacle is level with a badge's line, so that it takes a span of
 * the run; one entirely beside the line takes nothing.
 * @param box The obstacle.
 * @param label The badge.
 * @param axis The run's axis.
 * @param across Where the badge's leading edge sits across the run.
 * @returns True when it overlaps the badge across the run.
 */
function levelWith(box: Box, label: Box, axis: "x" | "y", across: number): boolean {
	const { cross, breadth } = DIMENSIONS[axis];
	return (
		across + label[breadth] > box[cross] + ROUTE_SNAP &&
		across + ROUTE_SNAP < box[cross] + box[breadth]
	);
}

/**
 * Find the centers of clear spans on one horizontal or vertical straight run.
 * @param piece A piece of this badge's own route.
 * @param label Its measured dimensions.
 * @param obstacles Boxes already enlarged by their required clearance, in the order they are applied.
 * @param ends Where the route leaves its source and reaches its target.
 * @param air How much of the run stays clear at each end.
 * @param anchoring Whether a native waypoint needs an open corridor around its buffered box.
 * @returns Feasible boxes, near an endpoint or inside an open anchoring interval.
 */
function candidatesOf(
	piece: RoutePiece,
	label: Box,
	obstacles: Obstacles,
	ends: readonly [Point, Point],
	air: number,
	anchoring = false,
): Candidate[] {
	const axis = piece.axis;
	if (axis === undefined) return [];
	const { cross, length, breadth } = DIMENSIONS[axis];
	const start = piece.box[axis] + air;
	const end = piece.box[axis] + piece.box[length] - label[length] - air;
	if (end < start) return [];
	const across = piece.box[cross] - label[breadth] / 2;
	const intervals = clearIntervals([[start, end]], obstacles, label, axis, across);
	return intervals
		.filter(([low, high]) => !anchoring || high > low)
		.map(([low, high]) => {
			// Natural badges stay near endpoints; native anchors use open interval centers.
			const along = anchoring
				? (low + high) / 2
				: nearestPlacement(low, high, label, axis, ends).along;
			return {
				axis,
				box: { ...label, [axis]: along, [cross]: across },
				length: high - low + label[length],
				index: piece.index,
				reach: reachOf({ ...label, [axis]: along, [cross]: across }, ends),
			};
		});
}

/**
 * The distance from a badge's centre to the nearer end of its route.
 * @param box The badge.
 * @param ends The route's ends.
 * @returns The smaller distance.
 */
function reachOf(box: Box, ends: readonly [Point, Point]): number {
	const centre = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
	return Math.min(...ends.map((end) => Math.hypot(centre.x - end.x, centre.y - end.y)));
}

/**
 * Where along a clear interval a badge sits nearest an end of its route.
 * @param low The lowest leading coordinate the interval allows.
 * @param high The highest.
 * @param label The badge.
 * @param axis The run's axis.
 * @param ends The route's ends.
 * @returns The leading coordinate to use.
 */
function nearestPlacement(
	low: number,
	high: number,
	label: Box,
	axis: "x" | "y",
	ends: readonly [Point, Point],
): { readonly along: number } {
	const half = label[DIMENSIONS[axis].length] / 2;
	// Each end pulls the badge as close as the interval allows; the closer pull wins.
	const choices = ends.map((end) => Math.max(low, Math.min(high, end[axis] - half)));
	const reaches = choices.map((along) =>
		Math.min(...ends.map((end) => Math.abs(along + half - end[axis]))),
	);
	const best = reaches.indexOf(Math.min(...reaches));
	return { along: choices[best] ?? (low + high) / 2 };
}

export {
	piecesOf,
	clearIntervals,
	candidatesOf,
	reachOf,
	type RoutePiece,
	type Candidate,
	type Interval,
	type Obstacles,
};
