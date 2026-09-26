// Crossings belong to the final drawing: route and paint order are settled here.
//
// One rule, for every engine, since every engine hands its routes to this pass.
// Where two lines cross, one of them hops over the other: a small arc centred
// on the crossing, which always bulges the same way (up, or right), so two
// hops never face each other. The line with more straight room rises. A hop
// stands where the rising line runs straight and alone past its feet and the
// line beneath runs straight under its crest, and the crest touches no card,
// label, title, arrowhead or other line. The rising line keeps a bend's room
// past each foot where either line can, so a bend and a hop never read as one
// squiggle, and less where neither can, since a crossing with no arc reads as
// no crossing at all. A straight line may also hop over another route's
// rounded corner (`corner-crossings.ts`). Only where no hop can stand is a
// line cut: the line that runs straighter through the crossing stays whole,
// and the other is cut beneath it. A trunk is one drawn line
// (`drawn-lines.ts`): a line crosses it once, and it hops as its drawer does.
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
import {
	cornerClearances,
	cornerContacts,
	type CornerContact,
} from "@/transformers/semantic-renderer/lib/layout/corner-crossings";
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
	extentOf,
	joinNear,
	lineRuns,
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
 * The straight line the rising line keeps past each of a hop's feet, first
 * where either line has it and then where neither does. A bend a few points
 * past a hop draws one squiggle with it, so a bend's room is kept wherever one
 * of the lines has it; where neither does, an arc beside a turn still reads as
 * a crossing, and a cut does not.
 */
const ROOMS = [HOP_MARGIN + BEND_RADIUS, HOP_MARGIN] as const;

/** Straight line on a crossing's shorter side past which a line has all the room a hop could want. */
const RISE_CAP = BRIDGE_RADIUS + ROOMS[0];

/** How much straighter one line must run through a crossing to stay whole over the other. */
const STRAIGHTER = 0.5;

/** How near a join a cut must be to keep the joining line whole: within a hop's radius. */
const JOIN_REACH = BRIDGE_RADIUS;

/** One piece of one route. */
type Piece = Pick<Run, "edgeIndex" | "segmentIndex">;

/** What a hop passes over: another drawn line, or another route's rounded corner. */
type Contact = DrawnCrossing | CornerContact;

/** A crossing along one candidate upper run. */
interface Candidate {
	readonly at: number;
	readonly contact: Contact;
	/** The pieces the hop passes over, which its crest may touch. */
	readonly beneath: readonly Piece[];
	/** The routes it passes over, cut beneath its crest. */
	readonly under: readonly string[];
	/** Whether the run's line is the one to try raising first there. */
	readonly first: boolean;
}

/** Everything settling the crossings reads and records. */
interface Settling {
	readonly drawing: ArchitectureDrawing;
	readonly runs: readonly Run[];
	readonly crossings: readonly DrawnCrossing[];
	/** Each run's candidates, in order along it. */
	readonly candidates: ReadonlyMap<Run, readonly Candidate[]>;
	/** Cards, labels, titles and every accepted hop, which a new hop must keep clear of. */
	readonly occupied: Box[];
	readonly bridges: Bridge[];
	/** The hops each route's straight segments carry, by segment. */
	readonly replacements: readonly Map<number, Curve[]>[];
	/** Pairs of pieces whose contact is marked. */
	readonly crossed: Set<string>;
	readonly hopped: Set<Contact>;
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
 * @param allowed The pieces of the lines the hump rides and passes over.
 * @param bounds The hump bounds, including ink clearance.
 * @param curve The proposed bridge.
 * @returns Whether another route piece occupies that space.
 */
function routeObstructs(
	drawing: ArchitectureDrawing,
	allowed: readonly Piece[],
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
 * Whether the rising line runs straight and alone around every crossing of a
 * cluster, the given room past each foot. Each line beneath was checked when
 * its crossing became a candidate.
 * @param runs Every run.
 * @param run The upper run.
 * @param group The cluster.
 * @param reach How far past the outer crossings the line must run straight.
 * @returns True when a hop may stand there.
 */
function roomFor(
	runs: readonly Run[],
	run: Run,
	group: readonly Candidate[],
	reach: number,
): boolean {
	const places = group.map(({ contact }) => contact.point[run.axis]);
	return straightThrough(runs, run, Math.min(...places) - reach, Math.max(...places) + reach);
}

/**
 * A cluster gets one hop only where the rising line runs straight and alone
 * around every crossing in it, and the hop's whole footprint has clear room.
 * @param state The drawing, its runs and what is occupied.
 * @param run The upper run.
 * @param group A cluster of crossings along it.
 * @param room The straight line the rising line keeps past each foot.
 * @returns The bridge curve if it is safe to introduce.
 */
function hopFor(
	state: Settling,
	run: Run,
	group: readonly Candidate[],
	room: number,
): Curve | undefined {
	// A crest over several lines runs on past the outer ones, so each passes
	// under its flat and none meets it where it turns.
	const margin = group.length > 1 ? BRIDGE_CLEARANCE : 0;
	if (!roomFor(state.runs, run, group, margin + BRIDGE_RADIUS + room)) return undefined;
	const curve = hump(run, group[0]!.at - margin, group.at(-1)!.at + margin);
	const bounds = inflate(curveBounds(curve), BRIDGE_CLEARANCE);
	if (state.occupied.some((box) => overlaps(bounds, box))) return undefined;
	const allowed = [...lineRuns(state.runs, run), ...group.flatMap(({ beneath }) => beneath)];
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
 * Mark every pair of pieces a contact stands for as settled.
 * @param crossed The settled pairs.
 * @param contact The crossing, or the contact with a corner.
 */
function settle(crossed: Set<string>, contact: Contact): void {
	if ("lines" in contact) {
		for (const one of contact.lines[0].members) {
			for (const other of contact.lines[1].members) crossed.add(crossingKey(one, other));
		}
	} else {
		for (const member of contact.members) crossed.add(crossingKey(member, contact.corner));
	}
}

/**
 * Whether a line runs straight and alone beneath where a hop over it would
 * stand: under the crest and on past it on the side the hop bulges to, and a
 * little way on the other side.
 * @param runs Every run.
 * @param run The run drawing the line beneath.
 * @param at Where the rising line runs, on that run's axis.
 * @param far How far it runs on the other side; less than nothing where it starts past the rising line.
 * @returns True when a hop may pass over it there.
 */
function passesBeneath(runs: readonly Run[], run: Run, at: number, far: number): boolean {
	// A hop bulges up from a line across, toward lower y along a line down,
	// and right of a line down, toward higher x along a line across.
	return run.axis === "y"
		? straightThrough(runs, run, at - HOP_REACH, at + far)
		: straightThrough(runs, run, at - far, at + HOP_REACH);
}

/**
 * Which of a crossing's lines stays whole over the other: the one that runs
 * straighter through it, else the later-painted.
 * @param runs Every run.
 * @param crossing The crossing.
 * @param cap How much straight line on the shorter side counts at most.
 * @returns Whether it is the first line.
 */
function firstAbove(runs: readonly Run[], crossing: DrawnCrossing, cap: number): boolean {
	const [one, other] = crossing.lines.map(({ drawer }) =>
		Math.min(cap, straightness(runs, drawer, crossing.point[drawer.axis])),
	);
	return Math.abs(one! - other!) < STRAIGHTER
		? crossing.lines[0].drawer.edgeIndex > crossing.lines[1].drawer.edgeIndex
		: one! > other!;
}

/**
 * A crossing as a candidate for each of its lines to rise at, where the other
 * line passes beneath. The line with more straight room, up to all a hop could
 * want, is the one to raise first.
 * @param runs Every run.
 * @param edges The routes.
 * @param crossing The crossing.
 * @returns Each rising run and its candidate.
 */
function crossingCandidates(
	runs: readonly Run[],
	edges: readonly DrawingEdge[],
	crossing: DrawnCrossing,
): (readonly [Run, Candidate])[] {
	const firstRises = firstAbove(runs, crossing, RISE_CAP);
	return crossing.lines.flatMap((line, mine): (readonly [Run, Candidate])[] => {
		const other = crossing.lines[1 - mine]!;
		const beneath = other.drawer;
		if (!passesBeneath(runs, beneath, crossing.point[beneath.axis], FAR_REACH)) return [];
		const run = line.drawer;
		const candidate = {
			at: along(run, crossing.point[run.axis]),
			contact: crossing,
			beneath: lineRuns(runs, beneath),
			under: idsOf(edges, other),
			first: (mine === 0) === firstRises,
		};
		return [[run, candidate]];
	});
}

/**
 * A contact with a rounded corner as a candidate for the straight line to
 * rise at, where the straight run the corner turns onto passes beneath the
 * hop. Only the straight line can rise there.
 * @param runs Every run.
 * @param edges The routes.
 * @param contact The contact.
 * @returns The straight line's run and its candidate.
 */
function cornerCandidates(
	runs: readonly Run[],
	edges: readonly DrawingEdge[],
	contact: CornerContact,
): (readonly [Run, Candidate])[] {
	const { onward, run } = contact;
	const at = contact.point[onward.axis];
	const { low, high } = extentOf(onward);
	// The onward run starts past the line, at the corner's end.
	const start = Math.min(Math.abs(low - at), Math.abs(high - at));
	if (!passesBeneath(runs, onward, at, -start)) return [];
	const beneath = [contact.corner, ...lineRuns(runs, onward)];
	const under = [...new Set(beneath.map(({ edgeIndex }) => edges[edgeIndex]!.edge.id))];
	return [[run, { at: along(run, contact.point[run.axis]), contact, beneath, under, first: true }]];
}

/**
 * Every run's candidates, in order along it, found once: what a crossing
 * needs to carry a hop does not change as hops are placed.
 * @param runs Every run.
 * @param edges The routes.
 * @param crossings Every crossing of two drawn lines.
 * @returns The candidates by run.
 */
function candidatesByRun(
	runs: readonly Run[],
	edges: readonly DrawingEdge[],
	crossings: readonly DrawnCrossing[],
): ReadonlyMap<Run, readonly Candidate[]> {
	const byRun = new Map<Run, Candidate[]>();
	const found = [
		...crossings.flatMap((crossing) => crossingCandidates(runs, edges, crossing)),
		...cornerContacts(edges, runs).flatMap((contact) => cornerCandidates(runs, edges, contact)),
	];
	for (const [run, candidate] of found) byRun.set(run, [...(byRun.get(run) ?? []), candidate]);
	for (const list of byRun.values()) list.sort((a, b) => a.at - b.at);
	return byRun;
}

/**
 * The clusters of unmarked candidates a run could rise over, in order along
 * it: each cluster of several, since hops that close would collide, and each
 * single one where the run's line rises first (or, in the second pass,
 * second). A crossing no hop can pass over is no candidate, so it never joins
 * a neighbour's crest and sinks it.
 * @param state What is settled so far.
 * @param run The run.
 * @param second Whether this is the pass that tries the line that rises second.
 * @param apart Whether to take each crossing on its own rather than in clusters.
 * @returns The clusters.
 */
function groupsFor(state: Settling, run: Run, second: boolean, apart: boolean): Candidate[][] {
	const open = (state.candidates.get(run) ?? []).filter(
		({ contact }) => !state.hopped.has(contact),
	);
	return (apart ? open.map((one) => [one]) : crossingGroups(open)).filter(
		(group) => group.length > 1 || group[0]!.first !== second,
	);
}

/**
 * Raise one run over a cluster of crossings, when a hop fits there.
 * @param state What is settled so far, extended in place.
 * @param run The run.
 * @param group The cluster.
 * @param room The straight line the run keeps past each foot.
 * @returns Whether it rose.
 */
function raise(state: Settling, run: Run, group: readonly Candidate[], room: number): boolean {
	const curve = hopFor(state, run, group, room);
	if (curve === undefined) return false;
	const { edges } = state.drawing;
	for (const { contact } of group) {
		state.hopped.add(contact);
		settle(state.crossed, contact);
	}
	const under = [...new Set(group.flatMap((candidate) => candidate.under))];
	state.bridges.push({ edgeId: edges[run.edgeIndex]!.edge.id, under, curve });
	const replacement = state.replacements[run.edgeIndex]!;
	replacement.set(run.segmentIndex, [...(replacement.get(run.segmentIndex) ?? []), curve]);
	state.occupied.push(inflate(curveBounds(curve), BRIDGE_CLEARANCE));
	return true;
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
	const [oneJoins, otherJoins] = crossing.lines.map(({ drawer }) =>
		joinNear(runs, drawer, crossing.point[drawer.axis], JOIN_REACH),
	);
	if (oneJoins !== otherJoins) return [true, oneJoins!];
	return [false, firstAbove(runs, crossing, Infinity)];
}

/**
 * Raise every line that has the given room over the crossings it rises at,
 * first the lines that rise first, then the others; and then, where a
 * cluster's one crest could not stand, over each crossing of it on its own,
 * once the other lines have had their turn to rise there.
 * @param state What is settled so far, extended in place.
 * @param room The straight line a rising line keeps past each foot.
 */
function raiseAll(state: Settling, room: number): void {
	for (const apart of [false, true]) {
		for (const second of [false, true]) {
			for (const run of state.runs) {
				for (const group of groupsFor(state, run, second, apart)) raise(state, run, group, room);
			}
		}
	}
}

/**
 * Raises one line over each crossing where a hop fits, the line with more
 * room first, and cuts the other line beneath the straighter one wherever
 * none does. No placement moves, and painters and interaction geometry share
 * the resulting curves. A crossing folded into two corners first moves onto
 * straight runs, taking a label on a moved lane along. A straight line hops
 * over a rounded corner where it can; every other contact at a corner is cut,
 * the corner staying whole.
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
		crossings,
		candidates: candidatesByRun(runs, edges, crossings),
		occupied: occupiedBoxes(drawing),
		bridges: [],
		replacements: edges.map(() => new Map<number, Curve[]>()),
		crossed: new Set(),
		hopped: new Set(),
	};
	for (const room of ROOMS) raiseAll(state, room);
	for (const crossing of state.crossings.filter((one) => !state.hopped.has(one))) {
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
