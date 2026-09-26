// The sweeps of the relay's route search (visual polish): down one channel at
// a time, each column's cheapest cost from the columns on the band above,
// found in one pass each way, and the columns the search went down.
import { BEND_RADIUS } from "@/transformers/semantic-renderer/config";
import { LANE } from "@/transformers/semantic-renderer/lib/track/chains";

/** What a change of column costs a route while it is searched: two bends and the run between them. */
const JOG = 2 * LANE;
/** The shortest sideways step a line turns: its two bends. */
const MIN_STEP = 2 * BEND_RADIUS;

/** One step of the search down a chain: each column's cheapest cost, and the column above it came from. */
interface Step {
	readonly cost: Float64Array;
	readonly came: Int32Array;
}

/**
 * Let each column be reached from any column at least a whole step to its
 * left, at that column's cost, the warped travel between them and a jog,
 * where that is cheaper than what it has: the cheapest such column is
 * carried along as the columns rise.
 * @param above The cost of each column on the band above.
 * @param warped Each column's warped x in the channel.
 * @param xs The columns, ascending.
 * @param step Each column's cost so far, and the column above it came from.
 */
function fromLeft(
	above: Float64Array,
	warped: Float64Array,
	xs: readonly number[],
	step: Step,
): void {
	let best = Infinity;
	let at = -1;
	let next = 0;
	for (let j = 0; j < xs.length; j += 1) {
		for (; next < xs.length && xs[next]! <= xs[j]! - MIN_STEP; next += 1) {
			const from = above[next]! - warped[next]!;
			if (from < best) {
				best = from;
				at = next;
			}
		}
		const cost = best + warped[j]! + JOG;
		if (cost < step.cost[j]!) {
			step.cost[j] = cost;
			step.came[j] = at;
		}
	}
}

/**
 * Let each column be reached from any column at least a whole step to its
 * right, as {@link fromLeft} does from the left.
 * @param above The cost of each column on the band above.
 * @param warped Each column's warped x in the channel.
 * @param xs The columns, ascending.
 * @param step Each column's cost so far, and the column above it came from.
 */
function fromRight(
	above: Float64Array,
	warped: Float64Array,
	xs: readonly number[],
	step: Step,
): void {
	let best = Infinity;
	let at = -1;
	let next = xs.length - 1;
	for (let j = xs.length - 1; j >= 0; j -= 1) {
		for (; next >= 0 && xs[next]! >= xs[j]! + MIN_STEP; next -= 1) {
			const from = above[next]! + warped[next]!;
			if (from < best) {
				best = from;
				at = next;
			}
		}
		const cost = best - warped[j]! + JOG;
		if (cost < step.cost[j]!) {
			step.cost[j] = cost;
			step.came[j] = at;
		}
	}
}

/**
 * Move down one channel: each column's cheapest cost from the column above
 * it, or from one at least a whole step aside, at the warped travel between
 * them and a jog. A route never steps aside by less than its two bends
 * need to turn.
 * @param above The cost of each column on the band above.
 * @param warped Each column's warped x in the channel.
 * @param xs The columns, ascending.
 * @returns Each column's cost, and the column above it came from.
 */
function descend(above: Float64Array, warped: Float64Array, xs: readonly number[]): Step {
	const step: Step = { cost: above.slice(), came: new Int32Array(above.length) };
	for (let j = 0; j < above.length; j += 1) step.came[j] = j;
	fromLeft(above, warped, xs, step);
	fromRight(above, warped, xs, step);
	return step;
}

/**
 * The columns the search went down, from the one it ended on.
 * @param steps Where each step's columns came from, top to bottom.
 * @param end The column of the last station.
 * @returns Each station's column, top to bottom.
 */
function backtrack(steps: readonly Int32Array[], end: number): number[] {
	const chosen = [end];
	for (const came of steps.toReversed()) chosen.unshift(came[chosen[0]!]!);
	return chosen;
}

export { JOG, MIN_STEP, backtrack, descend };
