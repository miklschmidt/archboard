// Columns a line's lanes take either side of straightening each run of them
// on its own (TASK-349). Before, lanes that cross a heading move clear of its
// words. After, and after lines lapping the drawing are relayed through it: a
// label box splits a line into two runs of lanes, and each run straightened
// alone took its own column, the run above under the label and the run below
// on the first column free for it, so the line stepped sideways on both sides
// of its label although one column was free all the way down. A stepping line
// with a label is then tried on one column from card to card, its label moving
// with it, on a column no other line holds: taking one another line holds only
// moved the step onto that line. It moves only to step fewer times, and never
// to cross more lines.
import { LABEL_CARD_CLEARANCE } from "@/transformers/semantic-renderer/config";
import {
	LANE,
	Occupancy,
	crossingsOf,
	meetsAt,
	nearest,
	reachOf,
	type Chain,
	type Station,
} from "@/transformers/semantic-renderer/lib/track/chains";
import { extentOf } from "@/transformers/semantic-renderer/lib/track/labels";
import type { Scene } from "@/transformers/semantic-renderer/lib/track/scene";

/** The stations of a line between its two cards, and those two cards. */
interface Stretch {
	readonly middle: readonly Station[];
	readonly before: Station;
	readonly after: Station;
}

/**
 * Move the lanes that cross a title row or caption clear of its words, in
 * their order: Graphviz kept the heading's room wherever it stood it on the
 * row, but its words are painted at the row's left, over the lanes Graphviz
 * ran beside that room. Each lane under the words, or within a lane of them
 * or of the lane before it, moves right as little as that takes.
 * @param scene The placed scene.
 * @param chains Every relationship's chain.
 */
function clearHeadings(scene: Scene, chains: readonly Chain[]): void {
	const lanes = chains.flatMap(({ stations }) => stations.filter(({ kind }) => kind === "lane"));
	for (const { band, end, walls } of scene.headings()) {
		const [low, high] = walls;
		const crossing = lanes
			.filter((lane) => lane.band === band && lane.x > low && lane.x < high)
			.toSorted((one, other) => one.x - other.x);
		let next = end + LANE;
		for (const lane of crossing) {
			lane.x = Math.max(lane.x, next);
			next = lane.x + LANE;
		}
	}
}

/**
 * Stand every line that has a label on one column from card to card, where
 * one is free: free of every other line's lanes on every band its own lanes
 * pass, keeping the frames its cards ask ({@link Scene.keepsFrames}), and leaving its
 * label a lane clear of everything else on the label's band. Of the free
 * columns a line takes the one that crosses fewest other lines, then steps
 * fewest times, and none that crosses more lines or steps as often as it does
 * where it stands. Longer lines choose first.
 * @param scene The placed scene; a moved label's box moves with its line.
 * @param chains Every relationship's chain, its lanes straightened.
 */
function straightenThroughLabels(scene: Scene, chains: readonly Chain[]): void {
	const bands = chains.map(
		({ stations }) => new Map(stations.map((station) => [station.band, station])),
	);
	const lanes = chains.flatMap(({ stations }) => stations.filter(({ kind }) => kind === "lane"));
	// A line that already runs without a step keeps its column.
	const stretches = chains
		.flatMap((chain) => stretchOf(chain) ?? [])
		.filter((stretch) => stepsOf(stationsOf(stretch), xsOf(stretch)) > 0)
		.toSorted((one, other) => other.middle.length - one.middle.length);
	for (const stretch of stretches) {
		const others = lanes.filter((lane) => !stretch.middle.includes(lane));
		const x = columnOf(scene, stretch, others, bands);
		if (x === undefined) continue;
		for (const station of stretch.middle) station.x = x;
	}
}

/**
 * A chain's stations between its cards, when a label is among them.
 * @param chain The chain.
 * @returns Its stretch, or nothing for a line without a label box.
 */
function stretchOf(chain: Chain): Stretch | undefined {
	const { stations } = chain;
	const middle = stations.slice(1, -1);
	if (!middle.some(({ kind }) => kind === "label")) return undefined;
	return { middle, before: stations[0]!, after: stations.at(-1)! };
}

/**
 * The column a labelled line stands on from card to card. It tries straight
 * on from both cards nearest its label, then its label's and its lanes' own
 * columns and the cards' centres, then the free column nearest its label, and
 * takes the best of them by {@link leastCrossing}.
 * @param scene The placed scene.
 * @param stretch The line's stations between its cards.
 * @param others Every other line's lanes.
 * @param bands Every chain's stations, by band.
 * @returns The column, or nothing when none will do.
 */
function columnOf(
	scene: Scene,
	stretch: Stretch,
	others: readonly Station[],
	bands: readonly ReadonlyMap<number, Station>[],
): number | undefined {
	const { middle, before, after } = stretch;
	const labels = middle.filter(({ kind }) => kind === "label");
	const occupancy = new Occupancy(scene, new Set(labels.map(({ item }) => item!)));
	others.forEach((lane) => occupancy.take(lane));
	const fits = fitting(scene, occupancy, stretch);
	const wanted = labels[0]!.x;
	const [low, high] = [reachOf(before), reachOf(after)];
	const both = [Math.max(low[0], high[0]), Math.min(low[1], high[1])] as const;
	const straight = both[0] <= both[1] ? [Math.min(both[1], Math.max(both[0], wanted))] : [];
	const columns = [...straight, ...middle.map(({ x }) => x), after.x, before.x];
	const chosen = leastCrossing(stretch, columns.filter(fits), bands);
	if (chosen !== undefined) return chosen;
	const found = nearest(wanted, fits, occupancy.edges(middle));
	return found === undefined ? undefined : leastCrossing(stretch, [found], bands);
}

/**
 * Of some columns, the one that crosses fewest other lines and then leaves
 * the line fewest sideways steps, the first of them on a tie: when it crosses
 * no more lines than the line does where it stands, and steps fewer times.
 * @param stretch The line's stations between its cards.
 * @param columns The columns, best first.
 * @param bands Every chain's stations, by band.
 * @returns The column, or nothing.
 */
function leastCrossing(
	stretch: Stretch,
	columns: readonly number[],
	bands: readonly ReadonlyMap<number, Station>[],
): number | undefined {
	const own = stationsOf(stretch);
	const standing = costOf(own, xsOf(stretch), bands);
	const better = columns
		.map((x) => ({ x, cost: costOf(own, xsOf(stretch, x), bands) }))
		.filter(({ cost }) => cost[0] <= standing[0] && cost[1] < standing[1]);
	const best = better.toSorted(
		(one, other) => one.cost[0] - other.cost[0] || one.cost[1] - other.cost[1],
	);
	return best[0]?.x;
}

/**
 * A line's stations, top to bottom.
 * @param stretch The line's stations between its cards, and its cards.
 * @returns The stations.
 */
function stationsOf(stretch: Stretch): Station[] {
	return [stretch.before, ...stretch.middle, stretch.after];
}

/**
 * Where a line's stations stand, top to bottom: where they stand now, or
 * those between its cards on one column.
 * @param stretch The line's stations between its cards, and its cards.
 * @param column The column, if any.
 * @returns Each station's x.
 */
function xsOf(stretch: Stretch, column?: number): number[] {
	return [stretch.before.x, ...stretch.middle.map(({ x }) => column ?? x), stretch.after.x];
}

/**
 * What a line costs, its stations standing at some x: the other lines it
 * crosses, then the sideways steps it takes.
 * @param own The line's stations, top to bottom.
 * @param xs Where each stands.
 * @param bands Every chain's stations, by band.
 * @returns The two counts.
 */
function costOf(
	own: readonly Station[],
	xs: readonly number[],
	bands: readonly ReadonlyMap<number, Station>[],
): readonly [number, number] {
	return [crossingsOf(own, xs, bands), stepsOf(own, xs)];
}

/**
 * How many times a line steps sideways between one station and the next, its
 * stations standing at some x: a card's end meets its neighbour anywhere
 * along the card's face.
 * @param own The line's stations, top to bottom.
 * @param xs Where each stands.
 * @returns The count.
 */
function stepsOf(own: readonly Station[], xs: readonly number[]): number {
	return own.slice(1).filter((lower, index) => {
		const upper = own[index]!;
		const [above, below] = [xs[index]!, xs[index + 1]!];
		return Math.abs(meetsAt(upper, below, above) - meetsAt(lower, above, below)) > 0.5;
	}).length;
}

/**
 * Whether a line's stations between its cards may all stand on one column.
 * @param scene The placed scene.
 * @param occupancy What each band holds, the line's own label boxes left out.
 * @param stretch The stations between the line's cards, and its cards.
 * @returns The test for a column.
 */
function fitting(scene: Scene, occupancy: Occupancy, stretch: Stretch): (x: number) => boolean {
	const { middle, before, after } = stretch;
	const lanes = middle.filter(({ kind }) => kind === "lane");
	const labels = middle.filter(({ kind }) => kind === "label");
	const extent = extentOf(scene);
	return (x) =>
		occupancy.fits({ lanes, before, after }, x) &&
		scene.keepsFrames({ lanes: labels, before, after }, x) &&
		labels.every((label) => labelFits(scene, { occupancy, extent }, label, x));
}

/**
 * Whether a label box may stand centred on a column: a lane clear of
 * everything else on its band, a card's clearance from a group region's
 * caption row it would reach above or stand level with ({@link Scene.captionsFor},
 * {@link Scene.titleBandsFor}), and within
 * the scene's extent, since a label out past it widens the page.
 * @param scene The placed scene.
 * @param room What the label keeps clear of.
 * @param room.occupancy What each band holds, the label's own box left out.
 * @param room.extent How far the scene's cards, title rows and labels reach.
 * @param label The label's station.
 * @param x The column.
 * @returns True when it may.
 */
function labelFits(
	scene: Scene,
	room: { occupancy: Occupancy; extent: readonly [number, number] },
	label: Station,
	x: number,
): boolean {
	const width = label.item!.box.width;
	// Everything taken already keeps a lane of its own: with half a lane more,
	// the box stands as far from a line or another label as labels keep apart.
	const half = width / 2 + LANE / 2;
	const [left, right] = [x - half, x + half];
	return (
		room.occupancy.taken[label.band]!.every(([low, high]) => right <= low || left >= high) &&
		x - width / 2 >= room.extent[0] &&
		x + width / 2 <= room.extent[1] &&
		[...scene.captionsFor(label.item!), ...scene.titleBandsFor(label.item!)].every(
			({ box }) =>
				x + width / 2 <= box.x - LABEL_CARD_CLEARANCE ||
				x - width / 2 >= box.x + box.width + LABEL_CARD_CLEARANCE,
		)
	);
}

export { clearHeadings, straightenThroughLabels };
