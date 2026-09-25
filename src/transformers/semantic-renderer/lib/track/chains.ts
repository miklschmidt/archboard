// A relationship as a chain of stations (TASK-349): one per band it touches,
// from its upper end to its lower end — its two cards, its label box and the
// lanes it passes on the bands between.
import type { ElkExtendedEdge } from "@archboard/elk-rs";
import type { Point } from "@/transformers/semantic-renderer/lib/geometry";
import {
	Scene,
	TRACK_POLYLINE,
	centreX,
	type Item,
} from "@/transformers/semantic-renderer/lib/track/scene";

/** Distance between neighbouring lanes and tracks. */
const LANE = 16;
/** How far a line keeps from a card's corner, as ports do. */
const FACE_MARGIN = 20;
/** How many quarter lanes either way a lane looks for a free column. */
const SEARCH_STEPS = 64;

/** Where a chain touches a band. */
interface Station {
	readonly kind: "card" | "label" | "lane";
	readonly band: number;
	/** The card or label box; absent for a lane. */
	readonly item?: Item;
	/** The lane's x, or the label's centre; a lane moves when its run is straightened. */
	x: number;
}

/** A relationship's stations, and whether it runs upward from source to target. */
interface Chain {
	readonly stations: Station[];
	readonly upward: boolean;
}

/** One run of lanes in a chain, with the stations either side of it. */
interface LaneRun {
	readonly lanes: Station[];
	readonly before: Station;
	readonly after: Station;
}

/**
 * The x of a polyline where it crosses a height.
 * @param points The polyline, in order.
 * @param y The height.
 * @returns The x there, or nothing when the polyline never reaches it.
 */
function polylineX(points: readonly Point[], y: number): number | undefined {
	for (let index = 1; index < points.length; index += 1) {
		const one = points[index - 1]!;
		const other = points[index]!;
		const low = Math.min(one.y, other.y);
		const high = Math.max(one.y, other.y);
		if (y < low || y > high) continue;
		if (high - low < 1e-6) return (one.x + other.x) / 2;
		return one.x + ((other.x - one.x) * (y - one.y)) / (other.y - one.y);
	}
	return undefined;
}

/**
 * The polyline placement wrote on a relationship.
 * @param edge The placed relationship.
 * @returns Its points.
 */
function polylineOf(edge: ElkExtendedEdge): Point[] {
	return (edge.layoutOptions?.[TRACK_POLYLINE] ?? "")
		.split(" ")
		.filter((token) => token.length > 0)
		.map((token) => {
			const [x, y] = token.split(",").map(Number);
			return { x: x!, y: y! };
		});
}

/**
 * The station a chain has on one band between its ends: its label box, or a lane.
 * @param scene The placed scene.
 * @param band The band.
 * @param through Where the chain passes: its label, its polyline and its two ends.
 * @param through.label Its label box, if it has one.
 * @param through.polyline Its polyline.
 * @param through.upper Its upper end.
 * @param through.lower Its lower end.
 * @returns The station.
 */
function stationOn(
	scene: Scene,
	band: number,
	through: { label?: Item | undefined; polyline: readonly Point[]; upper: Item; lower: Item },
): Station {
	const { label, polyline, upper, lower } = through;
	if (label?.band === band) return { kind: "label", band, item: label, x: centreX(label) };
	const { top, bottom } = scene.bands[band]!;
	const share = (band - upper.band) / (lower.band - upper.band);
	const x =
		polylineX(polyline, (top + bottom) / 2) ??
		centreX(upper) + (centreX(lower) - centreX(upper)) * share;
	return { kind: "lane", band, x };
}

/**
 * The stations of one relationship, from its upper end to its lower end.
 * @param scene The placed scene.
 * @param edge The placed relationship.
 * @returns Its chain.
 */
function chainOf(scene: Scene, edge: ElkExtendedEdge): Chain {
	const source = scene.endpoint(edge.sources[0]!);
	const target = scene.endpoint(edge.targets[0]!);
	const upward = target.band < source.band;
	const [upper, lower] = upward ? [target, source] : [source, target];
	const through = { label: scene.labels.get(edge.id), polyline: polylineOf(edge), upper, lower };
	const stations: Station[] = [{ kind: "card", band: upper.band, item: upper, x: centreX(upper) }];
	for (let band = upper.band + 1; band < lower.band; band += 1)
		stations.push(stationOn(scene, band, through));
	stations.push({ kind: "card", band: lower.band, item: lower, x: centreX(lower) });
	return { stations, upward };
}

/**
 * Every run of consecutive lanes in the chains.
 * @param chains Every relationship's chain.
 * @returns The runs, each with the stations either side of it.
 */
function laneRuns(chains: readonly Chain[]): LaneRun[] {
	return chains.flatMap(({ stations }) => {
		const runs: LaneRun[] = [];
		let start = -1;
		stations.forEach((station, index) => {
			if (station.kind === "lane" && start < 0) start = index;
			if (station.kind !== "lane" && start >= 0) {
				runs.push({
					lanes: stations.slice(start, index),
					before: stations[start - 1]!,
					after: station,
				});
				start = -1;
			}
		});
		return runs;
	});
}

/** Which horizontal intervals of each band are taken by items and settled lanes. */
class Occupancy {
	readonly taken: [number, number][][];

	/**
	 * Start with every item's box, widened by a lane either side.
	 * @param scene The placed scene.
	 */
	constructor(readonly scene: Scene) {
		this.taken = scene.bands.map(() => []);
		const items = [...scene.cards.values(), ...scene.labels.values(), ...scene.titles.values()];
		for (const { box, band } of items)
			this.taken[band]!.push([box.x - LANE, box.x + box.width + LANE]);
	}

	/**
	 * Whether a lane may stand at an x on a band.
	 * @param band The band.
	 * @param x The x.
	 * @returns True when nothing takes it.
	 */
	free(band: number, x: number): boolean {
		return this.taken[band]!.every(([low, high]) => x <= low || x >= high);
	}

	/**
	 * Whether a whole run may move to one column.
	 * @param lanes The run's lanes.
	 * @param x The column.
	 * @returns True when the column is free on every band and keeps each lane in its frames.
	 */
	fits(lanes: readonly Station[], x: number): boolean {
		return lanes.every(
			(lane) =>
				this.free(lane.band, x) &&
				this.scene.framesAt(lane.band, x) === this.scene.framesAt(lane.band, lane.x),
		);
	}

	/**
	 * Take a lane's column on its band.
	 * @param lane The lane.
	 */
	take(lane: Station): void {
		this.taken[lane.band]!.push([lane.x - LANE, lane.x + LANE]);
	}
}

/**
 * Straighten every run of lanes onto one column where that column is free on
 * every band the run passes and keeps it inside the same frames: a long
 * relationship then descends in one line instead of jogging at every channel.
 * A run prefers the column of the station it leads into, then the one it
 * leaves, except that a run to or from a container prefers a column both its
 * neighbours reach straight; longer runs choose first, and a run with no free
 * column keeps Graphviz's lanes.
 * @param scene The placed scene.
 * @param chains Every relationship's chain.
 */
function straightenLanes(scene: Scene, chains: readonly Chain[]): void {
	const occupancy = new Occupancy(scene);
	const runs = laneRuns(chains).toSorted((one, other) => other.lanes.length - one.lanes.length);
	for (const run of runs) {
		const chosen = columnOf(scene, run, occupancy);
		for (const lane of run.lanes) {
			lane.x = chosen ?? nearest(lane.x, (x) => occupancy.fits([lane], x)) ?? lane.x;
			occupancy.take(lane);
		}
	}
}

/**
 * The column a run of lanes takes: straight on for a run to or from a
 * container, as near that as it is free; else the column of the station it
 * leads into, the one it leaves, or its own lanes', the first that is free.
 * @param scene The placed scene.
 * @param run The run.
 * @param occupancy What each band holds so far.
 * @returns The column, or nothing when no column is free on every band.
 */
function columnOf(scene: Scene, run: LaneRun, occupancy: Occupancy): number | undefined {
	const { lanes, before, after } = run;
	const straight = straightOn(scene, before, after);
	const xs = lanes.map(({ x }) => x).toSorted((one, other) => one - other);
	const median = xs[Math.floor(xs.length / 2)]!;
	const [columns, near] =
		straight.length > 0 ? [straight, straight[0]!] : [[after.x, before.x, median, ...xs], median];
	return (
		columns.find((x) => occupancy.fits(lanes, x)) ?? nearest(near, (x) => occupancy.fits(lanes, x))
	);
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
	if (x === undefined || !freeWithout(scene, runs, run).fits(run.lanes, x)) return false;
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
 * What each band holds with every run but one in place.
 * @param scene The scene.
 * @param runs Every run of lanes.
 * @param left The run left out.
 * @returns The occupancy.
 */
function freeWithout(scene: Scene, runs: readonly LaneRun[], left: LaneRun): Occupancy {
	const occupancy = new Occupancy(scene);
	for (const run of runs) if (run !== left) for (const lane of run.lanes) occupancy.take(lane);
	return occupancy;
}

/**
 * Move the run of lanes a lane belongs to onto a column, when that column is
 * free on every band the run passes.
 * @param scene The scene.
 * @param chains Every relationship's chain.
 * @param lane The lane.
 * @param x The column.
 * @returns Whether the run moved.
 */
function moveRun(scene: Scene, chains: readonly Chain[], lane: Station, x: number): boolean {
	const runs = laneRuns(chains);
	const run = runs.find(({ lanes }) => lanes.includes(lane));
	if (run === undefined || !freeWithout(scene, runs, run).fits(run.lanes, x)) return false;
	for (const each of run.lanes) each.x = x;
	return true;
}

/**
 * The run of lanes a lane belongs to.
 * @param chains Every relationship's chain.
 * @param lane The lane.
 * @returns The run, with the stations either side of it.
 */
function runOf(chains: readonly Chain[], lane: Station): LaneRun | undefined {
	return laneRuns(chains).find(({ lanes }) => lanes.includes(lane));
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
	const x = straightOn(scene, before, after).find((column) => occupancy.fits(lanes, column));
	const moved = x !== undefined && lanes.some((lane) => lane.x !== x);
	if (moved) for (const lane of lanes) lane.x = x;
	for (const lane of lanes) occupancy.take(lane);
	return moved;
}

/**
 * The x a line can pass a station at straight: anywhere along a card's or
 * title row's face clear of its corners, anywhere across a label box, or a
 * lane's own x.
 * @param station The station.
 * @returns The lowest and highest x.
 */
function reachOf(station: Station): [number, number] {
	if (station.item === undefined) return [station.x, station.x];
	const { x, width } = station.item.box;
	const margin = Math.min(station.kind === "label" ? LANE : FACE_MARGIN, width / 2);
	return [x + margin, x + width - margin];
}

/**
 * Where a run of lanes lets its line pass straight from the station above it
 * into the one below: the point both can reach nearest the lanes, if any.
 * @param before The station above the run.
 * @param after The station below it.
 * @param near The lanes' own middle.
 * @returns That x, or nothing when the two reach no common point.
 */
function meeting(before: Station, after: Station, near: number): number[] {
	const [a, b] = reachOf(before);
	const [c, d] = reachOf(after);
	const low = Math.max(a, c);
	const high = Math.min(b, d);
	return low <= high ? [Math.min(high, Math.max(low, near))] : [];
}

/**
 * Where a run of lanes to or from a container runs straight on: from the
 * station at its other end, as near as both reach. It never aims at the
 * container's centre, which says nothing of where its port will stand: a run
 * toward one would swing out to its middle and come back. When that column is
 * taken the run keeps as near to it as it can.
 * @param scene The placed scene.
 * @param before The station above the run.
 * @param after The station below it.
 * @returns The columns to try, best first; none for a run between two cards.
 */
function straightOn(scene: Scene, before: Station, after: Station): number[] {
	const titles = new Set(scene.titles.values());
	if (after.item !== undefined && titles.has(after.item))
		return [...meeting(before, after, before.x), before.x];
	if (before.item !== undefined && titles.has(before.item))
		return [...meeting(before, after, after.x), after.x];
	return [];
}

/**
 * The nearest x to one that passes a test, searched outward a quarter lane at a time.
 * @param from Where to start.
 * @param passes The test.
 * @returns The nearest passing x within reach, or nothing.
 */
function nearest(from: number, passes: (x: number) => boolean): number | undefined {
	for (let step = 0; step <= SEARCH_STEPS; step += 1) {
		for (const x of [from - (step * LANE) / 4, from + (step * LANE) / 4]) if (passes(x)) return x;
	}
	return undefined;
}

export {
	LANE,
	chainOf,
	moveRun,
	pullToPorts,
	reachOf,
	runOf,
	straightenIntoContainers,
	straightenLanes,
	type Chain,
	type LaneRun,
	type Station,
};
