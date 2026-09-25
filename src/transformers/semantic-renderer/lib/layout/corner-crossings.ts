// Contacts at rounded corners, which never carry a hop. A straight line that
// crosses a corner stays whole and the corner is cut beneath it; where two
// corners touch, the later-painted one stays whole. Routes where they run
// together, or leave or join each other's line, are one line there, not a
// crossing: that is a join, and a dot marks it.
import type { DrawingEdge } from "@/transformers/semantic-renderer/lib/drawing";
import { BRIDGE_RADIUS } from "@/transformers/semantic-renderer/lib/design";
import type { Box, Point } from "@/transformers/semantic-renderer/lib/geometry";
import { curveBoxes } from "@/transformers/semantic-renderer/lib/layout/curve-clearance";
import {
	curveBounds,
	EPSILON,
	segmentStart,
	type Curve,
} from "@/transformers/semantic-renderer/lib/layout/curves";
import {
	across,
	along,
	crossingKey,
	extentOf,
	fixedOf,
	overlaps,
	pieceOf,
	SHARED_INK,
	type Axis,
	type Bridge,
	type Run,
} from "@/transformers/semantic-renderer/lib/layout/drawn-lines";
import { sharedTrunk } from "@/transformers/semantic-renderer/lib/layout/folded-crossings";

/** One piece of one route, in its own curve. */
interface Piece {
	readonly edgeIndex: number;
	readonly segmentIndex: number;
	readonly curve: Curve;
	readonly bounds: Box;
}

/** What clearing the corners reads and records. */
interface Scene {
	readonly edges: readonly DrawingEdge[];
	readonly pieces: readonly Piece[];
	readonly runOf: ReadonlyMap<string, Run>;
	readonly cleared: Set<string>;
	readonly touch: (a: Piece, b: Piece) => boolean;
}

/**
 * One coordinate of a cubic at a given fraction of its run.
 * @param values The start, two controls and end on one axis.
 * @param t Position along the cubic.
 * @returns The coordinate on that axis.
 */
function cubicAt(values: readonly [number, number, number, number], t: number): number {
	const rest = 1 - t;
	return (
		rest * rest * rest * values[0] +
		3 * rest * rest * t * values[1] +
		3 * rest * t * t * values[2] +
		t * t * t * values[3]
	);
}

/**
 * Locate one axis value inside a monotone rounded quarter-turn, ends included.
 * @param values Cubic control positions on the intersected axis.
 * @param coordinate The straight route's fixed coordinate.
 * @returns A curve fraction, if the turn reaches the coordinate.
 */
function cubicFractionAt(
	values: readonly [number, number, number, number],
	coordinate: number,
): number | undefined {
	const increasing = values[3] > values[0];
	if (coordinate < Math.min(values[0], values[3]) - EPSILON) return undefined;
	if (coordinate > Math.max(values[0], values[3]) + EPSILON) return undefined;
	let low = 0;
	let high = 1;
	for (let iteration = 0; iteration < 32; iteration += 1) {
		const middle = (low + high) / 2;
		if (cubicAt(values, middle) < coordinate === increasing) low = middle;
		else high = middle;
	}
	return (low + high) / 2;
}

/**
 * Where a rounded corner meets a straight run's line, when it crosses it.
 * @param run The straight route.
 * @param corner The other route's corner.
 * @returns The distance along the run, when the turn meets its line inside it.
 */
function cornerCrossingOf(run: Run, corner: Piece): number | undefined {
	const segment = corner.curve.segments[0];
	if (segment?.kind !== "cubic") return undefined;
	const from = corner.curve.from;
	const fixedAxis = across(run.axis);
	const fixedValues = [
		from[fixedAxis],
		segment.first[fixedAxis],
		segment.second[fixedAxis],
		segment.to[fixedAxis],
	] as const;
	const fraction = cubicFractionAt(fixedValues, fixedOf(run));
	if (fraction === undefined) return undefined;
	const axis = run.axis;
	const values = [from[axis], segment.first[axis], segment.second[axis], segment.to[axis]] as const;
	const at = along(run, cubicAt(values, fraction));
	return Math.min(at, run.length - at) <= EPSILON ? undefined : at;
}

/**
 * The axis a rounded corner runs along at each of its ends.
 * @param piece The corner.
 * @returns Each end and the axis of the straight line it meets there.
 */
function cornerEnds(piece: Piece): readonly { readonly point: Point; readonly axis: Axis }[] {
	const segment = piece.curve.segments[0];
	if (segment?.kind !== "cubic") return [];
	const start = piece.curve.from;
	const startAxis: Axis =
		Math.abs(segment.first.x - start.x) >= Math.abs(segment.first.y - start.y) ? "x" : "y";
	const endAxis: Axis =
		Math.abs(segment.to.x - segment.second.x) >= Math.abs(segment.to.y - segment.second.y)
			? "x"
			: "y";
	return [
		{ point: start, axis: startAxis },
		{ point: segment.to, axis: endAxis },
	];
}

/**
 * Whether a corner and another piece are one line where they touch: the same
 * turn drawn twice, or one route leaving or joining the other's line along it.
 * @param corner A rounded corner.
 * @param other A piece of another route.
 * @param run The other piece as a straight run, when it is one.
 * @returns True when they touch only where they run together.
 */
function joined(corner: Piece, other: Piece, run: Run | undefined): boolean {
	const ends = cornerEnds(corner);
	if (run !== undefined) {
		const { low, high } = extentOf(run);
		return ends.some(
			({ point, axis }) =>
				axis === run.axis &&
				Math.abs(point[across(axis)] - fixedOf(run)) <= SHARED_INK &&
				point[axis] >= low - SHARED_INK &&
				point[axis] <= high + SHARED_INK,
		);
	}
	const others = cornerEnds(other);
	return ends.some(({ point, axis }) =>
		others.some(
			(end) =>
				end.axis === axis && Math.hypot(end.point.x - point.x, end.point.y - point.y) <= SHARED_INK,
		),
	);
}

/**
 * Every piece of every route, each in its own curve.
 * @param edges The routes.
 * @returns The pieces.
 */
function piecesOf(edges: readonly DrawingEdge[]): Piece[] {
	return edges.flatMap((edge, edgeIndex) =>
		edge.curve.segments.map((segment, segmentIndex) => {
			const curve = { from: segmentStart(edge.curve, segmentIndex), segments: [segment] };
			return { edgeIndex, segmentIndex, curve, bounds: curveBounds(curve) };
		}),
	);
}

/**
 * A test of whether two pieces' ink meets, refining only pieces whose broad
 * bounds meet, so an empty hull is never taken for ink.
 * @returns The test.
 */
function inkContact(): (a: Piece, b: Piece) => boolean {
	const refinements = new Map<Curve, readonly Box[]>();
	/**
	 * A piece's conservative local bounds, refined once.
	 * @param curve The one-segment curve.
	 * @returns The bounds.
	 */
	function boxes(curve: Curve): readonly Box[] {
		let result = refinements.get(curve);
		if (result === undefined) {
			result = curveBoxes(curve);
			refinements.set(curve, result);
		}
		return result;
	}
	return (a, b) =>
		overlaps(a.bounds, b.bounds) &&
		boxes(a.curve).some((one) => boxes(b.curve).some((other) => overlaps(one, other)));
}

/**
 * Whether a corner touches another route's piece where the two cross, not
 * where they run together, and the contact is not settled yet.
 * @param scene The routes and what is settled.
 * @param upper A corner.
 * @param lower A piece of any route.
 * @returns True when the contact needs clearing.
 */
function crosses(scene: Scene, upper: Piece, lower: Piece): boolean {
	const { edges } = scene;
	return (
		upper.edgeIndex !== lower.edgeIndex &&
		!sharedTrunk(edges[upper.edgeIndex]!.edge, edges[lower.edgeIndex]!.edge) &&
		!scene.cleared.has(crossingKey(upper, lower)) &&
		scene.touch(upper, lower) &&
		!joined(upper, lower, scene.runOf.get(crossingKey(lower, lower)))
	);
}

/**
 * The cut beneath a straight piece where a corner crosses its line.
 * @param scene The routes.
 * @param corner The corner.
 * @param straight The straight piece.
 * @returns The straight line's ink there, clearing the corner, or nothing when the corner only grazes it.
 */
function straightOver(scene: Scene, corner: Piece, straight: Piece): Bridge | undefined {
	const run = scene.runOf.get(crossingKey(straight, straight));
	const at = run === undefined ? undefined : cornerCrossingOf(run, corner);
	if (run === undefined || at === undefined) return undefined;
	return {
		edgeId: scene.edges[straight.edgeIndex]!.edge.id,
		under: [scene.edges[corner.edgeIndex]!.edge.id],
		curve: pieceOf(run, at, BRIDGE_RADIUS),
	};
}

/**
 * Clear every contact one corner makes: the straight lines crossing it stay
 * whole over it, and it stays whole over everything else it touches.
 * @param scene The routes and what is settled.
 * @param upper The corner.
 * @returns The cutouts.
 */
function clearCorner(scene: Scene, upper: Piece): Bridge[] {
	const under = new Set<string>();
	const cuts: Bridge[] = [];
	for (const lower of scene.pieces.filter((piece) => crosses(scene, upper, piece))) {
		scene.cleared.add(crossingKey(upper, lower));
		const cut = straightOver(scene, upper, lower);
		if (cut === undefined) under.add(scene.edges[lower.edgeIndex]!.edge.id);
		else cuts.push(cut);
	}
	const edgeId = scene.edges[upper.edgeIndex]!.edge.id;
	return under.size === 0 ? cuts : [...cuts, { edgeId, under: [...under], curve: upper.curve }];
}

/**
 * Clear contacts involving rounded corners. Refined bounds follow the actual
 * curve, not its empty hull. Routes of one kind at a shared endpoint are a
 * deliberate trunk and never cut each other.
 * @param edges The original rounded routes, before synthetic bridge arcs.
 * @param runs Every straight run.
 * @param settled Contacts already hopped or cut.
 * @returns Existing ink to use as a narrow cutout on the other route.
 */
function cornerClearances(
	edges: readonly DrawingEdge[],
	runs: readonly Run[],
	settled: ReadonlySet<string>,
): Bridge[] {
	const pieces = piecesOf(edges);
	const scene: Scene = {
		edges,
		pieces,
		runOf: new Map(runs.map((run) => [crossingKey(run, run), run])),
		cleared: new Set(settled),
		touch: inkContact(),
	};
	// Prefer the later-painted corner where two corners touch.
	return pieces
		.filter((piece) => piece.curve.segments[0]!.kind === "cubic")
		.toReversed()
		.flatMap((corner) => clearCorner(scene, corner));
}

export { cornerClearances };
