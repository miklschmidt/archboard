// Straightening lanes (TASK-349): each run of lanes Graphviz left drifting
// from band to band stands on as few columns as hold it, so a long
// relationship descends in one line instead of jogging at every channel.
import {
	Occupancy,
	crossingsOf,
	inversions,
	laneRuns,
	nearest,
	straightOn,
	type Chain,
	type LaneRun,
	type Station,
} from "@/transformers/semantic-renderer/lib/track/chains";
import type { Scene } from "@/transformers/semantic-renderer/lib/track/scene";

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
		return nearest(lane.x, (x) => occupancy.fits(one, x), occupancy.edges([lane])) ?? lane.x;
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
 * The column a run of lanes takes: of the free columns it could stand on
 * (straight on for a run to or from a container, else the column of the
 * station it leads into, the one it leaves, or its own lanes', and the free
 * one nearest them), the one that crosses fewest other lines, the first of
 * them on a tie, and none that crosses more lines than the run where it
 * stands: Graphviz ordered its lanes to cross few lines, and a straight
 * column that crosses more trades a step for a crossing.
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
		straight.length > 0 ? [straight, straight[0]!] : [[after.x, before.x, median, ...xs], median];
	const found = nearest(near, (x) => occupancy.fits(run, x), occupancy.edges(lanes));
	const free = [
		...columns.filter((x) => occupancy.fits(run, x)),
		...(found === undefined ? [] : [found]),
	];
	const counts = free.map((x) => inversions(run, x, bands));
	const fewest = Math.min(...counts);
	return fewest > standingCrossings(run, bands) ? undefined : free[counts.indexOf(fewest)];
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

export { straightenLanes };
