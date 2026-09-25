// Lanes a label stranded (visual polish). Lanes are straightened before the
// labels slide, so a run of lanes whose column a label box stood on keeps a
// column neither of its ends reaches, and turns twice more to reach them.
// Once the labels have slid, each such run moves onto the column of one of
// its ends where that is free and crosses no more lines.
import {
	freeWithout,
	inversions,
	laneRuns,
	reachOf,
	type Chain,
	type Station,
} from "@/transformers/semantic-renderer/lib/track/chains";
import { centreX, type Scene } from "@/transformers/semantic-renderer/lib/track/scene";

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
 * stood turns twice to reach its ends.
 * @param scene The scene, its labels slid.
 * @param chains Every relationship's chain.
 * @returns Whether any run moved.
 */
function unstrandLanes(scene: Scene, chains: readonly Chain[]): boolean {
	const runs = laneRuns(chains);
	const bands = chains.map(
		({ stations }) => new Map(stations.map((station) => [station.band, station])),
	);
	return runs
		.map((run) => {
			const x = run.lanes[0]!.x;
			const straight = run.lanes.every((lane) => lane.x === x);
			if (straight && (meetsStraight(run.before, x) || meetsStraight(run.after, x))) return false;
			const free = freeWithout(scene, runs, run);
			const crossed = inversions(run, x, bands);
			const column = [run.after, run.before]
				.map((station) => meetingColumn(station, x))
				.find((one) => free.fits(run.lanes, one) && inversions(run, one, bands) <= crossed);
			if (column === undefined) return false;
			for (const lane of run.lanes) lane.x = column;
			return true;
		})
		.some(Boolean);
}

export { unstrandLanes };
