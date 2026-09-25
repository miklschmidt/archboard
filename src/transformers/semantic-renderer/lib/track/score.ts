// How readable a routed layout is, and the ways to wrap a wide rank (TASK-349).
// Every choice an engine makes between layouts of one board (unwrapped or
// wrapped, whole or folded) is made on one score: the layout's fit to the
// reference pane, less a share for every crossing and for every line that
// runs from one column to another.
import { fitIn } from "@/shared/shell-geometry/index";
import type { Point } from "@/transformers/semantic-renderer/lib/geometry";

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

/** What a score weighs: the page, its crossings, and its lines between columns. */
interface Weighed {
	readonly width: number;
	readonly height: number;
	readonly crossings: number;
	readonly bus?: number;
}

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
 * How many times two different lines cross: a level run of one through an
 * upright run of another. Lines on one trunk run together and do not cross.
 * @param lines Every line's points.
 * @returns The crossings.
 */
function crossingsOf(lines: Iterable<readonly Point[]>): number {
	const runs: Run[] = [...lines].flatMap((points, line) =>
		points.slice(1).map((to, index) => ({ line, from: points[index]!, to })),
	);
	const level = runs.filter(({ from, to }) => Math.abs(from.y - to.y) < 0.5);
	const upright = runs.filter(({ from, to }) => Math.abs(from.x - to.x) < 0.5);
	return level.reduce(
		(total, one) =>
			total +
			upright.filter(
				(other) =>
					other.line !== one.line &&
					inside(other.from.x, one.from.x, one.to.x) &&
					inside(one.from.y, other.from.y, other.to.y),
			).length,
		0,
	);
}

/**
 * How readable a layout is: its fit to the reference pane, less a share for
 * every crossing and every line between columns.
 * @param layout What is weighed.
 * @returns The score.
 */
function scoreOf(layout: Weighed): number {
	return fitIn(layout) * CROSSING_COST ** layout.crossings * BUS_COST ** (layout.bus ?? 0);
}

/**
 * Whether one layout reads better than another: it scores higher, or scores
 * the same on a smaller page, since a layout that fits the pane whole scores
 * its full fit however much room it leaves.
 * @param one A layout.
 * @param other Another.
 * @returns True when the first reads better.
 */
function readsBetter(one: Weighed, other: Weighed): boolean {
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
 * @returns Each wrap, as how far each wrapped card is lowered.
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
			for (const id of ids) if (row > 0) cut.set(id, row);
			before += width;
		}
		const dealt = new Map(
			cards.map((id, index) => [id, index % rows] as const).filter(([, row]) => row > 0),
		);
		return rows < cards.length ? [cut, dealt] : [];
	});
	const seen = new Set<string>();
	return plans.filter((plan) => {
		const key = JSON.stringify([...plan]);
		const fresh = plan.size > 0 && !seen.has(key);
		seen.add(key);
		return fresh;
	});
}

export { crossingsOf, readsBetter, scoreOf, wrapPlans, type Weighed };
