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
// lines crossing a cluster hop it one each, a dashed one crossing a solid
// cluster plainly, where every hop fits; where they cannot all stand, the
// cluster's line rises over all of it under one crest; only where that fails
// too does it rise over single crossings of it, and then only where it is the
// upper line at the rest. With hops on crossing lines kept a hop's radius apart, a line
// is never above at one crossing of a cluster and beneath at the next, so the
// hops along one bundle layer the same way. A rising line keeps a bend's room
// past its feet, except in those last two steps, where less will do over a
// solid line.
//
// A crossing no plan settles still hops where a hop fits: the line that would
// stay whole rises over it alone, else the other line, even a dashed one over
// a solid one and even out of step with its cluster.
//
// Where no hop stands, the two lines cross plainly and both stay whole: a gap
// with no arc over it reads as a break in the line (TASK-408). Only beside a
// join is a line cut, clear of the join's mark, and the line that joins stays
// whole. A trunk is one drawn line (`drawn-lines.ts`): a line crosses it once,
// and it hops as its drawer does.
import { BEND_RADIUS, BRIDGE_RADIUS } from "#shared/constants/spacing.ts";
import type { ArchitectureDrawing, DrawingEdge, LineLook } from "#shared/rules/render/drawing.ts";
import type { Curve } from "#shared/rules/layout/routes/curves.ts";
import {
	drawnCrossings,
	joinNear,
	pieceOf,
	straightness,
	straightRuns,
	type Bridge,
	type DrawnCrossing,
	type Line,
	type Run,
} from "#shared/rules/layout/routes/drawn-lines.ts";
import {
	atOn,
	clustersOf,
	sidesOf,
	type Cluster,
} from "#shared/rules/layout/routes/crossing-clusters.ts";
import { unfoldCrossings } from "#shared/rules/layout/routes/folded-crossings.ts";
import {
	carried,
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
} from "#shared/rules/layout/routes/hop-geometry.ts";

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

/** Rises that stand together or not at all, and the crossings left plain when they do. */
interface Plan {
	readonly rises: readonly Rise[];
	readonly plain: readonly DrawnCrossing[];
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
 * part of a cluster, its line would be the upper one at the rest of it, so it
 * is never above at one crossing of a cluster and beneath at the next.
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
 * Stand every rise of a plan and leave its plain crossings plain, or do
 * nothing.
 * @param state What is settled so far, extended in place.
 * @param plan The plan.
 */
function attempt(state: Settling, plan: Plan): void {
	if (plan.plain.some((crossing) => state.settled.has(crossing))) return;
	const crests: Hop[] = [];
	for (const rise of plan.rises) {
		const curve = crestOf(state, rise, plan.room, crests);
		if (curve === undefined) return;
		crests.push({ curve, axis: rise.cluster.run.axis });
	}
	for (const [index, rise] of plan.rises.entries()) stand(state, rise, crests[index]!.curve);
	for (const crossing of plan.plain) cross(state, crossing);
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
	for (const crossing of rise.crossings) state.settled.add(crossing);
	const under = rise.crossings.flatMap((crossing) =>
		idsOf(edges, sidesOf(rise.cluster, crossing)[1]),
	);
	state.bridges.push({ edgeId: edges[run.edgeIndex]!.edge.id, under: [...new Set(under)], curve });
	// Every route of the trunk hops with its drawer: `crestAlong` found each
	// one that reaches the crest holding all of it.
	const members = new Set(
		rise.crossings.flatMap((crossing) => sidesOf(rise.cluster, crossing)[0].members),
	);
	for (const member of members) {
		const replacement = state.replacements[member.edgeIndex]!;
		replacement.set(member.segmentIndex, [
			...(replacement.get(member.segmentIndex) ?? []),
			carried(curve, run, member),
		]);
	}
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
 * A plan with its place in the order plans are tried: the plans whose rising
 * lines outweigh the lines beneath them, then those between equals, then
 * those whose rising lines are lighter; within each, by stage; then the
 * roomier; then the later-painted.
 * @param state The drawing and its runs.
 * @param stage Which stage it belongs to.
 * @param room The straight line each rising line keeps past its feet.
 * @param rises What rises.
 * @param plain Crossings of a cluster's line left plain, and that cluster.
 * @returns The plan, unless a line in it may not stand over the one beneath it.
 */
function planOf(
	state: Settling,
	stage: number,
	room: number,
	rises: readonly Rise[],
	plain: readonly [readonly DrawnCrossing[], Cluster?] = [[]],
): Plan[] {
	const [crossings, cluster] = plain;
	// A plain crossing still has an upper line: the cluster's line, over its crosser.
	const pairs = [
		...rises.flatMap((rise) => rise.crossings.map((crossing) => sidesOf(rise.cluster, crossing))),
		...crossings.map((crossing) => sidesOf(cluster!, crossing)),
	];
	const leads = pairs.map(([upper, lower]) => leadOver(state, upper, lower));
	if (leads.some((lead) => lead === undefined)) return [];
	const weight = Math.min(...leads.map((lead) => lead![0]));
	const roomy = Math.min(ROOM_CAP, ...rises.map((rise) => roomOf(state.runs, rise)));
	const painted = Math.max(-1, ...rises.map((rise) => rise.cluster.run.edgeIndex));
	// Round the room so a hair of floating noise never outranks paint order.
	const key = [-Math.sign(weight), stage, -Math.round(roomy / STRAIGHTER), -painted];
	return [{ rises, plain: crossings, room, key }];
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
 * The plan of a cluster's crossers hopping it one each. A dashed crosser of a
 * solid line may not rise over it, and its crossing is left plain instead: a
 * solid line under one long crest over dashed lines close together read worse
 * (the owner, 2026-09-27).
 * @param state The drawing, its runs and clusters.
 * @param cluster The cluster.
 * @returns The plan, when every crosser may do one or the other.
 */
function oneEach(state: Settling, cluster: Cluster): Plan[] {
	const rises: Rise[] = [];
	const plain: DrawnCrossing[] = [];
	for (const crossing of cluster.crossings) {
		const [line, crosser] = sidesOf(cluster, crossing);
		if (leadOver(state, crosser, line) === undefined) {
			plain.push(crossing);
			continue;
		}
		const rise = wholeOf(otherCluster(state, cluster, crossing));
		if (!rises.some((one) => one.cluster === rise.cluster)) rises.push(rise);
	}
	return planOf(state, 0, FULL_ROOM, rises, [plain, cluster]);
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
 * Settle a crossing that no hop stands over. The two lines cross plainly and
 * both stay whole, since a gap with no arc over it reads as a break in the line
 * (TASK-408). Only beside a join is a line cut: the line that joins stays
 * whole, and the other is cut beneath it clear of the join's mark, so the
 * crossing does not read as a four-way join.
 * @param state What is settled so far, extended in place.
 * @param crossing The crossing.
 */
function cross(state: Settling, crossing: DrawnCrossing): void {
	state.settled.add(crossing);
	const [joined, oneJoins] = upperOf(state, crossing);
	if (!joined) return;
	const { edges } = state.drawing;
	const [one, other] = crossing.lines;
	const [upper, lower] = oneJoins ? [one, other] : [other, one];
	state.bridges.push({
		edgeId: edges[upper.drawer.edgeIndex]!.edge.id,
		under: idsOf(edges, lower),
		curve: pieceOf(upper.drawer, atOn(upper.drawer, crossing), BRIDGE_RADIUS),
		join: true,
	});
}

/**
 * Which of a crossing's two lines would stay whole: a line that joins or parts
 * there, since cutting it would sever the join from its mark; else the
 * weightier, the solid, the one that runs straighter through the crossing, the
 * later-painted.
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

/** Each line's route with its hops, and the ink each crossing clears beneath it. */
interface Bridged {
	readonly edges: readonly DrawingEdge[];
	readonly bridges: readonly Bridge[];
}

/**
 * Raises one line over each crossing where a hop fits, and lets the two lines
 * cross plainly wherever none does, on routes whose folded crossings have
 * already moved onto straight runs. No placement moves, and painters and
 * interaction geometry share the resulting curves.
 * @param drawing The drawing after routing, rounding, label placement and unfolding.
 * @param lines How each line is drawn, by relationship id, as measurement settled it.
 * @returns Updated edges and the local ink each crossing clears beneath it.
 */
function bridgeUnfolded(
	drawing: ArchitectureDrawing,
	lines: ReadonlyMap<string, LineLook>,
): Bridged {
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
		settled: new Set(),
	};
	const plans = clusters.flatMap((cluster) => plansOf(state, cluster)).toSorted(byKey);
	for (const plan of plans) attempt(state, plan);
	for (const crossing of crossings) {
		if (!state.settled.has(crossing) && !hopAlone(state, crossing)) cross(state, crossing);
	}
	return {
		edges: edges.map((edge, index) => replaceRuns(edge, state.replacements[index]!)),
		bridges: state.bridges,
	};
}

/**
 * Settles a drawing's crossings: a crossing folded into two corners first
 * moves onto straight runs, taking a label on a moved lane along, and then
 * each crossing is hopped or crossed plainly (`bridgeUnfolded`).
 * @param settled The drawing after routing, rounding and label placement.
 * @param lines How each line is drawn, by relationship id, as measurement settled it.
 * @returns Updated edges and the local ink each crossing clears beneath it.
 */
function bridgeCrossings(
	settled: ArchitectureDrawing,
	lines: ReadonlyMap<string, LineLook>,
): Bridged {
	return bridgeUnfolded(unfoldCrossings(settled), lines);
}

export { bridgeCrossings, bridgeUnfolded };
