// Crossings belong to the final drawing: route and paint order are settled here.
//
// One rule, for every engine, since every engine hands its routes to this pass.
// Where two lines cross, one of them hops over the other: a small arc centred
// on the crossing. A hop stands only where both lines run straight and alone
// for the hop's reach and a clear margin on every side of the crossing, and
// the hopping line a bend's room further, so no bend, no join and no
// arrowhead is ever part of its shape or drawn beside it, and it always
// bulges the same way (up, or right), so two hops never face each other. Where
// no such spot exists nothing rises: the line that runs straighter through the
// crossing stays whole, and the other is cut beneath it. A trunk is one drawn
// line (`drawn-lines.ts`): a line crosses it once, and it hops as its drawer does.
import {
	BEND_RADIUS,
	BRIDGE_RADIUS,
	BRIDGE_CLEARANCE,
} from "@/transformers/semantic-renderer/lib/design";
import type {
	ArchitectureDrawing,
	DrawingEdge,
} from "@/transformers/semantic-renderer/lib/drawing";
import { inflate, type Box } from "@/transformers/semantic-renderer/lib/geometry";
import { cornerClearances } from "@/transformers/semantic-renderer/lib/layout/corner-crossings";
import { curveBoxes } from "@/transformers/semantic-renderer/lib/layout/curve-clearance";
import {
	curveBounds,
	pathOf,
	segmentStart,
	type Curve,
	type Segment,
} from "@/transformers/semantic-renderer/lib/layout/curves";
import {
	along,
	crossingKey,
	crossingOf,
	drawnCrossings,
	joinNear,
	onLine,
	onRun,
	overlaps,
	pieceOf,
	straightness,
	straightRuns,
	straightThrough,
	type Bridge,
	type DrawnCrossing,
	type Line,
	type Run,
} from "@/transformers/semantic-renderer/lib/layout/drawn-lines";
import { unfoldCrossings } from "@/transformers/semantic-renderer/lib/layout/folded-crossings";

/** Straight line a hop keeps beyond its feet, on both lines, before a bend, a join or an end's approach. */
const HOP_MARGIN = 6;

/** How far a hop's clear stretch reaches from its crossing, along either line. */
const HOP_REACH = BRIDGE_RADIUS + HOP_MARGIN;

/**
 * How much further the hopping line itself runs straight before it turns: a
 * bend a few points past a hop draws one squiggle, the hop and the turn
 * bulging the same way.
 */
const HOP_BEND_ROOM = BEND_RADIUS;

/** How much straighter one line must run through a crossing to stay whole over the other. */
const STRAIGHTER = 0.5;

/** How near a join a cut must be to keep the joining line whole: within a hop's radius. */
const JOIN_REACH = BRIDGE_RADIUS;

/** A crossing along one candidate upper run. */
interface Candidate {
	readonly at: number;
	readonly crossing: DrawnCrossing;
	/** The line it would cross. */
	readonly other: Line;
}

/** Everything settling the crossings reads and records. */
interface Settling {
	readonly drawing: ArchitectureDrawing;
	readonly runs: readonly Run[];
	/** Cards, labels, titles and every accepted hop, which a new hop must keep clear of. */
	readonly occupied: Box[];
	readonly bridges: Bridge[];
	/** The hops each route's straight segments carry, by segment. */
	readonly replacements: readonly Map<number, Curve[]>[];
	/** Pairs of pieces whose contact is marked. */
	readonly crossed: Set<string>;
	readonly hopped: Set<DrawnCrossing>;
}

/**
 * Close crossings share a crest, rather than producing touching humps.
 * @param crossings Sorted crossings on one run.
 * @returns Groups whose bridge footprints would otherwise touch.
 */
function crossingGroups(crossings: readonly Candidate[]): Candidate[][] {
	const groups: Candidate[][] = [];
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
 * Two quarter circles with a shared crest for a cluster of crossings, always
 * above a line across and right of a line down.
 * @param run The upper run.
 * @param first Distance to where the crest starts.
 * @param last Distance to where it ends.
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
 * Keep a hump away from every route piece but the lines it crosses and rides.
 * Refined cubic bounds preserve clearance without treating empty hulls as ink.
 * @param drawing The original drawing.
 * @param allowed The runs on the lines the hump rides and crosses.
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
 * Whether both lines run straight and alone around every crossing of a cluster.
 * @param runs Every run.
 * @param run The upper run.
 * @param group The cluster.
 * @param margin How far the crest runs on past the outer crossings.
 * @returns True when a hop may stand there.
 */
function roomFor(
	runs: readonly Run[],
	run: Run,
	group: readonly Candidate[],
	margin: number,
): boolean {
	const places = group.map(({ crossing }) => crossing.point[run.axis]);
	const reach = margin + HOP_REACH + HOP_BEND_ROOM;
	return (
		straightThrough(runs, run, Math.min(...places) - reach, Math.max(...places) + reach) &&
		group.every(({ crossing, other }) => {
			const beneath = crossing.point[other.drawer.axis];
			return straightThrough(runs, other.drawer, beneath - HOP_REACH, beneath + HOP_REACH);
		})
	);
}

/**
 * A cluster gets one hop only where both lines run straight and alone around
 * every crossing in it, and the hop's whole footprint has clear room.
 * @param state The drawing, its runs and what is occupied.
 * @param run The upper run.
 * @param group A cluster of crossings along it.
 * @returns The bridge curve if it is safe to introduce.
 */
function hopFor(state: Settling, run: Run, group: readonly Candidate[]): Curve | undefined {
	// A crest over several lines runs on past the outer ones, so each passes
	// under its flat and none meets it where it turns.
	const margin = group.length > 1 ? BRIDGE_CLEARANCE : 0;
	if (!roomFor(state.runs, run, group, margin)) return undefined;
	const curve = hump(run, group[0]!.at - margin, group.at(-1)!.at + margin);
	const bounds = inflate(curveBounds(curve), BRIDGE_CLEARANCE);
	if (state.occupied.some((box) => overlaps(bounds, box))) return undefined;
	const lines = [run, ...group.map(({ other }) => other.drawer)];
	const allowed = state.runs.filter((candidate) =>
		lines.some((line) => candidate === line || onLine(line, candidate)),
	);
	return routeObstructs(state.drawing, allowed, bounds, curve) ? undefined : curve;
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
		 * Order preferred and fallback bridges together along the original segment.
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

/**
 * The ids of the routes a drawn line holds.
 * @param edges The routes.
 * @param line The line.
 * @returns Each route's id once.
 */
function idsOf(edges: readonly DrawingEdge[], line: Line): string[] {
	return [...new Set(line.members.map((member) => edges[member.edgeIndex]!.edge.id))];
}

/**
 * Mark every pair of runs a drawn crossing stands for as settled.
 * @param crossed The settled pairs.
 * @param crossing The crossing.
 */
function settle(crossed: Set<string>, crossing: DrawnCrossing): void {
	for (const one of crossing.lines[0].members) {
		for (const other of crossing.lines[1].members) crossed.add(crossingKey(one, other));
	}
}

/**
 * The unmarked crossings a run draws one of the lines of, where the other line
 * is painted before it (or, in the fallback pass, after it), in order along it.
 * @param state What is settled so far.
 * @param crossings Every crossing.
 * @param run The run.
 * @param fallback Whether this is the pass that tries the earlier-painted line.
 * @returns The candidates.
 */
function candidatesFor(
	state: Settling,
	crossings: readonly DrawnCrossing[],
	run: Run,
	fallback: boolean,
): Candidate[] {
	return crossings
		.flatMap((crossing): Candidate[] => {
			const mine = crossing.lines.findIndex(({ drawer }) => drawer === run);
			if (mine === -1 || state.hopped.has(crossing)) return [];
			const other = crossing.lines[1 - mine]!;
			const order = other.drawer.edgeIndex - run.edgeIndex;
			return (fallback ? order > 0 : order < 0)
				? [{ at: along(run, crossing.point[run.axis]), crossing, other }]
				: [];
		})
		.toSorted((a, b) => a.at - b.at);
}

/**
 * Raise one run over a cluster of crossings, when a hop fits there.
 * @param state What is settled so far, extended in place.
 * @param run The run.
 * @param group The cluster.
 */
function raise(state: Settling, run: Run, group: readonly Candidate[]): void {
	const curve = hopFor(state, run, group);
	if (curve === undefined) return;
	const { edges } = state.drawing;
	for (const { crossing } of group) {
		state.hopped.add(crossing);
		settle(state.crossed, crossing);
	}
	const under = group.flatMap(({ other }) => idsOf(edges, other));
	state.bridges.push({ edgeId: edges[run.edgeIndex]!.edge.id, under: [...new Set(under)], curve });
	const replacement = state.replacements[run.edgeIndex]!;
	replacement.set(run.segmentIndex, [...(replacement.get(run.segmentIndex) ?? []), curve]);
	state.occupied.push(inflate(curveBounds(curve), BRIDGE_CLEARANCE));
}

/**
 * Where no hop fits, a line that joins or parts at the crossing stays whole,
 * since cutting it would sever the join from its mark; else the line that
 * runs straighter through the crossing, or else the later-painted one. The
 * other is cut beneath it, clear of the join's mark when there is one.
 * @param edges The routes.
 * @param runs Every run.
 * @param crossing The crossing.
 * @returns The upper line's ink at the crossing, clearing the lower line.
 */
function cutBeneath(
	edges: readonly DrawingEdge[],
	runs: readonly Run[],
	crossing: DrawnCrossing,
): Bridge {
	const [joined, oneAbove] = upperOf(runs, crossing);
	const [one, other] = crossing.lines;
	const [upper, lower] = oneAbove ? [one, other] : [other, one];
	const at = along(upper.drawer, crossing.point[upper.drawer.axis]);
	return {
		edgeId: edges[upper.drawer.edgeIndex]!.edge.id,
		under: idsOf(edges, lower),
		curve: pieceOf(upper.drawer, at, BRIDGE_RADIUS),
		...(joined ? { join: true as const } : {}),
	};
}

/**
 * Which of a crossing's two lines stays whole where no hop fits.
 * @param runs Every run.
 * @param crossing The crossing.
 * @returns Whether the one staying whole joins there, and whether it is the first line.
 */
function upperOf(runs: readonly Run[], crossing: DrawnCrossing): readonly [boolean, boolean] {
	const [one, other] = crossing.lines;
	const [oneJoins, otherJoins] = crossing.lines.map(({ drawer }) =>
		joinNear(runs, drawer, crossing.point[drawer.axis], JOIN_REACH),
	);
	if (oneJoins !== otherJoins) return [true, oneJoins!];
	const oneStraight = straightness(runs, one.drawer, crossing.point[one.drawer.axis]);
	const otherStraight = straightness(runs, other.drawer, crossing.point[other.drawer.axis]);
	const oneAbove =
		Math.abs(oneStraight - otherStraight) < STRAIGHTER
			? one.drawer.edgeIndex > other.drawer.edgeIndex
			: oneStraight > otherStraight;
	return [false, oneAbove];
}

/**
 * Raises one line over each crossing where a hop fits, preferring later-painted
 * ink, and cuts the other line beneath the straighter one wherever none does.
 * No placement moves, and painters and interaction geometry share the
 * resulting curves. A crossing folded into two corners first moves onto
 * straight runs, taking a label on a moved lane along. Contacts at rounded
 * corners are cut the same way, the straight line staying whole.
 * @param settled The drawing after routing, rounding and label placement.
 * @returns Updated edges and the local ink each crossing clears beneath it.
 */
function bridgeCrossings(settled: ArchitectureDrawing): {
	readonly edges: readonly DrawingEdge[];
	readonly bridges: readonly Bridge[];
} {
	const drawing = unfoldCrossings(settled);
	const { edges } = drawing;
	const runs = straightRuns(edges);
	const crossings = drawnCrossings(edges, runs);
	const state: Settling = {
		drawing,
		runs,
		occupied: occupiedBoxes(drawing),
		bridges: [],
		replacements: edges.map(() => new Map<number, Curve[]>()),
		crossed: new Set(),
		hopped: new Set(),
	};
	// Prefer later-painted ink, then try the other line at still-unmarked crossings.
	for (const fallback of [false, true]) {
		for (const run of runs) {
			for (const group of crossingGroups(candidatesFor(state, crossings, run, fallback))) {
				raise(state, run, group);
			}
		}
	}
	for (const crossing of crossings.filter((one) => !state.hopped.has(one))) {
		state.bridges.push(cutBeneath(edges, runs, crossing));
		settle(state.crossed, crossing);
	}
	return {
		edges: edges.map((edge, index) => replaceRuns(edge, state.replacements[index]!)),
		bridges: [...state.bridges, ...cornerClearances(edges, runs, state.crossed)],
	};
}

/**
 * How many times two different routes cross, before any bridge is drawn.
 * @param edges The routed edges.
 * @returns The number of proper crossings between straight runs of different routes.
 */
function crossingCount(edges: readonly DrawingEdge[]): number {
	const runs = straightRuns(edges);
	return runs.reduce(
		(total, run, index) =>
			total + runs.slice(index + 1).filter((other) => crossingOf(run, other) !== undefined).length,
		0,
	);
}

export { bridgeCrossings, crossingCount };
