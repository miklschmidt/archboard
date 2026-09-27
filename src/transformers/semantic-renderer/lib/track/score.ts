// How readable a routed layout is, and the ways to wrap a wide rank (TASK-349).
// Every choice an engine makes between two layouts of one board is made on
// how easily each reads, its measures compared in the order of ADR 0039
// (`readingOrder`); its fit to the reference pane only breaks a tie between
// layouts that read alike. A wrap or a fold exists to fit the page, and the
// bends and line it adds are its price: it is taken where it has fewer
// defects, or as few and fits clearly better (`worthTaking`). A layout chosen before the
// drawing a reader sees exists is weighed on its fit less a share for each
// crossing, its fit standing for how that drawing will read (`scoreOf`).
import { fitIn } from "@/shared/shell-geometry/index";
import type { Box, Point } from "@/transformers/semantic-renderer/lib/geometry";

/**
 * What one line from a column to a later one costs, in crossings: as much as
 * eight, since the eye follows it from the foot of one column round to the
 * head of the next.
 */
const BUS_COST = 8;
/** The share of its fit a layout keeps for each crossing it costs ({@link scoreOf}). */
const CROSSING_SHARE = 0.97;

/** A straight run of one line, with whether each of its ends is a bend of that line. */
interface Run {
	readonly line: number;
	readonly from: Point;
	readonly to: Point;
	readonly bends: readonly [boolean, boolean];
}

/** A place two lines cross: a level run of one through an upright run of the other, and its key. */
interface Crossing {
	readonly key: string;
	readonly level: Run;
	readonly upright: Run;
}

/**
 * What a layout is weighed on: its page, its crossings and its lines between
 * columns, and what else a reader sees in it where its lines are known. A
 * score ({@link scoreOf}) weighs only the page, the crossings and the lines
 * between columns.
 */
interface Weighed {
	readonly width: number;
	readonly height: number;
	readonly crossings: number;
	readonly bus?: number;
	/** Its crossings on a line's corner and its stacks of unrelated lines on one stroke, each one crossing more. */
	readonly knots?: number;
	/** The lanes' worth of line unrelated lines draw on one stroke or side by side nearer than a lane. */
	readonly tracks?: number;
	/** Its line ends hooking into a card's side, and its pairs of lines that touch. */
	readonly hooks?: number;
	readonly bends?: number;
	readonly length?: number;
}

/**
 * How near two layouts' crossings are for a reader to take them as alike: a
 * quarter of one. A choice that counts the line its routes run round a
 * block at a crossing's worth for so much line, or half a crossing for each
 * more line a trunk carries across another, weighs crossings in parts; ranked
 * on a sliver of detour, Board persistence settled its ports where three
 * lines each turned once more, on a page 64 px taller (Blocks).
 */
const NEAR_CROSSING = 0.25;
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
 * Where two different lines cross: a level run of one through an upright run
 * of another, each with its place's key. Lines on one trunk run together and
 * do not cross each other, and where a trunk crosses a line its lines cross
 * it at one place, so every crossing at one place has one key.
 * @param lines Every line's points.
 * @returns Each crossing of two runs.
 */
function crossingPlaces(lines: Iterable<readonly Point[]>): Crossing[] {
	const runs: Run[] = [...lines].flatMap((points, line) =>
		points.slice(1).map((to, index) => ({
			line,
			from: points[index]!,
			to,
			bends: [index > 0, index + 2 < points.length] as const,
		})),
	);
	const level = runs.filter(({ from, to }) => Math.abs(from.y - to.y) < 0.5);
	const upright = runs.filter(({ from, to }) => Math.abs(from.x - to.x) < 0.5);
	return level.flatMap((one) =>
		upright
			.filter(
				(other) =>
					other.line !== one.line &&
					inside(other.from.x, one.from.x, one.to.x) &&
					inside(one.from.y, other.from.y, other.to.y),
			)
			.map((other) => ({
				key: `${Math.round(other.from.x)},${Math.round(one.from.y)}`,
				level: one,
				upright: other,
			})),
	);
}

/**
 * How many places two different lines cross, drawn as one hop each ({@link crossingPlaces}).
 * @param lines Every line's points.
 * @returns The crossings.
 */
function crossingsOf(lines: Iterable<readonly Point[]>): number {
	return new Set(crossingPlaces(lines).map(({ key }) => key)).size;
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
 * What a layout costs its reader: its crossings, and each line between
 * columns at {@link BUS_COST}.
 * @param layout What is weighed.
 * @returns The cost, in crossings.
 */
function costOf(layout: Weighed): number {
	return layout.crossings + BUS_COST * (layout.bus ?? 0);
}

/**
 * A layout's reading measures, in the order of ADR 0039, each nothing where
 * it is not weighed: its crossings, each on a corner or in a stack one more;
 * the line unrelated lines draw on one stroke or side by side; its hooks and
 * touching lines; its bends; and its route length.
 * @param layout What is weighed.
 * @returns The measures.
 */
function measuresOf(layout: Weighed): [number, number, number, number, number] {
	const { knots = 0, tracks = 0, hooks = 0, bends = 0, length = 0 } = layout;
	return [costOf(layout) + knots, tracks, hooks, bends, length];
}

/**
 * The first of some measures two layouts differ on, compared.
 * @param mine One layout's measures.
 * @param theirs Another's.
 * @returns Below zero when the first is less there, above when more, zero when they agree.
 */
function firstDifference(mine: readonly number[], theirs: readonly number[]): number {
	const at = mine.findIndex((value, index) => Math.abs(value - theirs[index]!) > 1e-9);
	return at === -1 ? 0 : mine[at]! - theirs[at]!;
}

/**
 * How one layout's defects compare with another's, in the order of ADR
 * 0039: its crossings, each on a corner or in a stack one more, alike
 * within {@link NEAR_CROSSING}; then the line unrelated lines draw on one
 * stroke or side by side; then its hooks and touching lines. These a
 * chooser never trades for fit.
 * @param one A layout.
 * @param other Another.
 * @returns Below zero when the first has fewer, above when more, zero when alike.
 */
function defectOrder(one: Weighed, other: Weighed): number {
	const [[crossings, ...mine], [against, ...theirs]] = [measuresOf(one), measuresOf(other)];
	if (Math.abs(crossings - against) >= NEAR_CROSSING) return crossings - against;
	return firstDifference(mine.slice(0, 2), theirs.slice(0, 2));
}

/**
 * How one layout reads against another, on the measures of ADR 0039 in its
 * order: its defects ({@link defectOrder}); then its bends; then its route
 * length, alike within {@link NEAR_LENGTH}. A layout better on an earlier
 * measure reads better whatever the later ones say.
 * @param one A layout.
 * @param other Another.
 * @returns Below zero when the first reads better, above when the other does, zero when they read alike.
 */
function readingOrder(one: Weighed, other: Weighed): number {
	const defects = defectOrder(one, other);
	if (defects !== 0) return defects;
	const [mine, theirs] = [measuresOf(one), measuresOf(other)];
	if (mine[3] !== theirs[3]) return mine[3] - theirs[3];
	const [length, longest] = [mine[4], theirs[4]];
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
	return order === 0 ? fitsBetterAlone(one, other) : order < 0;
}

/**
 * Whether one layout fits the reference pane better than another, or as
 * well on a smaller page.
 * @param one A layout.
 * @param other Another.
 * @returns True when the first fits better.
 */
function fitsBetterAlone(one: Weighed, other: Weighed): boolean {
	const [fit, best] = [fitIn(one), fitIn(other)];
	if (Math.abs(fit - best) > 1e-9) return fit > best;
	return one.width * one.height < other.width * other.height;
}

/**
 * A layout's fit to the reference pane, less a share for every crossing it
 * costs its reader ({@link CROSSING_SHARE}). It weighs only the layouts that
 * are chosen before the drawing a reader sees exists, so their fit stands
 * for how that drawing will read: a wrap of a block inside the board, laid
 * out before its parent packs it, and a packing of blocks, weighed on its
 * trunks before its blocks' lines are joined through their ports. Ranked on
 * their own crossings first, those choices crossed Archboard server whole
 * 69 -> 109 times and Board persistence whole 9 -> 12 (Blocks). A fold of a
 * block of cards is weighed on it too: its crossings are estimated as the
 * block's unfolded, so it trades no crossing, only its lines between columns
 * for the fit it gains. Weighed as costing eight crossings each against any
 * fit, a line between columns kept every chain unfolded; ignored, one-line
 * folds bent straight drawings that already fit (Cloud Infrastructure's
 * Regional entry, 0 -> 8 bends).
 * @param layout What is weighed.
 * @returns The score.
 */
function scoreOf(layout: Weighed): number {
	return fitIn(layout) * CROSSING_SHARE ** costOf(layout);
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
 * Whether a layout made to fit the page, a wrap or a fold, is worth taking
 * over the layout it would replace: it has fewer defects
 * ({@link defectOrder}); or, as few, fits the reference pane clearly
 * better. The bends and line it adds between its rows or columns are the
 * price of any wrap or fold, which ADR 0039 keeps: ranked on them, no chain
 * of cards folded.
 * @param one The wrap or fold.
 * @param other The layout it would replace.
 * @param worth How many times better it must fit, as few defects as it has.
 * @returns True when it is.
 */
function worthTaking(one: Weighed, other: Weighed, worth: number): boolean {
	const defects = defectOrder(one, other);
	if (defects !== 0) return defects < 0;
	return fitIn(one) > fitIn(other) * worth;
}

/**
 * Whether one of two layouts made to fit the page, two wraps of a block,
 * is better: it has fewer defects ({@link defectOrder}); or, as few, fits
 * the reference pane better; or as well on a smaller page. Their bends and
 * line are the price of wrapping, which {@link worthTaking} weighs.
 * @param one A layout.
 * @param other Another.
 * @returns True when the first is better.
 */
function fitsBetter(one: Weighed, other: Weighed): boolean {
	const defects = defectOrder(one, other);
	return defects === 0 ? fitsBetterAlone(one, other) : defects < 0;
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
	costOf,
	crossingPlaces,
	crossingsOf,
	defectOrder,
	fitsBetter,
	worthTaking,
	lapsOf,
	readsBetter,
	scoreOf,
	scoresBetter,
	sinks,
	wrapPlans,
	type Crossing,
	type Run,
	type Weighed,
};
