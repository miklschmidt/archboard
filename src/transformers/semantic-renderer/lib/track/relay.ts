// Lines laid round the outside of a drawing, laid again through it (visual polish).
//
// Graphviz orders each rank to cross the fewest lines and counts no length,
// so a long line, and the label box on it, can drift to the outermost slot
// of every rank it passes; its lanes then keep that side, and the line laps
// the drawing. Once the lanes are straightened, each chain whose middle
// strays well outside both its ends' reach looks for the cheapest free route
// over the same bands: its lanes on any free column, its label box anywhere
// free along its own band, each within the scene and inside the frames it
// stood in, or those its own ends stand in. A route costs its sideways travel
// and a crossing's worth for each line it crosses, or each trunk; the chain
// takes the new route only when that saves more than a few lanes. A crossing
// is worth as much as the detour that makes a lap, so a lap is undone only
// where each crossing that adds buys back at least that much.
import {
	CONTAINER_INSET,
	LABEL_CARD_CLEARANCE,
	LABEL_LABEL_CLEARANCE,
} from "@/transformers/semantic-renderer/config";
import {
	LANE,
	Occupancy,
	crossingsOf,
	meets,
	meetsAt,
	reachOf,
	type Chain,
	type Counted,
	type Station,
} from "@/transformers/semantic-renderer/lib/track/chains";
import { extentOf } from "@/transformers/semantic-renderer/lib/track/labels";
import {
	byBand,
	onBand,
	readingsOf,
	take,
	type Relaid,
} from "@/transformers/semantic-renderer/lib/track/readings";
import {
	JOG,
	MIN_STEP,
	backtrack,
	descend,
} from "@/transformers/semantic-renderer/lib/track/sweep";
import type { Item, Scene } from "@/transformers/semantic-renderer/lib/track/scene";

/** How far outside its ends' reach a station stands before its chain laps. */
const STRAY = 2 * LANE;
/**
 * What crossing another line costs, as sideways travel: the detour that
 * makes a lap. Cheaper, and relays pay for short laps with many crossings;
 * dearer, and they leave laps one crossing would undo.
 */
const CROSSING = 25 * LANE;
/** How much cheaper a new route must be than the old one before the chain takes it. */
const SAVING = 8 * LANE;
/** The spacing of the columns a route may take, besides the edges of what stands on its bands. */
const STEP = LANE / 2;
/** How far inside an interval's edge still counts as outside it. */
const EDGE = 1e-9;

/** An interval of x. */
type Span = readonly [number, number];

/** What the other lines do in one channel, read onto the columns. */
interface Traffic {
	/**
	 * Each column's x plus a crossing's worth for every other line's upright
	 * left of it, each of a line's two ends counting half: the cost of
	 * running across from one column to another is the difference.
	 */
	readonly warped: Float64Array;
	/** How many other lines run across the channel over each column. */
	readonly across: Float64Array;
}

/**
 * How far an x stands outside a span.
 * @param x The x.
 * @param span The span.
 * @returns The distance; zero inside.
 */
function outside(x: number, span: Span): number {
	return Math.max(0, span[0] - x, x - span[1]);
}

/**
 * The first index of an ascending list whose value is above a bound.
 * @param sorted The list.
 * @param bound The bound.
 * @returns The index; the list's length when none is.
 */
function firstAbove(sorted: ArrayLike<number>, bound: number): number {
	let low = 0;
	let high = sorted.length;
	while (low < high) {
		const middle = (low + high) >> 1;
		if (sorted[middle]! <= bound) low = middle + 1;
		else high = middle;
	}
	return low;
}

/**
 * Whether a chain laps: a station between its ends stands more than a
 * couple of lanes outside where either end reaches.
 * @param chain The chain.
 * @returns True when it strays.
 */
function strays(chain: Chain): boolean {
	const { stations } = chain;
	const [upper, lower] = [reachOf(stations[0]!), reachOf(stations.at(-1)!)];
	const span: Span = [Math.min(upper[0], lower[0]), Math.max(upper[1], lower[1])];
	return stations.slice(1, -1).some(({ x }) => outside(x, span) > STRAY);
}

/**
 * The frames a chain's two ends stand inside.
 * @param scene The scene.
 * @param chain The chain.
 * @returns Their ids.
 */
function endFrames(scene: Scene, chain: Chain): Set<string> {
	const ends = [chain.stations[0]!, chain.stations.at(-1)!];
	return new Set(
		ends.flatMap((end) =>
			scene
				.frameWalls(end.band)
				.filter(([, [low, high]]) => end.x > low && end.x < high)
				.map(([id]) => id),
		),
	);
}

/**
 * Where a station may not stand for the frames it stood in: outside each
 * frame it stood inside, and inside each it stood outside, unless one of
 * its line's own ends stands in that frame: Graphviz runs a line past a
 * frame's title row outside it even when the line ends inside. A group
 * region is no frame: a line may cross into one.
 * @param scene The scene.
 * @param station The station.
 * @param open The frames its line's ends stand in.
 * @returns The intervals it keeps out of.
 */
function framesOff(scene: Scene, station: Station, open: ReadonlySet<string>): Span[] {
	return scene.frameWalls(station.band).flatMap(([id, [low, high]]): Span[] => {
		if (station.x > low && station.x < high)
			return [
				[-Infinity, low + EDGE],
				[high - EDGE, Infinity],
			];
		return open.has(id) ? [] : [[low, high]];
	});
}

/**
 * Mark the columns strictly inside an interval as taken.
 * @param free One flag per column; those inside are cleared.
 * @param xs The columns, ascending.
 * @param span The interval.
 */
function block(free: Uint8Array, xs: readonly number[], span: Span): void {
	for (let j = firstAbove(xs, span[0]); j < xs.length && xs[j]! < span[1]; j += 1) free[j] = 0;
}

/**
 * Each column's warped x in a channel: its x plus a crossing's worth for
 * every other line's end left of it, each end counting half.
 * @param xs The columns, ascending.
 * @param ends The other lines' ends in the channel, ascending.
 * @returns The warped x, ascending.
 */
function warp(xs: readonly number[], ends: readonly number[]): Float64Array {
	const warped = new Float64Array(xs.length);
	let passed = 0;
	for (let j = 0; j < xs.length; j += 1) {
		while (passed < ends.length && ends[passed]! < xs[j]!) passed += 1;
		warped[j] = xs[j]! + (CROSSING * passed) / 2;
	}
	return warped;
}

/**
 * How many runs cover each column, strictly inside.
 * @param xs The columns, ascending.
 * @param runs The runs.
 * @returns One count per column.
 */
function spanned(xs: readonly number[], runs: readonly Span[]): Float64Array {
	const counts = new Float64Array(xs.length + 1);
	for (const [low, high] of runs) {
		const from = firstAbove(xs, low + 0.5);
		counts[from]! += 1;
		counts[Math.max(from, firstAbove(xs, high - 0.5 - EDGE))]! -= 1;
	}
	for (let j = 1; j < xs.length; j += 1) counts[j]! += counts[j - 1]!;
	return counts.subarray(0, xs.length);
}

/**
 * What reaching each column from a card costs: nothing across its face,
 * else the warped travel from the face's nearest edge and a jog, which a
 * column too near the face to turn to cannot take.
 * @param xs The columns, ascending; the face's edges among them.
 * @param warped Each column's warped x in the channel beside the card.
 * @param reach The face.
 * @returns One cost per column.
 */
function fromReach(xs: readonly number[], warped: Float64Array, reach: Span): Float64Array {
	const left = firstAbove(xs, reach[0] - EDGE);
	const right = firstAbove(xs, reach[1] - EDGE);
	return warped.map((value, j) => {
		if (j >= left && j <= right) return 0;
		const edge = j < left ? left : right;
		const step = Math.abs(xs[edge]! - xs[j]!);
		return step < MIN_STEP ? Infinity : Math.abs(warped[edge]! - value) + JOG;
	});
}

/** The route search over one scene's columns. */
class Relay {
	readonly columns: number[];
	/** How far the scene's items reach, left and right: a route runs no further out. */
	readonly extent: Span;
	/** Every chain's stations, by band. */
	readonly bands: ReadonlyMap<number, Station>[];
	readonly chains: readonly Chain[];
	/** What each chain, by its stations, must share with another to share a trunk. */
	readonly kinds: ReadonlyMap<ReadonlyMap<number, Station>, string>;

	/**
	 * Lay the columns out across the scene.
	 * @param scene The scene.
	 * @param kinds Every relationship's chain, and what it must share with another to share a trunk.
	 */
	constructor(
		readonly scene: Scene,
		kinds: ReadonlyMap<Chain, string>,
	) {
		this.chains = [...kinds.keys()];
		this.extent = extentOf(scene);
		const [left, right] = this.extent;
		this.columns = Array.from(
			{ length: Math.floor((right - left) / STEP) + 1 },
			(_, index) => left + index * STEP,
		);
		this.bands = this.chains.map(
			({ stations }) => new Map(stations.map((station) => [station.band, station])),
		);
		this.kinds = new Map(this.bands.map((one, index) => [one, kinds.get(this.chains[index]!)!]));
	}

	/**
	 * How many trunks the chains a line crosses in one channel make: those of
	 * one kind that leave the card above the channel, or else enter the card
	 * below it, are one trunk, drawn as one where it is crossed; any other
	 * chain is its own.
	 * @param crossed The chains, by band.
	 * @param upper The line's station above the channel.
	 * @param lower Its station below it.
	 * @returns The count.
	 */
	trunksAmong(
		crossed: readonly ReadonlyMap<number, Station>[],
		upper: Station,
		lower: Station,
	): number {
		const kinds = new Map<unknown, Set<string>>();
		for (const other of crossed) {
			const [one, two] = [other.get(upper.band)!, other.get(lower.band)!];
			const card = one.kind === "card" ? one.item : two.kind === "card" ? two.item : other;
			kinds.set(card, (kinds.get(card) ?? new Set()).add(this.kinds.get(other)!));
		}
		return [...kinds.values()].reduce((sum, one) => sum + one.size, 0);
	}

	/**
	 * Relay one chain onto its cheapest free route, its label box on its own
	 * band or another its line passes, when that saves enough.
	 * @param chain The chain.
	 */
	relay(chain: Chain): void {
		const index = this.chains.indexOf(chain);
		const old = chain.stations.map(({ x }) => x);
		const standing = this.counts().map((counted) => this.cost(chain.stations, old, counted));
		const occupancy = this.occupancyWithout(chain);
		const relaid = readingsOf(this.scene, chain).flatMap((stations) => {
			this.bands[index] = byBand(stations);
			return this.relaid(chain, stations, occupancy, standing);
		});
		const best = relaid.reduce<Relaid | undefined>(
			(one, other) => (one === undefined || other.cost < one.cost ? other : one),
			undefined,
		);
		this.bands[index] = byBand(best?.stations ?? chain.stations);
		if (best !== undefined) take(chain, best, this.scene);
	}

	/**
	 * The two ways a route's crossings are counted: line by line, and trunk by
	 * trunk. They differ only where a route crosses a trunk, whose lines are
	 * drawn as one there: counted line by line, a route over a trunk is dearer
	 * than it looks; counted by trunks, a lap over one is cheaper, and one lap
	 * kept moves the lines relayed after it. A route is taken when it saves
	 * enough by either.
	 * @returns The counts; nothing counts each line once.
	 */
	counts(): (Counted | undefined)[] {
		return [undefined, this.trunksAmong.bind(this)];
	}

	/**
	 * The cheapest free route for one reading of a chain's stations, when it
	 * saves enough over where the chain stands.
	 * @param chain The chain.
	 * @param stations The reading: its stations, its label box on one band.
	 * @param occupancy What the chain's bands hold besides it.
	 * @param standing What the chain costs where it stands, by each count.
	 * @returns The route, or nothing.
	 */
	relaid(
		chain: Chain,
		stations: readonly Station[],
		occupancy: Occupancy,
		standing: readonly number[],
	): Relaid[] {
		const xs = this.columnsFor(stations, occupancy);
		const masks = stations
			.slice(1, -1)
			.map((station) => this.freeAt(chain, station, xs, occupancy));
		const chosen = this.cheapest(stations, xs, masks);
		if (chosen === undefined) return [];
		const route = [stations[0]!.x, ...chosen, stations.at(-1)!.x];
		const costs = this.counts().map((counted) => this.cost(stations, route, counted));
		const saves = costs.some((cost, at) => cost <= standing[at]! - SAVING);
		return saves ? [{ stations, route, cost: costs[0]! }] : [];
	}

	/**
	 * What each band holds besides one chain: every item but its label box,
	 * and every other chain's lanes.
	 * @param chain The chain.
	 * @returns The occupancy.
	 */
	occupancyWithout(chain: Chain): Occupancy {
		const own = chain.stations.flatMap(({ kind, item }) => (kind === "label" ? [item!] : []));
		const occupancy = new Occupancy(this.scene, new Set(own));
		for (const other of this.chains)
			if (other !== chain)
				for (const station of other.stations) if (station.kind === "lane") occupancy.take(station);
		return occupancy;
	}

	/**
	 * The columns a chain's route may take: the scene's, the edges of what its
	 * bands hold, where its stations stand and the edges of its ends' reach.
	 * @param stations The chain's stations.
	 * @param occupancy What its bands hold besides it.
	 * @returns The x, ascending.
	 */
	columnsFor(stations: readonly Station[], occupancy: Occupancy): number[] {
		return [
			...new Set([
				...this.columns,
				...occupancy.edges(stations.slice(1, -1)),
				...stations.map(({ x }) => x),
				...reachOf(stations[0]!),
				...reachOf(stations.at(-1)!),
			]),
		].toSorted((one, other) => one - other);
	}

	/**
	 * Which columns a station may stand on.
	 * @param chain The station's chain.
	 * @param station The station.
	 * @param xs The columns.
	 * @param occupancy What its band holds besides its chain.
	 * @returns One flag per column.
	 */
	freeAt(chain: Chain, station: Station, xs: readonly number[], occupancy: Occupancy): Uint8Array {
		const free = new Uint8Array(xs.length).fill(1);
		for (const span of this.keptOff(chain, station, occupancy)) block(free, xs, span);
		return free;
	}

	/**
	 * Where a station may not stand: outside the scene's extent or the frames
	 * it stood in (a frame its line ends in aside), and for a lane on what its band holds, for a label box
	 * within its room of what stands on its band.
	 * @param chain The station's chain.
	 * @param station The station.
	 * @param occupancy What its band holds besides its chain.
	 * @returns The intervals it keeps out of.
	 */
	keptOff(chain: Chain, station: Station, occupancy: Occupancy): Span[] {
		const { item } = station;
		const half = item === undefined ? 0 : item.box.width / 2;
		const [left, right] = this.extent;
		return [
			...framesOff(this.scene, station, endFrames(this.scene, chain)),
			[-Infinity, left + half],
			[right - half, Infinity],
			...(item === undefined
				? occupancy.taken[station.band]!
				: this.labelWalls(chain, item, station.band)),
		];
	}

	/**
	 * Where a label box's centre may not stand on its band: within a card's
	 * clearance of a card, title row or the caption it keeps clear of
	 * ({@link Scene.captionsFor}), a label's of a label, a lane of another
	 * line's lane, or a container's inset of a frame's or region's wall, which
	 * it never straddles.
	 * @param chain The label's chain.
	 * @param label The box.
	 * @param band The band it would stand on.
	 * @returns The intervals its centre keeps out of.
	 */
	labelWalls(chain: Chain, label: Item, band: number): Span[] {
		const half = label.box.width / 2;
		const { cards, titles, labels } = this.scene;
		const placed = band === label.band ? label : onBand(this.scene, label, band);
		const solid = [...cards.values(), ...titles.values(), ...this.scene.captionsFor(placed)];
		const others = [...labels.values()].filter((item) => item !== label);
		const lanes = this.chains
			.filter((other) => other !== chain)
			.flatMap(({ stations }) =>
				stations.filter((one) => one.kind === "lane" && one.band === band),
			);
		const walls = [...this.scene.walled(band).values()].flat();
		return [
			...solid.map((item) => [item, LABEL_CARD_CLEARANCE] as const),
			...others.map((item) => [item, LABEL_LABEL_CLEARANCE] as const),
		]
			.filter(([item]) => item.band === band)
			.map(([{ box }, gap]): Span => [box.x - gap - half, box.x + box.width + gap + half])
			.concat(
				lanes.map(({ x }): Span => [x - LANE - half, x + LANE + half]),
				walls.map((wall): Span => [wall - CONTAINER_INSET - half, wall + CONTAINER_INSET + half]),
			);
	}

	/**
	 * Whether a new route saves enough over the old one, its crossings counted
	 * line by line or trunk by trunk. The counts differ only where a route
	 * crosses a trunk, whose lines are drawn as one there: counted line by
	 * line, a route over a trunk is dearer than it looks; counted by trunks,
	 * a lap over one is cheaper, and one lap kept moves the lines relayed
	 * after it.
	 * @param stations The chain's stations.
	 * @param route Where each would stand.
	 * @param old Where each stands.
	 * @returns True when either count saves enough.
	 */
	saves(stations: readonly Station[], route: readonly number[], old: readonly number[]): boolean {
		return [undefined, this.trunksAmong.bind(this)].some(
			(counted) =>
				this.cost(stations, route, counted) <= this.cost(stations, old, counted) - SAVING,
		);
	}

	/**
	 * What a chain's line costs with its stations at some x: its sideways
	 * travel and a crossing's worth for each line, or trunk, it crosses.
	 * @param stations The chain's stations.
	 * @param xs Where each stands.
	 * @param counted What the lines crossed in one channel count, when not one each.
	 * @returns The cost.
	 */
	cost(stations: readonly Station[], xs: readonly number[], counted?: Counted): number {
		const travel = stations.slice(1).reduce((sum, lower, index) => {
			const upper = stations[index]!;
			const [top, bottom] = [xs[index]!, xs[index + 1]!];
			return sum + Math.abs(meetsAt(upper, bottom, top) - meetsAt(lower, top, bottom));
		}, 0);
		return travel + CROSSING * crossingsOf(stations, xs, this.bands, counted);
	}

	/**
	 * What the other lines do in the channel between two of a chain's
	 * stations, leaving out those that meet the chain at a card or label
	 * there, which it never crosses.
	 * @param upper The chain's station above the channel.
	 * @param lower Its station below it.
	 * @param xs The columns.
	 * @returns The traffic, read onto the columns.
	 */
	trafficIn(upper: Station, lower: Station, xs: readonly number[]): Traffic {
		const nets = this.bands.flatMap((other): Span[] => {
			const [one, two] = [other.get(upper.band), other.get(lower.band)];
			if (one === undefined || two === undefined || meets(one, upper) || meets(two, lower))
				return [];
			return [[meetsAt(one, two.x), meetsAt(two, one.x)]];
		});
		const ends = nets.flat().toSorted((one, other) => one - other);
		const runs = nets.map(([one, two]): Span => [Math.min(one, two), Math.max(one, two)]);
		return { warped: warp(xs, ends), across: spanned(xs, runs) };
	}

	/**
	 * The cheapest free route over a chain's middle stations, by estimate:
	 * sideways travel, where each other line's upright passed on the way
	 * counts a crossing and each other line run across a column a station
	 * stands on counts one; a jog for each change of column; and at each end
	 * the travel from the card's reach. One pass down the stations, each
	 * column's best from the columns above found in one sweep each way.
	 * @param stations The chain's stations.
	 * @param xs The columns.
	 * @param masks Which columns each middle station may stand on.
	 * @returns Each middle station's x, or nothing when no route is free.
	 */
	cheapest(
		stations: readonly Station[],
		xs: readonly number[],
		masks: readonly Uint8Array[],
	): number[] | undefined {
		const [upper, lower] = [stations[0]!, stations.at(-1)!];
		const traffic = new Map(
			stations
				.slice(1)
				.map(
					(below, index) => [below.band - 1, this.trafficIn(stations[index]!, below, xs)] as const,
				),
		);
		let cost = fromReach(xs, traffic.get(upper.band)!.warped, reachOf(upper));
		const steps: Int32Array[] = [];
		stations.slice(1, -1).forEach(({ band }, index) => {
			if (index > 0) {
				const step = descend(cost, traffic.get(band - 1)!.warped, xs);
				steps.push(step.came);
				cost = step.cost;
			}
			const [above, below] = [traffic.get(band - 1)!.across, traffic.get(band)!.across];
			const mask = masks[index]!;
			cost = cost.map((value, j) =>
				mask[j] === 1 ? value + (CROSSING * (above[j]! + below[j]!)) / 2 : Infinity,
			);
		});
		const last = fromReach(xs, traffic.get(lower.band - 1)!.warped, reachOf(lower));
		const totals = cost.map((value, j) => value + last[j]!);
		const end = totals.reduce((best, value, j) => (value < totals[best]! ? j : best), 0);
		return Number.isFinite(totals[end]) ? backtrack(steps, end).map((j) => xs[j]!) : undefined;
	}
}

/**
 * Relay every chain that laps the drawing onto a short free route through
 * it, longest first, each keeping clear of every other line's lanes as they
 * stand; its label box moves along its band with it.
 * @param scene The scene; relayed label boxes move.
 * @param kinds Every relationship's chain, its lanes straightened, and what
 * it must share with another to share a trunk.
 * @param movable The chains that may be relayed.
 */
function relayLaps(
	scene: Scene,
	kinds: ReadonlyMap<Chain, string>,
	movable: readonly Chain[],
): void {
	const laps = movable
		.filter(strays)
		.toSorted((one, other) => other.stations.length - one.stations.length);
	if (laps.length === 0) return;
	const relay = new Relay(scene, kinds);
	for (const chain of laps) relay.relay(chain);
}

export { relayLaps };
