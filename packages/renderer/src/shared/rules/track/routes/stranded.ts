// Lanes left off their ends' columns (visual polish). Lanes are straightened
// before the labels slide and the ports are placed, so a run of lanes whose
// column a label box stood on keeps a column neither of its ends reaches, and
// turns twice more to reach them. Once the labels have slid, each such run
// moves onto the column of one of its ends where that is free and crosses no
// more lines; once the ports are placed, a run standing less than a lane off
// its port moves onto the port's column, and each run to or from a container
// onto its straight column where a label stood in its way before sliding.
import {
	LANE,
	Occupancy,
	freeWithout,
	inversions,
	laneRuns,
	piecesOf,
	reachOf,
	straightOn,
	type Chain,
	type LaneRun,
	type Station,
} from "#shared/rules/track/routes/chains.ts";
import { centreX, type Scene } from "#shared/rules/track/scene/scene.ts";

/**
 * Where a station meets a line at an x straight: a label at its centre, where
 * it stands once slid, or a card anywhere on its face.
 * @param station The station.
 * @param x The x.
 * @returns True when a line at x reaches it without a turn.
 */
function meetsStraight(station: Station, x: number): boolean {
	if (station.kind === "label") return Math.abs(centreX(station.item!) - x) < 0.5;
	const [low, high] = reachOf(station);
	return x >= low - 0.5 && x <= high + 0.5;
}

/**
 * The column where a station meets a line nearest an x: a label's centre, or
 * the nearest point of a card's face.
 * @param station The station.
 * @param near The x.
 * @returns The column.
 */
function meetingColumn(station: Station, near: number): number {
	if (station.kind === "label") return centreX(station.item!);
	const [low, high] = reachOf(station);
	return Math.min(high, Math.max(low, near));
}

/**
 * Once the labels have slid, move each run of lanes that stands on no one
 * column, or on one neither of its ends reaches straight, onto the column of
 * the station it leads into or the one it leaves, the first that is free and
 * crosses no more lines than where it stands: a
 * label that stood in its way may have moved aside, and a run left where it
 * stood turns twice to reach its ends. A run that stays on several columns
 * has its steps closed instead ({@link closeSteps}).
 * @param scene The scene, its labels slid.
 * @param chains Every relationship's chain.
 * @returns Whether any run moved.
 */
function unstrandLanes(scene: Scene, chains: readonly Chain[]): boolean {
	return eachRun(
		scene,
		chains,
		(run, free, bands) => unstrandRun(run, free, bands) || closeSteps(run, free, bands),
	);
}

/**
 * Close the steps inside every run of lanes again once the labels have
 * settled onto the lanes toward their cards' ports: a label that moved onto
 * the lane below it leaves the piece above it meeting neither neighbour
 * ({@link closeSteps}).
 * @param scene The scene, its labels settled.
 * @param chains Every relationship's chain.
 * @returns Whether any run moved.
 */
function closeLaneSteps(scene: Scene, chains: readonly Chain[]): boolean {
	return eachRun(scene, chains, closeSteps);
}

/**
 * Try to move every run of lanes, each with what its bands hold without it.
 * @param scene The scene.
 * @param chains Every relationship's chain.
 * @param move Move one run; answers whether it moved.
 * @returns Whether any run moved.
 */
function eachRun(
	scene: Scene,
	chains: readonly Chain[],
	move: (run: LaneRun, free: Occupancy, bands: readonly ReadonlyMap<number, Station>[]) => boolean,
): boolean {
	const runs = laneRuns(chains);
	const bands = chains.map(
		({ stations }) => new Map(stations.map((station) => [station.band, station])),
	);
	return runs.map((run) => move(run, freeWithout(scene, runs, run), bands)).some(Boolean);
}

/**
 * Move a run that stands on no one column, or on one neither of its ends
 * reaches straight, onto the column of the station it leads into or the one
 * it leaves, the first that is free and crosses no more lines.
 * @param run The run.
 * @param free What each band holds without it.
 * @param bands Every chain's stations, by band.
 * @returns Whether it moved.
 */
function unstrandRun(
	run: LaneRun,
	free: Occupancy,
	bands: readonly ReadonlyMap<number, Station>[],
): boolean {
	const x = run.lanes[0]!.x;
	const straight = run.lanes.every((lane) => lane.x === x);
	if (straight && (meetsStraight(run.before, x) || meetsStraight(run.after, x))) return false;
	const crossed = inversions(run, x, bands);
	const column = [run.after, run.before]
		.map((station) => meetingColumn(station, x))
		.find((one) => free.fits(run, one) && inversions(run, one, bands) <= crossed);
	if (column === undefined) return false;
	for (const lane of run.lanes) lane.x = column;
	return true;
}

/**
 * Close the steps inside a run that stays on several columns: each piece of
 * it on one column that meets neither the piece or label above it nor the one
 * below it moves onto the column of one of them, the lower first, where that
 * is free and crosses no more lines. The line then changes column once where
 * it changed twice.
 * @param run The run.
 * @param free What each band holds without it.
 * @param bands Every chain's stations, by band.
 * @returns Whether any piece moved.
 */
function closeSteps(
	run: LaneRun,
	free: Occupancy,
	bands: readonly ReadonlyMap<number, Station>[],
): boolean {
	// Lowest first, so a piece that joins the one below it is where the next one up can join.
	return piecesOf(run)
		.toReversed()
		.map((piece) => {
			const x = piece.lanes[0]!.x;
			if (meetsStraight(piece.before, x) || meetsStraight(piece.after, x)) return false;
			const crossed = inversions(piece, x, bands);
			const column = [piece.after, piece.before]
				.map((station) => meetingColumn(station, x))
				.find((one) => free.fits(piece, one) && inversions(piece, one, bands) <= crossed);
			if (column === undefined) return false;
			for (const lane of piece.lanes) lane.x = column;
			return true;
		})
		.some(Boolean);
}

/**
 * Move each run of lanes that stands closer than a lane to the card port it
 * leaves or enters onto that port's column, where the column is free on every
 * band the run passes: the line would jog less than a lane at the card, and
 * run too near a line through the port beside it.
 * @param scene The scene.
 * @param chains Every relationship's chain.
 * @param ports The port x each run's end lane wants, by that lane.
 * @returns Whether any run moved.
 */
function pullToPorts(
	scene: Scene,
	chains: readonly Chain[],
	ports: ReadonlyMap<Station, number>,
): boolean {
	const runs = laneRuns(chains);
	return runs.map((run) => pullRun(scene, runs, run, ports)).some(Boolean);
}

/**
 * Move one run of lanes onto the column of a card port less than a lane
 * from it, when that column is free on every band it passes.
 * @param scene The scene.
 * @param runs Every run of lanes.
 * @param run The run.
 * @param ports The port x each run's end lane wants, by that lane.
 * @returns Whether it moved.
 */
function pullRun(
	scene: Scene,
	runs: readonly LaneRun[],
	run: LaneRun,
	ports: ReadonlyMap<Station, number>,
): boolean {
	const x = portBeside(run, ports);
	if (x === undefined || !freeWithout(scene, runs, run).fits(run, x)) return false;
	for (const lane of run.lanes) lane.x = x;
	return true;
}

/**
 * The port a run of lanes stands closer than a lane to, if any.
 * @param run The run.
 * @param ports The port x each run's end lane wants, by that lane.
 * @returns The port's x.
 */
function portBeside(run: LaneRun, ports: ReadonlyMap<Station, number>): number | undefined {
	const x = ports.get(run.lanes[0]!) ?? ports.get(run.lanes.at(-1)!);
	const off = x === undefined ? 0 : Math.abs(x - run.lanes[0]!.x);
	return off >= 0.5 && off < LANE ? x : undefined;
}

/**
 * Once the labels have slid, try every run of lanes to or from a container
 * on its straight column again: a label that stood in its way before sliding
 * may have moved aside. Every other lane stays where it is.
 * @param scene The scene, its labels slid.
 * @param chains Every relationship's chain.
 * @returns Whether any run moved.
 */
function straightenIntoContainers(scene: Scene, chains: readonly Chain[]): boolean {
	const runs = laneRuns(chains);
	const straight = runs.filter(({ before, after }) => straightOn(scene, before, after).length > 0);
	const occupancy = new Occupancy(scene);
	for (const { lanes } of runs.filter((run) => !straight.includes(run)))
		for (const lane of lanes) occupancy.take(lane);
	return straight.map((run) => straighten(scene, run, occupancy)).some(Boolean);
}

/**
 * Move one run to or from a container onto its straight column, when that is free.
 * @param scene The scene.
 * @param run The run.
 * @param occupancy What each band holds; the run's lanes are added.
 * @returns Whether it moved.
 */
function straighten(scene: Scene, run: LaneRun, occupancy: Occupancy): boolean {
	const { lanes, before, after } = run;
	const x = straightOn(scene, before, after).find((column) => occupancy.fits(run, column));
	const moved = x !== undefined && lanes.some((lane) => lane.x !== x);
	if (moved) for (const lane of lanes) lane.x = x;
	for (const lane of lanes) occupancy.take(lane);
	return moved;
}

export { closeLaneSteps, pullToPorts, straightenIntoContainers, unstrandLanes };
