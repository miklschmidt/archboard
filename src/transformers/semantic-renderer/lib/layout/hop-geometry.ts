// Where a hop may stand and what it draws. A hop is a small arc on a straight
// run, bulging up from a line across and right of a line down, over one or
// more crossings under one crest. It stands where the rising line runs
// straight and alone past its feet, the line beneath runs straight under its
// crest, and the crest spans no crossing it does not hop and touches no card,
// label, title, arrowhead, accepted hop or other line. Which line rises at
// which crossing is `crossings.ts`'s to choose.
import {
	APPROACH_STRAIGHT,
	BRIDGE_RADIUS,
	BRIDGE_CLEARANCE,
} from "@/transformers/semantic-renderer/lib/design";
import type {
	ArchitectureDrawing,
	DrawingEdge,
	LineLook,
} from "@/transformers/semantic-renderer/lib/drawing";
import { inflate, type Box, type Point } from "@/transformers/semantic-renderer/lib/geometry";
import { curveBoxes } from "@/transformers/semantic-renderer/lib/layout/curve-clearance";
import {
	curveBounds,
	pathOf,
	segmentStart,
	type Curve,
	type Segment,
} from "@/transformers/semantic-renderer/lib/layout/curves";
import {
	lineRuns,
	onRun,
	overlaps,
	straightThrough,
	type Axis,
	type Run,
} from "@/transformers/semantic-renderer/lib/layout/drawn-lines";

/** Straight line kept past a hop, before a bend, a join or an end's approach. */
const HOP_MARGIN = 6;

/** How far the line beneath a hop runs straight toward the side it bulges to: under its crest and on past it. */
const HOP_REACH = BRIDGE_RADIUS + HOP_MARGIN;

/**
 * How far the line beneath a hop runs straight on the other side, so it is
 * seen to pass beneath rather than to end at the line or turn onto it.
 */
const FAR_REACH = BRIDGE_CLEARANCE;

/**
 * Clear space a hop keeps from a card, a label, a title or an arrowhead: twice
 * what it keeps from a line, since an arc five points from a label's edge
 * reads as touching it.
 */
const BOX_CLEARANCE = BRIDGE_CLEARANCE * 2;

/**
 * Clear space between hops on crossing lines: a hop's radius, twice what hops
 * on parallel lines keep, since an arc bulging across another's path reads
 * as one knot with it.
 */
const CROSSWISE_CLEARANCE = BRIDGE_RADIUS;

/**
 * Which way a hop bulges: up from a line across and right of a line down, or,
 * for a lone hop only the other side has room for, the other way.
 */
type Bulge = 1 | -1;

/** A hop that stands, and the axis of the run it stands on. */
interface Hop {
	readonly curve: Curve;
	readonly axis: Axis;
}

/** A place a hop keeps clear of, and the route it belongs to, if any. */
interface Keepout {
	readonly box: Box;
	readonly edgeIndex?: number;
}

/** What a new hop must keep clear of. */
interface HopScene {
	readonly drawing: ArchitectureDrawing;
	readonly runs: readonly Run[];
	/** Cards, labels, titles and arrowheads. */
	readonly keepouts: readonly Keepout[];
	/** Every hop that stands. */
	readonly hops: Hop[];
}

/**
 * Two quarter circles with a shared crest for a cluster of crossings, above a
 * line across and right of a line down unless it bulges the other way.
 * @param run The upper run.
 * @param first Distance to where the crest starts.
 * @param last Distance to where it ends.
 * @param bulge Which way it bulges.
 * @returns Only the displaced piece of the route.
 */
function hump(run: Run, first: number, last: number, bulge: Bulge): Curve {
	const radius = BRIDGE_RADIUS * bulge;
	const tangent = (4 * (Math.sqrt(2) - 1) * radius) / 3;
	const along = Math.abs(tangent);
	const reach = BRIDGE_RADIUS;
	const segments: Segment[] = [
		{
			kind: "cubic",
			first: onRun(run, first - reach, tangent),
			second: onRun(run, first - along, radius),
			to: onRun(run, first, radius),
		},
	];
	if (last > first) segments.push({ kind: "line", to: onRun(run, last, radius) });
	segments.push({
		kind: "cubic",
		first: onRun(run, last + along, radius),
		second: onRun(run, last + reach, tangent),
		to: onRun(run, last + reach),
	});
	return { from: onRun(run, first - reach), segments };
}

/**
 * The crest over some crossings along a run, when the run has the room.
 * @param runs Every run.
 * @param run The rising run.
 * @param places Where along it the crossings it hops lie.
 * @param room The straight line it keeps past each foot.
 * @param bulge Which way it bulges.
 * @returns The crest.
 */
function crestAlong(
	runs: readonly Run[],
	run: Run,
	places: readonly number[],
	room: number,
	bulge: Bulge = 1,
): Curve | undefined {
	// A crest over several lines runs on past the outer ones, so each passes
	// under its flat and none meets it where it turns.
	const margin = places.length > 1 ? BRIDGE_CLEARANCE : 0;
	const first = Math.min(...places) - margin;
	const last = Math.max(...places) + margin;
	const [low, high] = [first, last].map(
		(at, end) => onRun(run, at + (end === 0 ? -1 : 1) * (BRIDGE_RADIUS + room))[run.axis],
	);
	const straight = straightThrough(runs, run, Math.min(low!, high!), Math.max(low!, high!));
	return straight ? hump(run, first, last, bulge) : undefined;
}

/**
 * Whether a line runs straight and alone beneath where a hop over it would
 * stand: under the crest and on past it on the side the hop bulges to, and a
 * little way on the other side.
 * @param runs Every run.
 * @param run The run drawing the line beneath.
 * @param point The crossing.
 * @param bulge Which way the hop bulges.
 * @returns True when a hop may pass over it there.
 */
function passesBeneath(runs: readonly Run[], run: Run, point: Point, bulge: Bulge = 1): boolean {
	const at = point[run.axis];
	// A hop bulges up from a line across, toward lower y along a line down,
	// and right of a line down, toward higher x along a line across.
	const [back, ahead] =
		(run.axis === "y") === (bulge === 1) ? [HOP_REACH, FAR_REACH] : [FAR_REACH, HOP_REACH];
	return straightThrough(runs, run, at - back, at + ahead);
}

/**
 * How a relationship's line is drawn: as measurement settled it, or solid with
 * a filled head, as a relationship of a kind the vault does not know is.
 * @param lines How each line is drawn, by relationship id.
 * @param id The relationship.
 * @returns Its dash and head.
 */
function lookOf(lines: ReadonlyMap<string, LineLook>, id: string): LineLook {
	return lines.get(id) ?? { dash: "solid", arrowhead: "filled" };
}

/**
 * The box an arrowhead is drawn in: its route's last stretch of approach, and
 * half as far to either side of it.
 * @param edge The route.
 * @param look How it is drawn.
 * @returns The box, when the route ends in a head on a straight piece.
 */
function arrowheadBox(edge: DrawingEdge, look: LineLook): Box | undefined {
	const last = edge.curve.segments.at(-1);
	if (last?.kind !== "line" || look.arrowhead === "none") return undefined;
	const from = segmentStart(edge.curve, edge.curve.segments.length - 1);
	const length = Math.hypot(last.to.x - from.x, last.to.y - from.y);
	if (length === 0) return undefined;
	const share = Math.min(length, APPROACH_STRAIGHT) / length;
	const back = {
		x: last.to.x + (from.x - last.to.x) * share,
		y: last.to.y + (from.y - last.to.y) * share,
	};
	// The head is as wide as the approach is long, and reaches no further
	// along its line than the approach: a hop across the line a little past it
	// stands clear of it.
	return widened(back, last.to, APPROACH_STRAIGHT / 2);
}

/**
 * The box between two points on one straight line, widened to either side of
 * the line only.
 * @param from One point.
 * @param to The other, level with it or straight above or below it.
 * @param side How far to either side.
 * @returns The box.
 */
function widened(from: Point, to: Point, side: number): Box {
	const box = {
		x: Math.min(from.x, to.x),
		y: Math.min(from.y, to.y),
		width: Math.abs(from.x - to.x),
		height: Math.abs(from.y - to.y),
	};
	return from.x === to.x
		? { ...box, x: box.x - side, width: box.width + side * 2 }
		: { ...box, y: box.y - side, height: box.height + side * 2 };
}

/**
 * Cards, labels, container titles and arrowheads must retain their space.
 * @param drawing The settled drawing.
 * @param lines How each line is drawn, by relationship id.
 * @returns What a hop keeps clear of, without excluding container interiors.
 */
function keepoutsOf(drawing: ArchitectureDrawing, lines: ReadonlyMap<string, LineLook>): Keepout[] {
	return [
		...drawing.cards.map((card) => ({ box: card.box })),
		...drawing.containers.map((container) => ({
			box: { ...container.box, height: container.measured.headerHeight },
		})),
		...drawing.edges.flatMap((edge) => (edge.label === undefined ? [] : [{ box: edge.label.box }])),
		...drawing.edges.flatMap((edge, edgeIndex) => {
			const box = arrowheadBox(edge, lookOf(lines, edge.edge.id));
			return box === undefined ? [] : [{ box, edgeIndex }];
		}),
	];
}

/**
 * Keep a hump away from every route piece but the lines it crosses and rides.
 * Refined cubic bounds preserve clearance without treating empty hulls as ink.
 * @param drawing The original drawing.
 * @param allowed The runs of the lines the hump rides and passes over.
 * @param bounds The hump bounds, including ink clearance.
 * @param curve The proposed bridge.
 * @returns Whether another route piece occupies that space.
 */
function routeObstructs(
	drawing: ArchitectureDrawing,
	allowed: readonly Run[],
	bounds: Box,
	curve: Curve,
): boolean {
	const bridgeBoxes = curveBoxes(curve).map((box) => inflate(box, BRIDGE_CLEARANCE));
	return drawing.edges.some((edge, edgeIndex) =>
		edge.curve.segments.some((segment, segmentIndex) => {
			if (
				allowed.some(
					(piece) => piece.edgeIndex === edgeIndex && piece.segmentIndex === segmentIndex,
				)
			)
				return false;
			const other = { from: segmentStart(edge.curve, segmentIndex), segments: [segment] };
			return (
				overlaps(bounds, curveBounds(other)) &&
				curveBoxes(other).some((box) => bridgeBoxes.some((bridgeBox) => overlaps(bridgeBox, box)))
			);
		}),
	);
}

/**
 * Whether a crest touches a card, a label, a title, an arrowhead other than
 * its own line's, an accepted hop or another line's ink.
 * @param scene What a hop keeps clear of.
 * @param run The rising run.
 * @param beneath The runs drawing the lines it passes over.
 * @param curve Its crest.
 * @param pending Crests standing with it.
 * @returns True when it does.
 */
function crowded(
	scene: HopScene,
	run: Run,
	beneath: readonly Run[],
	curve: Curve,
	pending: readonly Hop[],
): boolean {
	const own = lineRuns(scene.runs, run);
	const bounds = inflate(curveBounds(curve), BRIDGE_CLEARANCE);
	const clear = inflate(curveBounds(curve), BOX_CLEARANCE);
	const others = scene.keepouts.filter(
		({ edgeIndex }) => !own.some((mine) => mine.edgeIndex === edgeIndex),
	);
	if (others.some(({ box }) => overlaps(clear, box))) return true;
	if ([...scene.hops, ...pending].some((hop) => touches(hop, curve, run.axis))) return true;
	const allowed = [...own, ...beneath.flatMap((under) => lineRuns(scene.runs, under))];
	return routeObstructs(scene.drawing, allowed, bounds, curve);
}

/**
 * Whether a crest comes near the arrowhead of its own line: a hop stood so
 * close to the head it leads into reads as a knot at the card.
 * @param scene What the hop keeps clear of.
 * @param run The run the crest stands on.
 * @param curve The crest.
 * @returns True when it does.
 */
function nearOwnHead(scene: HopScene, run: Run, curve: Curve): boolean {
	const own = new Set(lineRuns(scene.runs, run).map((mine) => mine.edgeIndex));
	const clear = inflate(curveBounds(curve), BOX_CLEARANCE);
	return scene.keepouts.some(
		({ box, edgeIndex }) => edgeIndex !== undefined && own.has(edgeIndex) && overlaps(clear, box),
	);
}

/**
 * Whether a new crest comes nearer a standing hop than their lines allow.
 * @param hop The standing hop.
 * @param curve The new crest.
 * @param axis The axis of the run it stands on.
 * @returns True when it does.
 */
function touches(hop: Hop, curve: Curve, axis: Axis): boolean {
	const clearance = hop.axis === axis ? BRIDGE_CLEARANCE : CROSSWISE_CLEARANCE;
	return overlaps(
		inflate(curveBounds(curve), clearance),
		inflate(curveBounds(hop.curve), clearance),
	);
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
		const from = segmentStart(edge.curve, index);
		/**
		 * Order bridges along the original segment.
		 * @param curve A local bridge.
		 * @returns Distance from the segment start.
		 */
		const distance = (curve: Curve): number =>
			Math.hypot(curve.from.x - from.x, curve.from.y - from.y);
		const bridges = (replacements.get(index) ?? []).toSorted((a, b) => distance(a) - distance(b));
		return [
			...bridges.flatMap((curve) => [{ kind: "line" as const, to: curve.from }, ...curve.segments]),
			segment,
		];
	});
	const curve = { from: edge.curve.from, segments };
	return { ...edge, curve, path: pathOf(curve) };
}

export {
	crestAlong,
	crowded,
	HOP_MARGIN,
	keepoutsOf,
	lookOf,
	nearOwnHead,
	passesBeneath,
	replaceRuns,
	type Bulge,
	type Hop,
	type HopScene,
};
