// Crossings belong to the final drawing: route and paint order are settled here.
import {
	APPROACH_STRAIGHT,
	BRIDGE_RADIUS,
	BRIDGE_CLEARANCE,
} from "@/runtime/semantic-renderer/lib/design";
import type { ArchitectureDrawing, DrawingEdge } from "@/runtime/semantic-renderer/lib/drawing";
import { inflate, type Box, type Point } from "@/runtime/semantic-renderer/lib/geometry";
import {
	curveBounds,
	EPSILON,
	pathOf,
	segmentStart,
	type Curve,
	type Segment,
} from "@/runtime/semantic-renderer/lib/layout/curves";

/** One axis-aligned straight piece in the original paint order. */
interface Run {
	readonly edgeIndex: number;
	readonly segmentIndex: number;
	readonly from: Point;
	readonly to: Point;
	readonly axis: "x" | "y";
	readonly length: number;
	readonly startRoom: number;
	readonly endRoom: number;
}

/** A lower run crossed at this distance along an upper run. */
interface Crossing {
	readonly at: number;
	readonly lower: Run;
}

/** Local upper arc and the lower connections it crosses. */
interface Bridge {
	readonly edgeId: string;
	readonly under: readonly string[];
	readonly curve: Curve;
}

/**
 * Whether two boxes touch. Bounds include the clearance their caller needs.
 * @param a The first box.
 * @param b The second box.
 * @returns Whether the boxes intersect.
 */
function overlaps(a: Box, b: Box): boolean {
	return (
		a.x <= b.x + b.width && a.x + a.width >= b.x && a.y <= b.y + b.height && a.y + a.height >= b.y
	);
}

/**
 * The straight pieces on which a bridge can fit, excluding diagonal lines.
 * @param edges The final routed edges.
 * @returns Runs in paint order and then route order.
 */
function straightRuns(edges: readonly DrawingEdge[]): Run[] {
	return edges.flatMap((edge, edgeIndex) =>
		edge.curve.segments.flatMap((segment, segmentIndex) => {
			if (segment.kind !== "line") return [];
			const from = segmentStart(edge.curve, segmentIndex);
			const axis = straightAxis(from, segment.to);
			if (axis === undefined) return [];
			return [
				{
					edgeIndex,
					segmentIndex,
					from,
					to: segment.to,
					axis,
					length: Math.abs(segment.to[axis] - from[axis]),
					startRoom: segmentIndex === 0 ? APPROACH_STRAIGHT : BRIDGE_CLEARANCE,
					endRoom:
						segmentIndex === edge.curve.segments.length - 1 ? APPROACH_STRAIGHT : BRIDGE_CLEARANCE,
				},
			];
		}),
	);
}

/**
 * Which coordinate changes on a nonzero orthogonal line.
 * @param from The line's start.
 * @param to The line's end.
 * @returns Its axis, or undefined for a diagonal or point.
 */
function straightAxis(from: Point, to: Point): Run["axis"] | undefined {
	if (from.y === to.y && from.x !== to.x) return "x";
	if (from.x === to.x && from.y !== to.y) return "y";
	return undefined;
}

/**
 * A proper perpendicular crossing, with room on the lower line for the raised ink.
 * Shared endpoints, collinear overlaps and existing corners are not crossings.
 * @param upper The later-painted run.
 * @param lower An earlier run.
 * @returns The crossing when both straight pieces contain it.
 */
function crossingOf(upper: Run, lower: Run): Crossing | undefined {
	if (upper.axis === lower.axis || upper.edgeIndex <= lower.edgeIndex) return undefined;
	const at =
		(lower.from[upper.axis] - upper.from[upper.axis]) *
		Math.sign(upper.to[upper.axis] - upper.from[upper.axis]);
	const beneath =
		(upper.from[lower.axis] - lower.from[lower.axis]) *
		Math.sign(lower.to[lower.axis] - lower.from[lower.axis]);
	if (Math.min(at, upper.length - at) <= EPSILON) return undefined;
	const room = BRIDGE_RADIUS + BRIDGE_CLEARANCE;
	if (Math.min(beneath, lower.length - beneath) <= room) return undefined;
	return { at, lower };
}

/**
 * Close crossings share a crest, rather than producing touching humps.
 * @param crossings Sorted crossings on one run.
 * @returns Groups whose bridge footprints would otherwise touch.
 */
function crossingGroups(crossings: readonly Crossing[]): Crossing[][] {
	const groups: Crossing[][] = [];
	for (const crossing of crossings) {
		const previous = groups.at(-1);
		const last = previous?.at(-1);
		if (last !== undefined && crossing.at - last.at <= (BRIDGE_RADIUS + BRIDGE_CLEARANCE) * 2) {
			previous?.push(crossing);
		} else {
			groups.push([crossing]);
		}
	}
	return groups;
}

/**
 * A point following route direction, displaced toward the fixed bridge side.
 * @param run The straight run.
 * @param distance Distance along it.
 * @param height Height above the line (right of a vertical line).
 * @returns A drawing-space point.
 */
function onRun(run: Run, distance: number, height = 0): Point {
	const direction = Math.sign(run.to[run.axis] - run.from[run.axis]);
	return run.axis === "x"
		? { x: run.from.x + direction * distance, y: run.from.y - height }
		: { x: run.from.x + height, y: run.from.y + direction * distance };
}

/**
 * Two quarter circles with a shared crest for a cluster of crossings.
 * @param run The upper run.
 * @param first Distance to the first crossing.
 * @param last Distance to the last crossing.
 * @returns Only the displaced piece of the route.
 */
function hump(run: Run, first: number, last: number): Curve {
	const radius = BRIDGE_RADIUS;
	const tangent = (4 * (Math.sqrt(2) - 1) * radius) / 3;
	const segments: Segment[] = [
		{
			kind: "cubic",
			first: onRun(run, first - radius, tangent),
			second: onRun(run, first - tangent, radius),
			to: onRun(run, first, radius),
		},
	];
	if (last > first) segments.push({ kind: "line", to: onRun(run, last, radius) });
	segments.push({
		kind: "cubic",
		first: onRun(run, last + tangent, radius),
		second: onRun(run, last + radius, tangent),
		to: onRun(run, last + radius),
	});
	return { from: onRun(run, first - radius), segments };
}

/**
 * Cards, labels and container titles must retain their reserved space.
 * @param drawing The settled drawing.
 * @returns The occupied boxes, without excluding container interiors.
 */
function occupiedBoxes(drawing: ArchitectureDrawing): Box[] {
	return [
		...drawing.cards.map((card) => card.box),
		...drawing.containers.map((container) => ({
			...container.box,
			height: container.measured.headerHeight,
		})),
		...drawing.edges.flatMap((edge) => (edge.label === undefined ? [] : [edge.label.box])),
	];
}

/**
 * Keep a hump away from unrelated routes, including the upper route's own turns.
 * Bounds are conservative for cubics; tight spots keep their original geometry.
 * @param drawing The original drawing.
 * @param run The upper run.
 * @param group The lower runs deliberately crossed.
 * @param bounds The hump bounds, including ink clearance.
 * @returns Whether another route piece occupies that space.
 */
function routeObstructs(
	drawing: ArchitectureDrawing,
	run: Run,
	group: readonly Crossing[],
	bounds: Box,
): boolean {
	const allowed = [run, ...group.map((crossing) => crossing.lower)];
	return drawing.edges.some((edge, edgeIndex) =>
		edge.curve.segments.some((segment, segmentIndex) => {
			if (
				allowed.some(
					(piece) => piece.edgeIndex === edgeIndex && piece.segmentIndex === segmentIndex,
				)
			)
				return false;
			return overlaps(
				bounds,
				curveBounds({ from: segmentStart(edge.curve, segmentIndex), segments: [segment] }),
			);
		}),
	);
}

/**
 * A cluster gets one bridge only when the entire footprint has clear room.
 * @param drawing The original drawing.
 * @param run The upper run.
 * @param group A cluster of crossings along it.
 * @param occupied Cards, labels, titles and previously accepted bridge bounds.
 * @returns The bridge curve if it is safe to introduce.
 */
function bridgeFor(
	drawing: ArchitectureDrawing,
	run: Run,
	group: readonly Crossing[],
	occupied: readonly Box[],
): Curve | undefined {
	const first = Math.min(...group.map((crossing) => crossing.at));
	const last = Math.max(...group.map((crossing) => crossing.at));
	if (first - BRIDGE_RADIUS < run.startRoom || last + BRIDGE_RADIUS > run.length - run.endRoom)
		return undefined;
	const curve = hump(run, first, last);
	const bounds = inflate(curveBounds(curve), BRIDGE_CLEARANCE);
	if (occupied.some((box) => overlaps(bounds, box))) return undefined;
	if (routeObstructs(drawing, run, group, bounds)) return undefined;
	return curve;
}

/**
 * Replaces straight pieces with their accepted bridges, preserving every turn.
 * @param edge The original edge.
 * @param replacements Curves for straight segments, indexed by segment.
 * @returns The edge with one authoritative curve and matching SVG path.
 */
function replaceRuns(
	edge: DrawingEdge,
	replacements: ReadonlyMap<number, readonly Curve[]>,
): DrawingEdge {
	if (replacements.size === 0) return edge;
	const segments = edge.curve.segments.flatMap((segment, index) => {
		const bridges = replacements.get(index) ?? [];
		return [
			...bridges.flatMap((curve) => [{ kind: "line" as const, to: curve.from }, ...curve.segments]),
			segment,
		];
	});
	const curve = { from: edge.curve.from, segments };
	return { ...edge, curve, path: pathOf(curve) };
}

/**
 * Raises later-painted connections over proper crossings in the final routes.
 * No placement or label moves, and painters and interaction geometry share the
 * resulting curves. Tight crossings stay unchanged rather than acquiring knots.
 * @param drawing The drawing after routing, rounding and label placement.
 * @returns Updated edges and local arcs for narrowly clearing lower ink.
 */
function bridgeCrossings(drawing: ArchitectureDrawing): {
	readonly edges: readonly DrawingEdge[];
	readonly bridges: readonly Bridge[];
} {
	const runs = straightRuns(drawing.edges);
	const occupied = occupiedBoxes(drawing);
	const bridges: Bridge[] = [];
	const edges = drawing.edges.map((edge, edgeIndex) => {
		const replacement = new Map<number, Curve[]>();
		for (const run of runs.filter((piece) => piece.edgeIndex === edgeIndex)) {
			const crossings = runs
				.flatMap((lower) => {
					const crossing = crossingOf(run, lower);
					return crossing === undefined ? [] : [crossing];
				})
				.toSorted((a, b) => a.at - b.at);
			for (const group of crossingGroups(crossings)) {
				const curve = bridgeFor(drawing, run, group, occupied);
				if (curve !== undefined) {
					const under = group.map((crossing) => drawing.edges[crossing.lower.edgeIndex]!.edge.id);
					bridges.push({ edgeId: edge.edge.id, under: [...new Set(under)], curve });
					const curves = replacement.get(run.segmentIndex) ?? [];
					curves.push(curve);
					replacement.set(run.segmentIndex, curves);
					occupied.push(inflate(curveBounds(curve), BRIDGE_CLEARANCE));
				}
			}
		}
		return replaceRuns(edge, replacement);
	});
	return { edges, bridges };
}

export { bridgeCrossings };
