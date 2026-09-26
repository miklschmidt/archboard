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
/** How far a lane keeps from a container wall it passes beside: half a lane. */
const WALL_CLEARANCE = LANE / 2;
/**
 * How far a lane keeps from a group region's wall where it has the room: a
 * lane and a half. A region's wall is a thin line with no inset, and a line
 * a lane off it, as off a card, reads as part of its outline.
 */
const REGION_CLEARANCE = 1.5 * LANE;

/** Where a chain touches a band. */
interface Station {
	readonly kind: "card" | "label" | "lane";
	readonly band: number;
	/** The card or label box; absent for a lane. */
	readonly item?: Item;
	/**
	 * The lane's x, or the label's centre; a lane moves when its run is
	 * straightened. A label's is read from its box and written to it, so a
	 * label that slides stands where every later step reads it.
	 */
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
	if (label?.band === band) return labelStation(label, band);
	const { top, bottom } = scene.bands[band]!;
	const share = (band - upper.band) / (lower.band - upper.band);
	const x =
		polylineX(polyline, (top + bottom) / 2) ??
		centreX(upper) + (centreX(lower) - centreX(upper)) * share;
	return { kind: "lane", band, x };
}

/**
 * A label's station, its x the centre of its box.
 * @param item The label box.
 * @param band Its band.
 * @returns The station.
 */
function labelStation(item: Item, band: number): Station {
	return {
		kind: "label",
		band,
		item,
		/**
		 * The centre of the box.
		 * @returns The x.
		 */
		get x(): number {
			return centreX(item);
		},
		/**
		 * Stand the box centred on an x.
		 * @param x The x.
		 */
		set x(x: number) {
			item.box = { ...item.box, x: x - item.box.width / 2 };
		},
	};
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

/**
 * The stretch a group region's wall keeps a lane off: a lane and a half
 * either side, or, where a card stands nearer, only up to the lane that card
 * keeps, so the gap between them still holds a line at half a lane from the wall.
 * @param wall The wall.
 * @param items What the band's items keep a lane off.
 * @returns The stretch, open at both ends.
 */
function besideRegion(wall: number, items: readonly [number, number][]): [number, number] {
	let [low, high] = [wall - REGION_CLEARANCE, wall + REGION_CLEARANCE];
	for (const [start, end] of items) {
		if (end > low && end <= wall - WALL_CLEARANCE) low = end;
		if (start < high && start >= wall + WALL_CLEARANCE) high = start;
	}
	return [low, high];
}

/** Which horizontal intervals of each band are taken by items and settled lanes. */
class Occupancy {
	readonly taken: [number, number][][];

	/**
	 * Start with every item's box, widened by a lane either side.
	 * @param scene The placed scene.
	 * @param without Items whose boxes are not taken, as the label boxes of a line being placed.
	 */
	constructor(
		readonly scene: Scene,
		without: ReadonlySet<Item> = new Set(),
	) {
		this.taken = scene.bands.map(() => []);
		const items = [...scene.cards.values(), ...scene.labels.values()];
		for (const { box, band } of items.filter((item) => !without.has(item)))
			this.taken[band]!.push([box.x - LANE, box.x + box.width + LANE]);
		// A title row or caption takes only the room its words are painted in:
		// a line into its container crosses the row beside them.
		for (const { band, left, end } of scene.headings())
			this.taken[band]!.push([left - LANE, end + LANE]);
		// A lane keeps off the walls of the containers it passes, as off a card,
		// and further off a group region's, which has no inset of its own.
		scene.bands.forEach((_, band) => {
			const held = [...this.taken[band]!];
			for (const [id, walls] of scene.walled(band))
				for (const wall of walls)
					this.taken[band]!.push(
						scene.frames.has(id)
							? [wall - WALL_CLEARANCE, wall + WALL_CLEARANCE]
							: besideRegion(wall, held),
					);
		});
	}

	/**
	 * Every edge of what some lanes' bands hold: a free window beside a wall
	 * can be narrower than the steps a search takes.
	 * @param lanes The lanes.
	 * @returns The edges' x.
	 */
	edges(lanes: readonly Station[]): number[] {
		return lanes.flatMap((lane) => this.taken[lane.band]!.flat());
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
	 * @param run The run's lanes and the stations either side of them.
	 * @param x The column.
	 * @returns True when the column is free on every band and keeps the frames {@link Scene.keepsFrames} asks.
	 */
	fits(run: LaneRun, x: number): boolean {
		return run.lanes.every((lane) => this.free(lane.band, x)) && this.scene.keepsFrames(run, x);
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
 * Where a line meets a station: a lane's or label's x, or the point of a
 * card's face nearest the other end, where its port will stand.
 * @param station The station.
 * @param toward The x of the line's other end in that channel.
 * @param at Where a lane or label stands instead of its own x, when it is the one being placed.
 * @returns The x.
 */
function meetsAt(station: Station, toward: number, at = station.x): number {
	if (station.kind !== "card") return at;
	const [low, high] = reachOf(station);
	return Math.min(high, Math.max(low, toward));
}

/**
 * Whether two chains meet at one station: the same one, or the same card.
 * @param one A station.
 * @param other Another on the same band.
 * @returns True when they are one place.
 */
function meets(one: Station, other: Station): boolean {
	return one === other || (one.item !== undefined && one.item === other.item);
}

/** What the chains a line crosses in one channel count, between its stations above and below it. */
type Counted = (
	crossed: readonly ReadonlyMap<number, Station>[],
	upper: Station,
	lower: Station,
) => number;

/**
 * How many other chains a line would cross between each band and the next,
 * its lanes and label standing at some x: those whose order against it
 * swaps across a channel, where no track order undoes it.
 * @param own The chain's stations, or a run of them with the stations either side.
 * @param xs Where each of them stands; a card's is ignored.
 * @param bands Every chain's stations, by band.
 * @param counted What the chains crossed in one channel count: one each, unless told.
 * @returns The count.
 */
function crossingsOf(
	own: readonly Station[],
	xs: readonly number[],
	bands: readonly ReadonlyMap<number, Station>[],
	counted?: Counted,
): number {
	return own.slice(1).reduce((count, lower, index) => {
		const upper = own[index]!;
		const [above, below] = [xs[index]!, xs[index + 1]!];
		const [top, bottom] = [meetsAt(upper, below, above), meetsAt(lower, above, below)];
		const crossed = bands.filter((other) => {
			const [one, two] = [other.get(upper.band), other.get(lower.band)];
			if (one === undefined || two === undefined || meets(one, upper) || meets(two, lower))
				return false;
			return (top - meetsAt(one, two.x)) * (bottom - meetsAt(two, one.x)) < 0;
		});
		return count + (counted?.(crossed, upper, lower) ?? crossed.length);
	}, 0);
}

/**
 * How many other chains a run on one column would cross between one band
 * and the next.
 * @param run The run.
 * @param x The column.
 * @param bands Every chain's stations, by band.
 * @returns The count.
 */
function inversions(
	run: LaneRun,
	x: number,
	bands: readonly ReadonlyMap<number, Station>[],
): number {
	const own = [run.before, ...run.lanes, run.after];
	return crossingsOf(own, [run.before.x, ...run.lanes.map(() => x), run.after.x], bands);
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
	if (run === undefined || !freeWithout(scene, runs, run).fits(run, x)) return false;
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
 * The nearest x to one that passes a test, searched outward a quarter lane at
 * a time and at some exact edges within the same reach; on a tie the step
 * comes first.
 * @param from Where to start.
 * @param passes The test.
 * @param edges Exact x worth trying too.
 * @returns The nearest passing x within reach, or nothing.
 */
function nearest(
	from: number,
	passes: (x: number) => boolean,
	edges: readonly number[] = [],
): number | undefined {
	const steps = Array.from({ length: SEARCH_STEPS + 1 }, (_, step) => [
		from - (step * LANE) / 4,
		from + (step * LANE) / 4,
	]).flat();
	const reach = (SEARCH_STEPS * LANE) / 4;
	const exact = edges.filter((x) => Math.abs(x - from) <= reach);
	const ordered = [...steps, ...exact]
		.map((x, order) => ({ x, order }))
		.toSorted(
			(one, other) => Math.abs(one.x - from) - Math.abs(other.x - from) || one.order - other.order,
		);
	return ordered.find(({ x }) => passes(x))?.x;
}

export {
	FACE_MARGIN,
	LANE,
	Occupancy,
	chainOf,
	crossingsOf,
	freeWithout,
	inversions,
	labelStation,
	laneRuns,
	meeting,
	meetsAt,
	meets,
	moveRun,
	nearest,
	reachOf,
	runOf,
	straightOn,
	type Chain,
	type Counted,
	type LaneRun,
	type Station,
};
