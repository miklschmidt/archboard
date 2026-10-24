// A relationship as a chain of stations (TASK-349): one per band it touches,
// from its upper end to its lower end — its two cards, its label box and the
// lanes it passes on the bands between.
import type { ElkExtendedEdge } from "@archboard/elk-rs";
import { polylineX, type Point } from "#shared/rules/geometry.ts";
import { clearOf } from "#shared/rules/track/routes/clear.ts";
import { Scene, TRACK_POLYLINE, centreX, type Item } from "#shared/rules/track/scene/scene.ts";

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
	/**
	 * Where the line must meet its card, in from the card's left edge: a
	 * line out of a decision leaves from its own point (`points.ts`). Absent
	 * where the line may meet the card anywhere along its face.
	 */
	at?: number;
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

/**
 * The stretch a frame's wall keeps a lane off: half a lane inside, where the
 * frame's inset stands between the wall and what it holds, and a region's
 * clearance outside, where nothing does ({@link besideRegion}).
 * @param wall The wall.
 * @param walls The frame's two walls.
 * @param items What the band's items keep a lane off.
 * @returns The stretch, open at both ends.
 */
function outsideFrame(
	wall: number,
	walls: readonly [number, number],
	items: readonly [number, number][],
): [number, number] {
	const [low, high] = besideRegion(wall, items);
	return wall === walls[0] ? [low, wall + WALL_CLEARANCE] : [wall - WALL_CLEARANCE, high];
}

/** Which horizontal intervals of each band are taken by items and settled lanes. */
class Occupancy {
	readonly taken: [number, number][][];
	/** What each band holds but the stretches its walls keep a lane off. */
	readonly held: [number, number][][];
	/** The stretch each wall keeps a lane off, on each band, by the wall. */
	readonly walls: Map<string, [number, number]>[];
	/** Whether an x is clear of what a run's bands hold for its lanes ({@link along}), by those bands, until a lane is taken. */
	private readonly alongs = new Map<string, (x: number) => boolean>();

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
		for (const item of items.filter((one) => !without.has(one))) {
			const { box, band } = item;
			const clearance = scene.regionBlocks.has(item) ? REGION_CLEARANCE : LANE;
			this.taken[band]!.push([box.x - clearance, box.x + box.width + clearance]);
		}
		// A title row or caption takes only the room its words are painted in:
		// a line into its container crosses the row beside them.
		for (const { band, left, end } of scene.headings())
			this.taken[band]!.push([left - LANE, end + LANE]);
		// A lane keeps off the walls of the containers it passes, as off a card,
		// and further off a group region's, which has no inset of its own, and
		// off a container's outside, where its inset stands on the other side.
		this.held = this.taken.map((spans) => [...spans]);
		this.walls = scene.bands.map((_, band) => {
			const held = this.held[band]!;
			return new Map(
				[...scene.walled(band)].flatMap(([id, walls]) =>
					walls.map((wall, side) => [
						`${id}|${side}`,
						scene.frames.has(id) ? outsideFrame(wall, walls, held) : besideRegion(wall, held),
					]),
				),
			);
		});
		this.walls.forEach((walls, band) => this.taken[band]!.push(...walls.values()));
	}

	/**
	 * What a band holds for a lane of a line that passes some bands: each wall
	 * kept off only as far as it is on the band beside the line where a card
	 * stands nearest it, so a line squeezed past a card beside a wall need not
	 * step aside on the bands above and below to keep further off it.
	 * @param bands Every band the line's lanes pass.
	 * @returns The stretches a lane keeps out of.
	 */
	along(bands: readonly number[]): readonly (readonly [number, number])[] {
		const walls = new Map<string, readonly [number, number]>();
		for (const band of bands)
			for (const [wall, stretch] of this.walls[band]!) {
				const held = walls.get(wall);
				walls.set(
					wall,
					held === undefined
						? stretch
						: [Math.max(held[0], stretch[0]), Math.min(held[1], stretch[1])],
				);
			}
		return [...bands.flatMap((band) => this.held[band]!), ...walls.values()];
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
		return this.fitting(run)(x);
	}

	/**
	 * {@link fits}, read once for a search that tries column after column and takes no lane meanwhile.
	 * @param run The run's lanes and the stations either side of them.
	 * @returns The test of a column.
	 */
	fitting(run: LaneRun): (x: number) => boolean {
		const bands = run.lanes.map(({ band }) => band);
		const key = bands.join(",");
		const clear = this.alongs.get(key) ?? clearOf(this.along(bands));
		this.alongs.set(key, clear);
		const frames = this.scene.keepsFrames(run);
		return (x) => clear(x) && frames(x);
	}

	/**
	 * Take a lane's column on its band.
	 * @param lane The lane.
	 */
	take(lane: Station): void {
		const span = [lane.x - LANE, lane.x + LANE] as [number, number];
		this.taken[lane.band]!.push(span);
		this.held[lane.band]!.push(span);
		this.alongs.clear();
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
	if (station.item === undefined) return station.x;
	const { x, width } = station.item.box;
	if (station.at !== undefined) return x + station.at;
	const margin = Math.min(FACE_MARGIN, width / 2);
	return Math.min(x + width - margin, Math.max(x + margin, toward));
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
 * free on every band the run passes, or only the piece of it the lane stands
 * in ({@link piecesOf}), which leaves the run's other pieces and their steps
 * where they are.
 * @param scene The scene.
 * @param chains Every relationship's chain.
 * @param lane The lane.
 * @param x The column.
 * @param piece Whether only the lane's piece moves.
 * @returns Whether it moved.
 */
function moveRun(
	scene: Scene,
	chains: readonly Chain[],
	lane: Station,
	x: number,
	piece = false,
): boolean {
	const run = runOf(chains, lane);
	if (run === undefined) return false;
	const moving = piece ? piecesOf(run).find(({ lanes }) => lanes.includes(lane))! : run;
	const occupancy = withoutRun(scene, chains, run);
	if (!occupancy.fits(moving, x)) return false;
	for (const each of moving.lanes) each.x = x;
	return true;
}

/**
 * Keep every other lane in place while one run searches.
 * @param scene The scene.
 * @param chains Every chain.
 * @param run The run left out.
 * @returns What the moving run must avoid.
 */
function withoutRun(scene: Scene, chains: readonly Chain[], run: LaneRun): Occupancy {
	const occupancy = new Occupancy(scene);
	const own = new Set(run.lanes);
	for (const { stations } of chains)
		for (const station of stations)
			if (station.kind === "lane" && !own.has(station)) occupancy.take(station);
	return occupancy;
}

/**
 * A run's lanes in pieces, each the lanes that stand on one column, with the
 * stations either side of it.
 * @param run The run.
 * @returns The pieces, top to bottom.
 */
function piecesOf(run: LaneRun): LaneRun[] {
	const pieces: LaneRun[] = [];
	let start = 0;
	run.lanes.forEach((lane, index) => {
		const next = run.lanes[index + 1];
		if (next !== undefined && next.x === lane.x) return;
		const before = run.lanes[start - 1] ?? run.before;
		pieces.push({ lanes: run.lanes.slice(start, index + 1), before, after: next ?? run.after });
		start = index + 1;
	});
	return pieces;
}

/**
 * The run of lanes a lane belongs to.
 * @param chains Every relationship's chain.
 * @param lane The lane.
 * @returns The run, with the stations either side of it.
 */
function runOf(chains: readonly Chain[], lane: Station): LaneRun | undefined {
	if (lane.kind !== "lane") return undefined;
	for (const { stations } of chains) {
		const index = stations.indexOf(lane);
		if (index < 0) continue;
		return runAt(stations, index);
	}
	return undefined;
}

/**
 * Find the lane run around one station.
 * @param stations Its chain.
 * @param index Its place in that chain.
 * @returns The run and its two ends.
 */
function runAt(stations: readonly Station[], index: number): LaneRun {
	let start = index;
	let end = index + 1;
	while (stations[start - 1]?.kind === "lane") start -= 1;
	while (stations[end]?.kind === "lane") end += 1;
	return { lanes: stations.slice(start, end), before: stations[start - 1]!, after: stations[end]! };
}

/**
 * The x a line can pass a station at straight: anywhere along a card's or
 * title row's face clear of its corners, anywhere across a label box, or a
 * lane's own x. A line held to one point of its card passes there alone.
 * @param station The station.
 * @returns The lowest and highest x.
 */
function reachOf(station: Station): [number, number] {
	if (station.item === undefined) return [station.x, station.x];
	const { x, width } = station.item.box;
	if (station.at !== undefined) return [x + station.at, x + station.at];
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
	if (passes(from)) return from;
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
	REGION_CLEARANCE,
	chainOf,
	freeWithout,
	labelStation,
	laneRuns,
	meeting,
	meetsAt,
	meets,
	moveRun,
	piecesOf,
	nearest,
	reachOf,
	runOf,
	straightOn,
	type Chain,
	type LaneRun,
	type Station,
};
