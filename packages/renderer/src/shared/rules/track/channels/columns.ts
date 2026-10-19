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
import { LABEL_CARD_CLEARANCE } from "#shared/constants/spacing.ts";
import {
	LANE,
	Occupancy,
	crossingsOf,
	meetsAt,
	nearest,
	reachOf,
	type Chain,
	type Station,
} from "#shared/rules/track/routes/chains.ts";
import { extentOf } from "#shared/rules/track/labels/labels.ts";
import { byBand, onBand, readingsOf, take } from "#shared/rules/track/routes/readings.ts";
import type { Scene } from "#shared/rules/track/scene/scene.ts";
import { crossingsFor } from "#shared/rules/track/routes/straighten.ts";

/** What a line costs: the other lines it crosses, then the sideways steps it takes. */
type Cost = readonly [number, number];

/** A column a line may stand on, and what it costs there. */
interface Placing {
	readonly x: number;
	readonly cost: Cost;
}

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
 * where it stands. Longer lines choose first. Where no column on the label's
 * own band leaves the line straight, its label may move to the band above or
 * below ({@link readingsOf}) when a column there runs straight from card to
 * card: Graphviz stood the label beside a card that blocks the one column
 * both cards reach.
 * @param scene The placed scene; a moved label's box moves with its line.
 * @param chains Every relationship's chain, its lanes straightened.
 */
function straightenThroughLabels(scene: Scene, chains: readonly Chain[]): void {
	const bands = chains.map(({ stations }) => byBand(stations));
	// A line that already runs without a step keeps its column.
	const stepping = chains
		.flatMap((chain) => {
			const stretch = stretchOf(chain.stations);
			return stretch !== undefined && stepsOf(stationsOf(stretch), xsOf(stretch)) > 0
				? [{ chain, stretch }]
				: [];
		})
		.toSorted((one, other) => other.stretch.middle.length - one.stretch.middle.length);
	for (const { chain } of stepping) {
		const index = chains.indexOf(chain);
		const others = chains.flatMap((one) =>
			one === chain ? [] : one.stations.filter(({ kind }) => kind === "lane"),
		);
		straighten(scene, { chain, index }, others, bands);
		bands[index] = byBand(chain.stations);
	}
}

/**
 * Stand one stepping labelled line on the column that serves it best: on its
 * label's own band, unless only a reading with its label on the band above
 * or below runs straight from card to card, crossing no more lines.
 * @param scene The placed scene.
 * @param line The line's chain and its index among the chains.
 * @param line.chain The chain; its stations move.
 * @param line.index Its index.
 * @param others Every other line's lanes.
 * @param bands Every chain's stations, by band; the line's own are read back as they stand.
 */
function straighten(
	scene: Scene,
	line: { chain: Chain; index: number },
	others: readonly Station[],
	bands: ReadonlyMap<number, Station>[],
): void {
	const { chain, index } = line;
	const standing = stretchOf(chain.stations)!;
	const was = costOf(stationsOf(standing), xsOf(standing), bands);
	const kept = columnOf(scene, standing, others, bands, was);
	if (kept?.cost[1] === 0) {
		stand(standing, kept.x);
		return;
	}
	const [, ...moved] = readingsOf(scene, chain);
	const straight = moved.flatMap((stations) => {
		bands[index] = byBand(stations);
		const found = columnOf(scene, stretchOf(stations)!, others, bands, kept?.cost ?? was);
		bands[index] = byBand(chain.stations);
		return found?.cost[1] === 0 ? [{ stations, ...found }] : [];
	});
	const best = straight.toSorted((one, other) => one.cost[0] - other.cost[0])[0];
	if (best !== undefined) {
		const route = best.stations.map((station, at) =>
			at === 0 || at === best.stations.length - 1 ? station.x : best.x,
		);
		take(chain, { stations: best.stations, route, cost: 0 }, scene);
	} else if (kept !== undefined) stand(standing, kept.x);
}

/**
 * Stand a line's stations between its cards on one column.
 * @param stretch The line's stations between its cards.
 * @param x The column.
 */
function stand(stretch: Stretch, x: number): void {
	for (const station of stretch.middle) station.x = x;
}

/**
 * A line's stations between its cards, when a label is among them.
 * @param stations The line's stations.
 * @returns Its stretch, or nothing for a line without a label box.
 */
function stretchOf(stations: readonly Station[]): Stretch | undefined {
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
 * @param standing What the line costs where it stands.
 * @returns The column and what the line costs on it, or nothing when none will do.
 */
function columnOf(
	scene: Scene,
	stretch: Stretch,
	others: readonly Station[],
	bands: readonly ReadonlyMap<number, Station>[],
	standing: Cost,
): Placing | undefined {
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
	const chosen = leastCrossing(stretch, columns.filter(fits), bands, standing);
	if (chosen !== undefined) return chosen;
	const found = nearest(wanted, fits, occupancy.edges(middle));
	return found === undefined ? undefined : leastCrossing(stretch, [found], bands, standing);
}

/**
 * Of some columns, the one that crosses fewest other lines and then leaves
 * the line fewest sideways steps, the first of them on a tie: when it crosses
 * no more lines than the line does where it stands, and steps fewer times.
 * @param stretch The line's stations between its cards.
 * @param columns The columns, best first.
 * @param bands Every chain's stations, by band.
 * @param standing What the line costs where it stands.
 * @returns The column and what the line costs on it, or nothing.
 */
function leastCrossing(
	stretch: Stretch,
	columns: readonly number[],
	bands: readonly ReadonlyMap<number, Station>[],
	standing: Cost,
): Placing | undefined {
	const own = stationsOf(stretch);
	const crossings = crossingsFor(own, bands);
	const better = columns
		.map((x) => {
			const xs = xsOf(stretch, x);
			return { x, cost: [crossings(xs), stepsOf(own, xs)] as Cost };
		})
		.filter(({ cost }) => cost[0] <= standing[0] && cost[1] < standing[1]);
	const best = better.toSorted(
		(one, other) => one.cost[0] - other.cost[0] || one.cost[1] - other.cost[1],
	);
	return best[0];
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
): Cost {
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
	const fits = occupancy.fitting({ lanes, before, after });
	return (x) =>
		fits(x) && labels.every((label) => labelFits(scene, { occupancy, extent }, label, x));
}

/**
 * Whether a label box may stand centred on a column: a lane clear of
 * everything else on its band and of a line drawn straight to its block's wall there, a card's clearance from a group region's
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
	const item =
		label.item!.band === label.band ? label.item! : onBand(scene, label.item!, label.band);
	const width = item.box.width;
	// Everything taken already keeps a lane of its own: with half a lane more,
	// the box stands as far from a line or another label as labels keep apart.
	const half = width / 2 + LANE / 2;
	const [left, right] = [x - half, x + half];
	// A line drawn straight from a card's side to the wall is no lane, so the band's room does not hold it.
	const besides = (scene.besides.get(label.band) ?? []).map(
		([low, high]): readonly [number, number] => [low - LANE, high + LANE],
	);
	return (
		[...room.occupancy.taken[label.band]!, ...besides].every(
			([low, high]) => right <= low || left >= high,
		) &&
		x - width / 2 >= room.extent[0] &&
		x + width / 2 <= room.extent[1] &&
		[...scene.captionsFor(item), ...scene.titleBandsFor(item)].every(
			({ box }) =>
				x + width / 2 <= box.x - LABEL_CARD_CLEARANCE ||
				x - width / 2 >= box.x + box.width + LABEL_CARD_CLEARANCE,
		)
	);
}

export { clearHeadings, straightenThroughLabels };
