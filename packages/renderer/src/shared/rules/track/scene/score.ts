// How readable a routed layout is, and the ways to wrap a wide rank (TASK-349).
// Two layouts of one board are compared on how easily each reads, their
// measures in the order of ADR 0039 (`readingOrder`), and their fit to the
// reference pane only breaks a tie between layouts that read alike. Every
// chooser ADR 0039 changed also weighs its two layouts as it did before, and
// takes the pick of its reading measures only where the two agree or that
// pick is no worse on any measure (`takes`). A line's run away from its ends
// weighs as crossings (`shared/rules/blocks/lines/away.ts`). The stack chooser's and the
// Graphviz fold's earlier weighings, and the choices made before the drawing
// a reader sees exists, weigh a layout's fit less a share for each crossing
// (`scoreOf`); the joins' and the packing's earlier weighings are in
// shared/rules/blocks/tree/joins.ts and shared/rules/blocks/tree/place.ts.
import { fitIn } from "#shared/constants/shell-geometry.ts";
import type { Box, Point } from "#shared/rules/geometry.ts";

/** What one crossing costs a layout, as the share of its fit it keeps. */
const CROSSING_COST = 0.97;
/**
 * What one line from a column to a later one costs, as the share of fit it
 * keeps: as much as eight crossings, since the eye follows it from the foot of
 * one column round to the head of the next.
 */
const BUS_COST = CROSSING_COST ** 8;

/** A straight run of one line. */
interface Run {
	readonly line: number;
	readonly from: Point;
	readonly to: Point;
}

/**
 * What a layout is weighed on: its page, its crossings and its lines between
 * columns, and what else a reader sees in it where an engine counts it. A
 * score ({@link scoreOf}) weighs only the page, the crossings and the lines
 * between columns.
 */
interface Weighed {
	readonly width: number;
	readonly height: number;
	readonly crossings: number;
	/** What its lines' runs away from their ends weigh, in crossings (`shared/rules/blocks/lines/away.ts`). */
	readonly away?: number;
	readonly bus?: number;
	/** Its line ends hooking into a card's side, its pairs of lines that touch and its crowded joins. */
	readonly hooks?: number;
	readonly bends?: number;
	readonly length?: number;
}

/** How near two layouts' route lengths are for a reader to take them as alike: a twentieth. */
const NEAR_LENGTH = 0.05;

/**
 * Whether a value lies strictly between two others, clear of both.
 * @param value The value.
 * @param one One end.
 * @param other The other end.
 * @returns True when it is inside.
 */
function inside(value: number, one: number, other: number): boolean {
	return value > Math.min(one, other) + 1 && value < Math.max(one, other) - 1;
}

/**
 * Count the places different lines cross, with each shared trunk counted once.
 * @param lines Every line's points.
 * @returns The crossings.
 */
function crossingsOf(lines: Iterable<readonly Point[]>): number {
	const { level, upright } = runsOf(lines);
	upright.sort((one, other) => one.from.x - other.from.x);
	const crossed = new Set<string>();
	for (const one of level) addCrossings(crossed, one, upright);
	return crossed.size;
}

/**
 * Collect the horizontal and vertical runs of the lines.
 * @param lines Every line's points.
 * @returns Each run with the line that owns it.
 */
function runsOf(lines: Iterable<readonly Point[]>): { level: Run[]; upright: Run[] } {
	const level: Run[] = [];
	const upright: Run[] = [];
	let line = 0;
	for (const points of lines) {
		for (let index = 1; index < points.length; index += 1) {
			const from = points[index - 1]!;
			const to = points[index]!;
			const run = { line, from, to };
			if (Math.abs(from.y - to.y) < 0.5) level.push(run);
			if (Math.abs(from.x - to.x) < 0.5) upright.push(run);
		}
		line += 1;
	}
	return { level, upright };
}

/**
 * Find the first upright strictly right of an x.
 * @param upright The runs sorted by x.
 * @param x The left bound.
 * @returns The first candidate's index.
 */
function firstRight(upright: readonly Run[], x: number): number {
	let start = 0;
	let end = upright.length;
	while (start < end) {
		const middle = (start + end) >>> 1;
		if (upright[middle]!.from.x <= x) start = middle + 1;
		else end = middle;
	}
	return start;
}

/**
 * Keep the distinct crossings on one horizontal run.
 * @param crossed The places already counted.
 * @param one The horizontal run.
 * @param upright The upright runs sorted by x.
 */
function addCrossings(crossed: Set<string>, one: Run, upright: readonly Run[]): void {
	const low = Math.min(one.from.x, one.to.x) + 1;
	const high = Math.max(one.from.x, one.to.x) - 1;
	for (let index = firstRight(upright, low); index < upright.length; index += 1) {
		const other = upright[index]!;
		if (other.from.x >= high) break;
		if (other.line !== one.line && inside(one.from.y, other.from.y, other.to.y))
			crossed.add(`${Math.round(other.from.x)},${Math.round(one.from.y)}`);
	}
}

/** How long an upright run beyond everything a block holds must be to lap round it. */
const LAP = 200;

/**
 * How many lines lap round a block: run down or up, for more than a short
 * way, beyond everything it holds on either side. A lap reads worse than a
 * crossing, which the relay may trade one for, so a layout is charged a
 * crossing's worth for each.
 * @param lines Every line's points.
 * @param boxes Every box the block holds.
 * @returns The laps.
 */
function lapsOf(lines: Iterable<readonly Point[]>, boxes: readonly Box[]): number {
	if (boxes.length === 0) return 0;
	const left = Math.min(...boxes.map(({ x }) => x));
	const right = Math.max(...boxes.map(({ x, width }) => x + width));
	return [...lines].filter((points) =>
		points
			.slice(1)
			.some(
				(to, index) =>
					Math.abs(to.x - points[index]!.x) < 0.5 &&
					Math.abs(to.y - points[index]!.y) > LAP &&
					(to.x < left || to.x > right),
			),
	).length;
}

/**
 * A layout's reading measures, in the order of ADR 0039: its lines' runs
 * away from their ends weigh as crossings.
 * @param layout What is weighed.
 * @returns Its crossings, hooks, bends and route length.
 */
function measuresOf(layout: Weighed): [number, number, number, number] {
	const { crossings, away = 0, hooks = 0, bends = 0, length = 0 } = layout;
	return [crossings + away, hooks, bends, length];
}

/**
 * How one layout reads against another, on the measures of ADR 0039 in its
 * order, each nothing where an engine does not count it: its crossings; its
 * hooks and touching lines; its bends; its route length, alike within
 * {@link NEAR_LENGTH}. A layout better on an earlier measure reads better
 * whatever the later ones say.
 * @param one A layout.
 * @param other Another.
 * @returns Below zero when the first reads better, above when the other
 * does, zero when they read alike.
 */
function readingOrder(one: Weighed, other: Weighed): number {
	const [mine, theirs] = [measuresOf(one), measuresOf(other)];
	const at = mine.findIndex((value, index) => value !== theirs[index]);
	if (at !== -1 && at < 3) return mine[at]! - theirs[at]!;
	const [length, longest] = [mine[3], theirs[3]];
	return Math.abs(length - longest) > NEAR_LENGTH * Math.min(length, longest)
		? length - longest
		: 0;
}

/**
 * Whether one layout reads better than another ({@link readingOrder}); or,
 * reading alike, fits the reference pane better; or fits it as well on a
 * smaller page, since a layout that fits the pane whole fits it at full
 * scale however much room it leaves.
 * @param one A layout.
 * @param other Another.
 * @returns True when the first reads better.
 */
function readsBetter(one: Weighed, other: Weighed): boolean {
	const order = readingOrder(one, other);
	return order === 0 ? fitsBetter(one, other) : order < 0;
}

/**
 * Whether one layout reads no worse than another on any measure of ADR 0039
 * ({@link readingOrder}), its route length within {@link NEAR_LENGTH}.
 * @param one A layout.
 * @param other Another.
 * @returns True when it is nowhere worse.
 */
function noWorse(one: Weighed, other: Weighed): boolean {
	const [[crossings, hooks, bends, length], theirs] = [measuresOf(one), measuresOf(other)];
	return (
		crossings <= theirs[0] &&
		hooks <= theirs[1] &&
		bends <= theirs[2] &&
		length <= theirs[3] * (1 + NEAR_LENGTH)
	);
}

/**
 * Whether a chooser ADR 0039 changed takes the first of two layouts, the
 * guard every such chooser keeps: its reading pick where its earlier
 * weighing, from before the ADR, agrees; or where that pick reads no worse
 * than the earlier one on any measure ({@link noWorse}); else the earlier
 * pick. Two layouts often trade one measure for another, and the reading
 * pick then reads worse somewhere than the one taken before: What the CLI
 * can be asked (Blocks) parted two lines into Board client for two hops
 * fewer, and drew 14% more line; Archboard server whole (Track) packed its
 * groups for 13 hops fewer, at 23 bends more; One command from a pane
 * (Blocks) held a port order for two crossings fewer and ran three unrelated
 * lines side by side along its bottom.
 * @param one A layout.
 * @param other Another.
 * @param earlier Whether the earlier weighing takes the first.
 * @param reads Whether the reading measures take it: by default, whether it
 * reads better ({@link readsBetter}).
 * @returns True when the first is taken.
 */
function takes(
	one: Weighed,
	other: Weighed,
	earlier: boolean,
	reads = readsBetter(one, other),
): boolean {
	if (reads === earlier) return reads;
	return reads ? noWorse(one, other) : !noWorse(other, one);
}

/**
 * Whether one layout fits the reference pane better than another, or as
 * well on a smaller page.
 * @param one A layout.
 * @param other Another.
 * @returns True when the first fits better.
 */
function fitsBetter(one: Weighed, other: Weighed): boolean {
	const [fit, best] = [fitIn(one), fitIn(other)];
	if (Math.abs(fit - best) > 1e-9) return fit > best;
	return one.width * one.height < other.width * other.height;
}

/**
 * A layout's fit to the reference pane, less a share for every crossing
 * ({@link CROSSING_COST}) and a greater one for every line between columns
 * ({@link BUS_COST}). It is the earlier weighing, from before ADR 0039, of
 * the stack chooser and the Graphviz fold, which their guard keeps
 * ({@link takes}). It alone weighs the layouts chosen before the drawing a
 * reader sees exists, whose fit stands for how that drawing will read: a
 * wrap of a block inside the board, laid out before its parent packs it,
 * and a packing of blocks, weighed on its trunks before its blocks' lines
 * are joined through their ports. Ranked on their own crossings first, those
 * choices crossed Archboard server whole 69 -> 109 times and Board
 * persistence whole 9 -> 12 (Blocks). A fold of a block of cards is weighed
 * on it too: its crossings are estimated as the block's unfolded, so it
 * trades no crossing, only its lines between columns for the fit it gains.
 * Weighed as costing eight crossings each against any fit, a line between
 * columns kept every chain unfolded; ignored, one-line folds bent straight
 * drawings that already fit (Cloud Infrastructure's Regional entry, 0 -> 8
 * bends).
 * @param layout What is weighed.
 * @returns The score.
 */
function scoreOf(layout: Weighed): number {
	const crossings = layout.crossings + (layout.away ?? 0);
	return fitIn(layout) * CROSSING_COST ** crossings * BUS_COST ** (layout.bus ?? 0);
}

/**
 * Whether one layout scores higher than another ({@link scoreOf}), or as
 * high on a smaller page.
 * @param one A layout.
 * @param other Another.
 * @returns True when the first scores better.
 */
function scoresBetter(one: Weighed, other: Weighed): boolean {
	const [mine, theirs] = [scoreOf(one), scoreOf(other)];
	if (Math.abs(mine - theirs) > 1e-9) return mine > theirs;
	return one.width * one.height < other.width * other.height;
}

/**
 * The ways to wrap a wide rank into rows, every row after the first lowered
 * one row of cards more: the rank cut left to right into two to four rows of
 * about equal width, each run of cards held together kept in one row, and the
 * rank dealt out across the rows card by card.
 * @param runs The rank's cards left to right, in runs held together, each with its width.
 * @returns Each wrap, as the row of every card of the rank, left to right: the
 * first row's cards stay where they are, and the first of them anchors the rest.
 */
function wrapPlans(
	runs: readonly { ids: readonly string[]; width: number }[],
): Map<string, number>[] {
	const total = runs.reduce((sum, { width }) => sum + width, 0);
	const cards = runs.flatMap(({ ids }) => ids);
	const plans = [2, 3, 4].flatMap((rows) => {
		const cut = new Map<string, number>();
		let before = 0;
		for (const { ids, width } of runs) {
			const row = Math.min(rows - 1, Math.floor(((before + width / 2) * rows) / total));
			for (const id of ids) cut.set(id, row);
			before += width;
		}
		const dealt = new Map(cards.map((id, index) => [id, index % rows] as const));
		return rows < cards.length ? [cut, dealt] : [];
	});
	const seen = new Set<string>();
	return plans.filter((plan) => {
		const key = JSON.stringify([...plan]);
		const fresh = [...plan.values()].some((row) => row > 0) && !seen.has(key);
		seen.add(key);
		return fresh;
	});
}

/**
 * The lowered cards of a wrap that no line arrives at, each with the card of
 * its rank that stays in the first row and holds it down: a card a line
 * arrives at is lowered by that line, one no line reaches by its anchor alone.
 * @param plan The wrap: every card of the rank and its row.
 * @param arriving The cards some line arrives at.
 * @returns Each such lowered card, its rows and its anchor.
 */
function anchored(
	plan: ReadonlyMap<string, number>,
	arriving: ReadonlySet<string>,
): { card: string; rows: number; anchor: string }[] {
	const anchor = [...plan].find(([, row]) => row === 0)?.[0];
	if (anchor === undefined) return [];
	return [...plan]
		.filter(([card, row]) => row > 0 && !arriving.has(card))
		.map(([card, rows]) => ({ card, rows, anchor }));
}

/**
 * Whether two boxes share some width, one over the other.
 * @param one A box.
 * @param other Another.
 * @returns True when they do.
 */
function across(one: Box, other: Box): boolean {
	return one.x < other.x + other.width && other.x < one.x + one.width;
}

/**
 * Whether a wrap, laid out, sinks a card rather than wrapping it: some
 * lowered card has no card in the row above standing over it, so it stands
 * off on a late rank of its own, away from its neighbours. A card with a
 * card of its own cluster in a higher row must stand under one of those; the
 * topmost cards of a cluster the wrap lowered whole may stand under any. The
 * cards outside every cluster count as one cluster of their own, so a
 * lowered one of them with none of them higher may stand under any card too.
 * @param plan The wrap: every card of the rank and its row.
 * @param boxes Where the wrap laid each card.
 * @param around The innermost cluster around a card, if any.
 * @returns True when it sinks a card.
 */
function sinks(
	plan: ReadonlyMap<string, number>,
	boxes: ReadonlyMap<string, Box>,
	around: (card: string) => string | undefined,
): boolean {
	const cards = [...plan];
	return cards.some(([card, row]) => {
		if (row === 0) return false;
		const kin = cards.filter(([other]) => around(other) === around(card));
		const led = kin.some(([, above]) => above < row);
		const under = (led ? kin : cards).filter(([, above]) => above === row - 1);
		return !under.some(([other]) => across(boxes.get(other)!, boxes.get(card)!));
	});
}

export {
	anchored,
	crossingsOf,
	LAP,
	lapsOf,
	readsBetter,
	scoreOf,
	scoresBetter,
	sinks,
	takes,
	wrapPlans,
	type Weighed,
};
