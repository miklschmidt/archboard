// Whether an x stands clear of what a band holds, asked of many x: a lane
// search tries column after column against the same stretches, some
// hundreds of them, so once it has asked a few times they are merged and
// sorted, and each x after is found by halving (TASK-377).

/** A stretch a lane keeps out of: every x strictly between its ends. */
type Stretch = readonly [number, number];

/**
 * How many x are tested stretch by stretch before the stretches are merged:
 * merging costs about as much as testing that many, and a test asked once,
 * as a single move asks, never pays for it.
 */
const ASKED_BEFORE_MERGING = 8;

/**
 * Whether an x stands clear of every one of some stretches: at or beyond an
 * end of each, as `x <= low || x >= high` asks of each one.
 * @param stretches The stretches.
 * @returns The test.
 */
function clearOf(stretches: readonly Stretch[]): (x: number) => boolean {
	let asked = 0;
	let merged: ((x: number) => boolean) | undefined;
	return (x) => {
		asked += 1;
		if (merged === undefined && asked <= ASKED_BEFORE_MERGING)
			return stretches.every(([low, high]) => x <= low || x >= high);
		merged ??= mergedOf(stretches);
		return merged(x);
	};
}

/**
 * {@link clearOf}'s test, its stretches merged and sorted.
 * @param stretches The stretches.
 * @returns The test.
 */
function mergedOf(stretches: readonly Stretch[]): (x: number) => boolean {
	// A stretch with an end that is not a number keeps every x out, as the
	// comparison it stands for does; one that is empty keeps none out.
	if (stretches.some(([low, high]) => Number.isNaN(low) || Number.isNaN(high))) return () => false;
	const lows: number[] = [];
	const highs: number[] = [];
	for (const [low, high] of stretches
		.filter(([one, other]) => one < other)
		.toSorted(([one], [other]) => one - other)) {
		// Two open stretches that overlap keep out one open stretch; two that
		// only touch leave the point between them clear.
		const last = highs.length - 1;
		if (last >= 0 && low < highs[last]!) highs[last] = Math.max(highs[last]!, high);
		else {
			lows.push(low);
			highs.push(high);
		}
	}
	return (x) => {
		if (Number.isNaN(x)) return stretches.length === 0;
		// The last stretch starting left of x is the only one that can hold it.
		let [start, end] = [0, lows.length];
		while (start < end) {
			const middle = (start + end) >> 1;
			if (lows[middle]! < x) start = middle + 1;
			else end = middle;
		}
		return start === 0 || x >= highs[start - 1]!;
	};
}

export { clearOf };
