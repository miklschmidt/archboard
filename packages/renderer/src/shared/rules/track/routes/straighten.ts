// Straightening lanes (TASK-349): each run of lanes Graphviz left drifting
// from band to band stands on as few columns as hold it, so a long
// relationship descends in one line instead of jogging at every channel.
import {
	Occupancy,
	crossingsOf,
	laneRuns,
	meeting,
	meets,
	meetsAt,
	nearest,
	straightOn,
	type Chain,
	type LaneRun,
	type Station,
} from "#shared/rules/track/routes/chains.ts";
import { onePoint } from "#shared/rules/track/channels/channels.ts";
import type { Scene } from "#shared/rules/track/scene/scene.ts";

/**
 * Straighten every run of lanes onto one column where that column is free on
 * every band the run passes and keeps the frames {@link Scene.keepsFrames} asks: a long
 * relationship then descends in one line instead of jogging at every channel.
 * A run prefers the column of the station it leads into, then the one it
 * leaves, except that a run to or from a container prefers a column both its
 * neighbours reach straight; longer runs choose first. A run no one column is
 * free for takes as few columns as hold it, from the top down: Graphviz's
 * lanes drift a little from band to band along a long line, and a lane left
 * on each drew a step in every channel.
 * @param scene The placed scene.
 * @param chains Every relationship's chain.
 */
function straightenLanes(scene: Scene, chains: readonly Chain[]): void {
	const occupancy = new Occupancy(scene);
	const runs = laneRuns(chains).toSorted((one, other) => other.lanes.length - one.lanes.length);
	const bands = chains.map(
		({ stations }) => new Map(stations.map((station) => [station.band, station])),
	);
	for (const run of runs) {
		const xs = columnsOf(scene, run, occupancy, bands);
		run.lanes.forEach((lane, index) => {
			lane.x = xs[index]!;
			occupancy.take(lane);
		});
	}
}

/**
 * Where each lane of a run stands: all on one column where one holds them,
 * else on as few columns as hold them from the top down, unless that crosses
 * more lines than each lane standing alone on the free x nearest it.
 * @param scene The placed scene.
 * @param run The run.
 * @param occupancy What each band holds so far.
 * @param bands Every chain's stations, by band.
 * @returns Each lane's x, top to bottom.
 */
function columnsOf(
	scene: Scene,
	run: LaneRun,
	occupancy: Occupancy,
	bands: readonly ReadonlyMap<number, Station>[],
): number[] {
	const whole = columnOf(scene, run, occupancy, bands);
	if (whole !== undefined) return run.lanes.map(() => whole);
	const alone = run.lanes.map((lane, index) => {
		const one = {
			lanes: [lane],
			before: run.lanes[index - 1] ?? run.before,
			after: run.lanes[index + 1] ?? run.after,
		};
		return nearest(lane.x, occupancy.fitting(one), occupancy.edges([lane])) ?? lane.x;
	});
	const pieces: number[] = [];
	let before = run.before;
	while (pieces.length < run.lanes.length) {
		const start = pieces.length;
		const { end, x } = longestPiece(scene, { run, start, before }, occupancy, bands);
		// A piece placed is where the next one leaves from.
		for (const lane of run.lanes.slice(start, end)) {
			[lane.x, before] = [x ?? alone[start]!, lane];
			pieces.push(lane.x);
		}
	}
	const own = [run.before, ...run.lanes, run.after];
	const [split, apart] = [pieces, alone].map((xs) =>
		crossingsOf(own, [run.before.x, ...xs, run.after.x], bands),
	);
	return split! <= apart! ? pieces : alone;
}

/**
 * The longest stretch of a run's lanes from one of them down that one column
 * holds, and that column; a lane no column holds is a stretch of its own.
 * @param scene The placed scene.
 * @param from Where the stretch starts.
 * @param from.run The run.
 * @param from.start The place of its first lane.
 * @param from.before The station above that lane, placed.
 * @param occupancy What each band holds so far.
 * @param bands Every chain's stations, by band.
 * @returns Where the stretch ends, past its last lane, and its column if one holds it.
 */
function longestPiece(
	scene: Scene,
	from: { run: LaneRun; start: number; before: Station },
	occupancy: Occupancy,
	bands: readonly ReadonlyMap<number, Station>[],
): { end: number; x: number | undefined } {
	const { run, start, before } = from;
	let found: { end: number; x: number | undefined } = { end: start + 1, x: undefined };
	for (let end = start + 1; end <= run.lanes.length; end += 1) {
		const lanes = run.lanes.slice(start, end);
		const after = run.lanes[end] ?? run.after;
		const x = columnOf(scene, { lanes, before, after }, occupancy, bands);
		if (x === undefined) break;
		found = { end, x };
	}
	return found;
}

/**
 * Where a run from a block's port runs straight on into a card whose only
 * line it is: under the port, when the card's face reaches it. Nothing else
 * stands at that card's face to want its middle, and the lane would only
 * step across to it.
 * @param run The run.
 * @param bands Every chain's stations, by band.
 * @param near Where the run's lanes stand.
 * @returns The column, or none.
 */
function fromPort(
	run: LaneRun,
	bands: readonly ReadonlyMap<number, Station>[],
	near: number,
): number[] {
	const { before, after } = run;
	if (before.kind !== "card" || !onePoint(before.item) || after.kind !== "card") return [];
	const lines = bands.filter((chain) =>
		[...chain.values()].some(({ item }) => item === after.item),
	);
	return lines.length === 1 ? meeting(before, after, near) : [];
}

/**
 * The column a run of lanes takes: of the free columns it could stand on
 * (straight on for a run to or from a container, else the column of the
 * station it leads into, the one it leaves, or its own lanes', and the free
 * one nearest them), the one that crosses fewest other lines, the first of
 * them on a tie, and, drawn inline, none that crosses more lines than the
 * run where it stands: Graphviz ordered its lanes to cross few lines, and a
 * straight column that crosses more trades a step for a crossing. The Blocks
 * engine packs a block among others after it is routed, and there the
 * crossings it saved cost bends and crossings elsewhere.
 * @param scene The placed scene.
 * @param run The run.
 * @param occupancy What each band holds so far.
 * @param bands Every chain's stations, by band.
 * @returns The column, or nothing when no column is free on every band.
 */
function columnOf(
	scene: Scene,
	run: LaneRun,
	occupancy: Occupancy,
	bands: readonly ReadonlyMap<number, Station>[],
): number | undefined {
	const { lanes, before, after } = run;
	const straight = straightOn(scene, before, after);
	const xs = lanes.map(({ x }) => x).toSorted((one, other) => one - other);
	const median = xs[Math.floor(xs.length / 2)]!;
	const [columns, near] =
		straight.length > 0
			? [straight, straight[0]!]
			: [[...fromPort(run, bands, median), after.x, before.x, median, ...xs], median];
	const fits = occupancy.fitting(run);
	const found = nearest(near, fits, occupancy.edges(lanes));
	const free = [...columns.filter(fits), ...(found === undefined ? [] : [found])];
	const crossings = crossingsFor([run.before, ...run.lanes, run.after], bands);
	const counts = free.map((x) => crossings([run.before.x, ...run.lanes.map(() => x), run.after.x]));
	const fewest = Math.min(...counts);
	const crossesMore = scene.inline && fewest > standingCrossings(run, bands);
	return crossesMore ? undefined : free[counts.indexOf(fewest)];
}

/**
 * How many other chains a line would cross between one band and the next,
 * as `crossingsOf` in chains.ts counts them, for any x its own stations
 * stand at. Where the other chains meet each channel is read once, so a
 * search that weighs many columns for one line reads it once for all.
 * @param own The line's stations, or a run of them with the stations either side.
 * @param bands Every chain's stations, by band, as they stand while the search weighs.
 * @returns The count, for where the line's stations stand.
 */
function crossingsFor(
	own: readonly Station[],
	bands: readonly ReadonlyMap<number, Station>[],
): (xs: readonly number[]) => number {
	const others = own.slice(1).map((lower, index) => {
		const upper = own[index]!;
		return bands.flatMap((other) => {
			const [one, two] = [other.get(upper.band), other.get(lower.band)];
			if (one === undefined || two === undefined || meets(one, upper) || meets(two, lower))
				return [];
			return [[meetsAt(one, two.x), meetsAt(two, one.x)] as const];
		});
	});
	return (xs) =>
		own.slice(1).reduce((count, lower, index) => {
			const [above, below] = [xs[index]!, xs[index + 1]!];
			const [top, bottom] = [meetsAt(own[index]!, below, above), meetsAt(lower, above, below)];
			return count + others[index]!.filter(([one, two]) => (top - one) * (bottom - two) < 0).length;
		}, 0);
}

/**
 * How many other chains a run crosses where its lanes stand.
 * @param run The run.
 * @param bands Every chain's stations, by band.
 * @returns The count.
 */
function standingCrossings(run: LaneRun, bands: readonly ReadonlyMap<number, Station>[]): number {
	const own = [run.before, ...run.lanes, run.after];
	return crossingsOf(
		own,
		own.map(({ x }) => x),
		bands,
	);
}

export { crossingsFor, straightenLanes };
