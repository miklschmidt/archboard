// The column arithmetic of the relay's route search (visual polish): which
// columns a station may take, what the other lines in a channel cost each
// column, and the sweeps down one channel at a time, each column's cheapest
// cost from the columns on the band above found in one pass each way.
import { BEND_RADIUS } from "@/transformers/semantic-renderer/config";
import { LANE } from "@/transformers/semantic-renderer/lib/track/chains";

/** What a change of column costs a route while it is searched: two bends and the run between them. */
const JOG = 2 * LANE;
/** The shortest sideways step a line turns: its two bends. */
const MIN_STEP = 2 * BEND_RADIUS;

/**
 * What crossing another line costs, as sideways travel: the detour that
 * makes a lap. Cheaper, and relays pay for short laps with many crossings;
 * dearer, and they leave laps one crossing would undo.
 */
const CROSSING = 25 * LANE;
/** How far inside an interval's edge still counts as outside it. */
const EDGE = 1e-9;

/** An interval of x. */
type Span = readonly [number, number];

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

export { CROSSING, EDGE, backtrack, block, descend, fromReach, spanned, warp, type Span };
