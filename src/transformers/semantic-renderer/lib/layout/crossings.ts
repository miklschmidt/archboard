// Crossings belong to the final drawing: route and paint order are settled here.
//
// One rule, for every engine, since every engine hands its routes to this pass.
// Where two lines cross, one of them hops over the other (`hop-geometry.ts`
// says where a hop may stand), and every hop bulges the same way, so two never
// face each other. The more emphasised line rises; between equals, the line
// with more straight room, then the later-painted. A dashed or dotted line
// never rises over a solid one, since its arc barely shows and the solid line
// would read as broken. A lighter line rises over a weightier one only where
// that one cannot.
//
// Crossings along one run closer than a crest's reach are a cluster. The
// lines crossing a cluster hop it one each, a dashed one beneath a solid
// cluster cut, where every hop fits; where they cannot all stand, the
// cluster's line rises over all of it under one crest; only where that fails
// too does it rise over single crossings of it, and then only where it stays
// whole at the rest. With hops on crossing lines kept a hop's radius apart,
// a line is never above at one crossing of a cluster and beneath at the next,
// so the hops along one bundle layer the same way. A rising line keeps a
// bend's room past its feet, except in those last two steps, where less will
// do over a solid line: a crossing with no arc reads as none.
//
// A crossing no plan settles still hops where a hop fits: the line that would
// stay whole rises over it alone, else the other line, even a dashed one over
// a solid one and even out of step with its cluster. A crossing with no arc
// reads as no crossing, least of all a dashed line's gap among its own.
//
// Only where no hop stands is a line cut: the line that joins there stays
// whole, else a dashed one over a solid one, whose gap would be lost among
// its own; else the weightier, the solid, the straighter, the later-painted. A
// trunk is one drawn line (`drawn-lines.ts`): a line crosses it once, and it
// hops as its drawer does.
import { BEND_RADIUS, BRIDGE_RADIUS } from "@/transformers/semantic-renderer/lib/design";
import type {
	ArchitectureDrawing,
	DrawingEdge,
	LineLook,
} from "@/transformers/semantic-renderer/lib/drawing";
import { cornerClearances } from "@/transformers/semantic-renderer/lib/layout/corner-crossings";
import type { Curve } from "@/transformers/semantic-renderer/lib/layout/curves";
import {
	crossingKey,
	crossingOf,
	drawnCrossings,
	joinNear,
	pieceOf,
	straightness,
	straightRuns,
	type Bridge,
	type DrawnCrossing,
	type Line,
	type Run,
} from "@/transformers/semantic-renderer/lib/layout/drawn-lines";
import {
	atOn,
	clustersOf,
	sidesOf,
	type Cluster,
} from "@/transformers/semantic-renderer/lib/layout/crossing-clusters";
import { unfoldCrossings } from "@/transformers/semantic-renderer/lib/layout/folded-crossings";
import {
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
} from "@/transformers/semantic-renderer/lib/layout/hop-geometry";

/** The straight line a rising line keeps past each foot: a bend's room, so a bend a few points past a hop never draws one squiggle with it. */
const FULL_ROOM = HOP_MARGIN + BEND_RADIUS;

/** The least a rising line keeps past each foot, where no line has a bend's room. */
const LEAST_ROOM = HOP_MARGIN;

/** Straight line on a crossing's shorter side past which a line has all the room a hop could want. */
const ROOM_CAP = BRIDGE_RADIUS + FULL_ROOM;

/** How much straighter one line must run through a crossing to count as the straighter. */
const STRAIGHTER = 0.5;

/** How near a join a cut must be to keep the joining line whole: within a hop's radius. */
const JOIN_REACH = BRIDGE_RADIUS;

/** How much each emphasis weighs when choosing the line that rises. */
const WEIGHT = { hero: 2, normal: 1, muted: 0 } as const;

/** One run rising over some crossings of one of its clusters, under one hop or crest. */
interface Rise {
	readonly cluster: Cluster;
	readonly crossings: readonly DrawnCrossing[];
}

/** Rises that stand together or not at all, and the crossings cut when they do. */
interface Plan {
	readonly rises: readonly Rise[];
	readonly cuts: readonly DrawnCrossing[];
	/** The straight line each rising line keeps past its feet. */
	readonly room: number;
	/** Where it comes in the order plans are tried, lower first. */
	readonly key: readonly number[];
}

/** Everything settling the crossings reads and records. */
interface Settling extends HopScene {
	/** How each line is drawn, by relationship id. */
	readonly lines: ReadonlyMap<string, LineLook>;
	/** Each crossing's cluster along each of its two lines. */
	readonly clusters: ReadonlyMap<DrawnCrossing, readonly [Cluster, Cluster]>;
	readonly bridges: Bridge[];
	/** The hops each route's straight segments carry, by segment. */
	readonly replacements: readonly Map<number, Curve[]>[];
	/** Pairs of pieces whose contact is marked. */
	readonly crossed: Set<string>;
	readonly settled: Set<DrawnCrossing>;
}

/**
 * A crossing's cluster along its other line than a given cluster's.
 * @param state The clusters.
 * @param cluster One of the crossing's clusters.
 * @param crossing The crossing.
 * @returns The cluster along the other line.
 */
function otherCluster(state: Settling, cluster: Cluster, crossing: DrawnCrossing): Cluster {
	return state.clusters.get(crossing)![1 - cluster.side]!;
}

/**
 * Whether a rise may be tried: its crossings are unsettled, and, rising over
 * part of a cluster, its line would stay whole where the rest of it is cut,
 * so it is never above at one crossing of a cluster and beneath at the next.
 * @param state What is settled so far.
 * @param rise The rise.
 * @returns True when it may.
 */
function open(state: Settling, rise: Rise): boolean {
	const { cluster } = rise;
	return cluster.crossings.every((crossing) =>
		rise.crossings.includes(crossing)
			? !state.settled.has(crossing)
			: state.settled.has(crossing) || (upperOf(state, crossing)[1] ? 0 : 1) === cluster.side,
	);
}

/**
 * The crest a rise draws, when it may stand now.
 * @param state What is settled so far.
 * @param rise The rise.
 * @param room The straight line kept past each foot.
 * @param pending Crests standing with it.
 * @returns The crest.
 */
function crestOf(
	state: Settling,
	rise: Rise,
	room: number,
	pending: readonly Hop[],
): Curve | undefined {
	if (!open(state, rise)) return undefined;
	const { run } = rise.cluster;
	const places = rise.crossings.map((crossing) => atOn(run, crossing));
	const curve = crestAlong(state.runs, run, places, room);
	if (curve === undefined) return undefined;
	const beneath = rise.crossings.map((crossing) => sidesOf(rise.cluster, crossing)[1].drawer);
	return crowded(state, run, beneath, curve, pending) || nearOwnHead(state, run, curve)
		? undefined
		: curve;
}

/**
 * Stand every rise of a plan and make its cuts, or do nothing.
 * @param state What is settled so far, extended in place.
 * @param plan The plan.
 */
function attempt(state: Settling, plan: Plan): void {
	if (plan.cuts.some((crossing) => state.settled.has(crossing))) return;
	const crests: Hop[] = [];
	for (const rise of plan.rises) {
		const curve = crestOf(state, rise, plan.room, crests);
		if (curve === undefined) return;
		crests.push({ curve, axis: rise.cluster.run.axis });
	}
	for (const [index, rise] of plan.rises.entries()) stand(state, rise, crests[index]!.curve);
	for (const crossing of plan.cuts) cut(state, crossing);
}

/**
 * Record one standing hop.
 * @param state What is settled so far, extended in place.
 * @param rise The rise.
 * @param curve Its crest.
 */
function stand(state: Settling, rise: Rise, curve: Curve): void {
	const { edges } = state.drawing;
	const { run } = rise.cluster;
	for (const crossing of rise.crossings) {
		state.settled.add(crossing);
		settle(state.crossed, crossing);
	}
	const under = rise.crossings.flatMap((crossing) =>
		idsOf(edges, sidesOf(rise.cluster, crossing)[1]),
	);
	state.bridges.push({ edgeId: edges[run.edgeIndex]!.edge.id, under: [...new Set(under)], curve });
	const replacement = state.replacements[run.edgeIndex]!;
	replacement.set(run.segmentIndex, [...(replacement.get(run.segmentIndex) ?? []), curve]);
	state.hops.push({ curve, axis: run.axis });
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
 * How a line stands when choosing which rises: its emphasis, then whether it
 * is drawn solid, as the vault's policy draws its relationship.
 * @param state The routes and how each is drawn.
 * @param line The line.
 * @returns Its weight and solidity.
 */
function standingOf(state: Settling, line: Line): readonly [number, number] {
	const { edge } = state.drawing.edges[line.drawer.edgeIndex]!;
	return [WEIGHT[edge.emphasis], lookOf(state.lines, edge.id).dash === "solid" ? 1 : 0];
}

/**
 * How far one line stands ahead of another it would rise over, in weight and
 * in solidity; or nothing where it may not rise over it at all: a dashed or
 * dotted line over a solid one.
 * @param state The routes and how each is drawn.
 * @param upper The line that would stay whole.
 * @param lower The line beneath it.
 * @returns The lead in weight and in solidity.
 */
function leadOver(
	state: Settling,
	upper: Line,
	lower: Line,
): readonly [number, number] | undefined {
	const [weight, solid] = standingOf(state, upper);
	const [under, solidUnder] = standingOf(state, lower);
	if (solid < solidUnder) return undefined;
	return [weight - under, solid - solidUnder];
}

/**
 * How much straight room a rise's line has at its crossings, up to all a hop
 * could want, so that between lines that both have it, paint order decides.
 * @param runs Every run.
 * @param rise The rise.
 * @returns The least room.
 */
function roomOf(runs: readonly Run[], rise: Rise): number {
	const { run } = rise.cluster;
	return Math.min(
		...rise.crossings.map((crossing) =>
			Math.min(ROOM_CAP, straightness(runs, run, crossing.point[run.axis])),
		),
	);
}

/**
 * The lines that stay whole in a plan, each with the one beneath it.
 * @param rises What rises.
 * @param cuts Crossings cut beneath a cluster's line.
 * @param cluster That cluster.
 * @returns Each pair.
 */
function pairsOf(
	rises: readonly Rise[],
	cuts: readonly DrawnCrossing[],
	cluster: Cluster | undefined,
): (readonly [Line, Line])[] {
	return [
		...rises.flatMap((rise) => rise.crossings.map((crossing) => sidesOf(rise.cluster, crossing))),
		...cuts.map((crossing) => sidesOf(cluster!, crossing)),
	];
}

/**
 * A plan with its place in the order plans are tried: the plans whose rising
 * lines outweigh the lines beneath them, then those between equals, then
 * those whose rising lines are lighter; within each, by stage; then the
 * roomier; then the later-painted.
 * @param state The drawing and its runs.
 * @param stage Which stage it belongs to.
 * @param room The straight line each rising line keeps past its feet.
 * @param rises What rises.
 * @param cutting Crossings cut beneath a cluster's line, and that cluster.
 * @returns The plan, unless a line in it may not stand over the one beneath it.
 */
function planOf(
	state: Settling,
	stage: number,
	room: number,
	rises: readonly Rise[],
	cutting: readonly [readonly DrawnCrossing[], Cluster?] = [[]],
): Plan[] {
	const [cuts, cluster] = cutting;
	const leads = pairsOf(rises, cuts, cluster).map(([upper, lower]) =>
		leadOver(state, upper, lower),
	);
	if (leads.some((lead) => lead === undefined)) return [];
	const weight = Math.min(...leads.map((lead) => lead![0]));
	const roomy = Math.min(ROOM_CAP, ...rises.map((rise) => roomOf(state.runs, rise)));
	const painted = Math.max(-1, ...rises.map((rise) => rise.cluster.run.edgeIndex));
	// Round the room so a hair of floating noise never outranks paint order.
	const key = [-Math.sign(weight), stage, -Math.round(roomy / STRAIGHTER), -painted];
	return [{ rises, cuts, room, key }];
}

/**
 * Whether the lines beneath a rise pass beneath it at every crossing of it.
 * @param state The runs.
 * @param rise The rise.
 * @returns True when every line beneath runs straight under its crest.
 */
function passable(state: Settling, rise: Rise): boolean {
	return rise.crossings.every((crossing) =>
		passesBeneath(state.runs, sidesOf(rise.cluster, crossing)[1].drawer, crossing.point),
	);
}

/**
 * The whole of a cluster rising.
 * @param cluster The cluster.
 * @returns The rise.
 */
function wholeOf(cluster: Cluster): Rise {
	return { cluster, crossings: cluster.crossings };
}

/**
 * The plan of a cluster's crossers hopping it one each, a dashed one beneath a
 * solid cluster cut instead.
 * @param state The drawing, its runs and clusters.
 * @param cluster The cluster.
 * @returns The plan, when every crosser may do one or the other.
 */
function oneEach(state: Settling, cluster: Cluster): Plan[] {
	const rises: Rise[] = [];
	const cuts: DrawnCrossing[] = [];
	for (const crossing of cluster.crossings) {
		const [line, crosser] = sidesOf(cluster, crossing);
		if (leadOver(state, crosser, line) === undefined) {
			cuts.push(crossing);
			continue;
		}
		const rise = wholeOf(otherCluster(state, cluster, crossing));
		if (!rises.some((one) => one.cluster === rise.cluster)) rises.push(rise);
	}
	return planOf(state, 0, FULL_ROOM, rises, [cuts, cluster]);
}

/**
 * The plans one cluster offers, by stage: its crossers hopping it one each
 * with a bend's room, or, for a lone crossing no other line crosses among
 * others, its line hopping it; then its line rising over all of it with a
 * bend's room, and then with less; last, its line rising over any single
 * crossing of it with less room.
 * @param state The drawing, its runs and clusters.
 * @param cluster The cluster.
 * @returns The plans.
 */
function plansOf(state: Settling, cluster: Cluster): Plan[] {
	const whole = wholeOf(cluster);
	const singles = cluster.crossings.map((crossing) => ({ cluster, crossings: [crossing] }));
	const several = cluster.crossings.length > 1;
	// A lone crossing another line crosses among others waits for that line's
	// cluster to be settled.
	const alone =
		!several && otherCluster(state, cluster, cluster.crossings[0]!).crossings.length === 1;
	const plans = [
		...(several ? oneEach(state, cluster) : []),
		...(alone ? planOf(state, 0, FULL_ROOM, [whole]) : []),
		...(several ? planOf(state, 1, FULL_ROOM, [whole]) : []),
		...(several ? planOf(state, 2, LEAST_ROOM, [whole]) : []),
		...singles.flatMap((single) => planOf(state, 3, LEAST_ROOM, [single])),
	];
	return plans.filter((plan) => plan.rises.every((rise) => passable(state, rise)));
}

/**
 * Compare two plans' places in the order.
 * @param a One plan.
 * @param b Another.
 * @returns Negative when `a` goes first.
 */
function byKey(a: Plan, b: Plan): number {
	const index = a.key.findIndex((value, at) => value !== b.key[at]);
	return index === -1 ? 0 : a.key[index]! - b.key[index]!;
}

/**
 * Hop a crossing no plan settled: the line that would stay whole where it is
 * cut rises over it alone first, then the other line, with the least room;
 * bulging the usual way first, then, where only the other side is clear of a
 * bend, the other way. A crossing where a line joins or parts is left to be
 * cut clear of the join.
 * @param state What is settled so far, extended in place.
 * @param crossing The crossing.
 * @returns True when a hop stands.
 */
function hopAlone(state: Settling, crossing: DrawnCrossing): boolean {
	const [joined, firstStays] = upperOf(state, crossing);
	if (joined) return false;
	const [first, second] = state.clusters.get(crossing)!;
	const order = firstStays ? [first, second] : [second, first];
	return ([1, -1] as const).some((bulge) =>
		order.some((cluster) => riseAlone(state, cluster, crossing, bulge)),
	);
}

/**
 * Stand one line's hop over a single crossing, where the line has the least
 * room a hop needs, the line beneath runs straight under it, and nothing
 * crowds it.
 * @param state What is settled so far, extended in place.
 * @param cluster The rising line's cluster.
 * @param crossing The crossing.
 * @param bulge Which way the hop bulges.
 * @returns True when it stands.
 */
function riseAlone(
	state: Settling,
	cluster: Cluster,
	crossing: DrawnCrossing,
	bulge: Bulge,
): boolean {
	const { run } = cluster;
	const beneath = sidesOf(cluster, crossing)[1].drawer;
	if (!passesBeneath(state.runs, beneath, crossing.point, bulge)) return false;
	const curve = crestAlong(state.runs, run, [atOn(run, crossing)], LEAST_ROOM, bulge);
	if (curve === undefined || crowded(state, run, [beneath], curve, [])) return false;
	if (nearOwnHead(state, run, curve)) return false;
	stand(state, { cluster, crossings: [crossing] }, curve);
	return true;
}

/**
 * Cut one line beneath the other where no hop stands, clear of the join's
 * mark when there is one, and never a dashed line beneath a solid one.
 * @param state What is settled so far, extended in place.
 * @param crossing The crossing.
 */
function cut(state: Settling, crossing: DrawnCrossing): void {
	const { edges } = state.drawing;
	const [joined, above] = upperOf(state, crossing);
	// A dashed or dotted line's gap is lost among its own, so where one crosses
	// a solid line with no hop, the solid line is cut and the dashed stays whole.
	const [oneSolid, otherSolid] = crossing.lines.map((line) => standingOf(state, line)[1]);
	const oneAbove = joined || oneSolid === otherSolid ? above : oneSolid! < otherSolid!;
	const [one, other] = crossing.lines;
	const [upper, lower] = oneAbove ? [one, other] : [other, one];
	state.settled.add(crossing);
	settle(state.crossed, crossing);
	state.bridges.push({
		edgeId: edges[upper.drawer.edgeIndex]!.edge.id,
		under: idsOf(edges, lower),
		curve: pieceOf(upper.drawer, atOn(upper.drawer, crossing), BRIDGE_RADIUS),
		...(joined ? { join: true as const } : {}),
	});
}

/**
 * Which of a crossing's two lines stays whole where no hop fits: a line that
 * joins or parts there, since cutting it would sever the join from its mark;
 * else the weightier, the solid, the one that runs straighter through the
 * crossing, the later-painted.
 * @param state The drawing and its runs.
 * @param crossing The crossing.
 * @returns Whether the one staying whole joins there, and whether it is the first line.
 */
function upperOf(state: Settling, crossing: DrawnCrossing): readonly [boolean, boolean] {
	const { runs } = state;
	const [oneJoins, otherJoins] = crossing.lines.map(({ drawer }) =>
		joinNear(runs, drawer, crossing.point[drawer.axis], JOIN_REACH),
	);
	if (oneJoins !== otherJoins) return [true, oneJoins!];
	const [one, other] = crossing.lines.map((line) => [
		...standingOf(state, line),
		straightness(runs, line.drawer, crossing.point[line.drawer.axis]) / STRAIGHTER,
		line.drawer.edgeIndex,
	]);
	const index = one!.findIndex((value, at) => Math.abs(value - other![at]!) >= 1);
	return [false, index !== -1 && one![index]! > other![index]!];
}

/**
 * Raises one line over each crossing where a hop fits, and cuts one line
 * beneath the other wherever none does. No placement moves, and painters and
 * interaction geometry share the resulting curves. A crossing folded into two
 * corners first moves onto straight runs, taking a label on a moved lane
 * along. Contacts at rounded corners are cut, the corner staying whole.
 * @param settled The drawing after routing, rounding and label placement.
 * @param lines How each line is drawn, by relationship id, as measurement settled it.
 * @returns Updated edges and the local ink each crossing clears beneath it.
 */
function bridgeCrossings(
	settled: ArchitectureDrawing,
	lines: ReadonlyMap<string, LineLook>,
): {
	readonly edges: readonly DrawingEdge[];
	readonly bridges: readonly Bridge[];
} {
	const drawing = unfoldCrossings(settled);
	const { edges } = drawing;
	const runs = straightRuns(edges);
	const crossings = drawnCrossings(edges, runs);
	const [clusters, of] = clustersOf(crossings);
	const state: Settling = {
		drawing,
		runs,
		clusters: of,
		lines,
		keepouts: keepoutsOf(drawing, lines),
		hops: [],
		bridges: [],
		replacements: edges.map(() => new Map<number, Curve[]>()),
		crossed: new Set(),
		settled: new Set(),
	};
	const plans = clusters.flatMap((cluster) => plansOf(state, cluster)).toSorted(byKey);
	for (const plan of plans) attempt(state, plan);
	for (const crossing of crossings) {
		if (!state.settled.has(crossing) && !hopAlone(state, crossing)) cut(state, crossing);
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
