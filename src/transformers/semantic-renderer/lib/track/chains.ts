// A relationship as a chain of stations (TASK-349): one per band it touches,
// from its upper end to its lower end — its two cards, its label box and the
// lanes it passes on the bands between.
import type { ElkExtendedEdge } from "@archboard/elk-rs";
import type { Point } from "@/transformers/semantic-renderer/lib/geometry";
import { TRACK_POLYLINE } from "@/transformers/semantic-renderer/lib/track/placement";
import { Scene, centreX, type Item } from "@/transformers/semantic-renderer/lib/track/scene";

/** Distance between neighbouring lanes and tracks. */
const LANE = 16;
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
 * A run prefers the column of the station it leads into, then the one it leaves;
 * longer runs choose first, and a run with no free column keeps Graphviz's lanes.
 * @param scene The placed scene.
 * @param chains Every relationship's chain.
 */
function straightenLanes(scene: Scene, chains: readonly Chain[]): void {
	const occupancy = new Occupancy(scene);
	const runs = laneRuns(chains).toSorted((one, other) => other.lanes.length - one.lanes.length);
	for (const { lanes, before, after } of runs) {
		const xs = lanes.map(({ x }) => x).toSorted((one, other) => one - other);
		const median = xs[Math.floor(xs.length / 2)]!;
		const chosen =
			[after.x, before.x, median, ...xs].find((x) => occupancy.fits(lanes, x)) ??
			nearest(median, (x) => occupancy.fits(lanes, x));
		for (const lane of lanes) {
			lane.x = chosen ?? nearest(lane.x, (x) => occupancy.fits([lane], x)) ?? lane.x;
			occupancy.take(lane);
		}
	}
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

export { LANE, chainOf, straightenLanes, type Chain, type Station };
