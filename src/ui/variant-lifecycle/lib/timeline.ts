// A board's variants as one line with branches: the lines a timeline draws
// beside each variant, worked out from nothing but where the variants sit in
// their list. The main line runs through the variants at depth zero (the one
// the board's name opens, then its history); a variant one deeper branches off
// the one above it at the shallower depth, as a draft branches off the variant
// it was derived from; and a line keeps running past whatever sits between two
// variants it joins. The navigator draws these lanes compactly beside its rows,
// and the About page draws the same lanes roomily. Pure.

/** The lines one variant's row draws, by depth: each depth's line runs through one column. */
interface Lane {
	/** The variant's own depth, relative to the main line's. */
	readonly depth: number;
	/** The depths whose line runs the whole height of the row, past it. */
	readonly through: readonly number[];
	/** The line at the variant's own depth comes in from above to its mark. */
	readonly above: boolean;
	/** A line leaves its mark downward: to the next variant on the main line, or to its branches. */
	readonly below: boolean;
	/** The depth it branches off, one shallower than its own, or null on the main line. */
	readonly from: number | null;
}

/**
 * The lanes of a list of variants.
 * @param depths Each variant's depth in the list, the main line at zero, in order.
 * @returns One lane per variant.
 */
function timelineLanes(depths: readonly number[]): Lane[] {
	return depths.map((depth, index) => laneAt(depths, index, depth));
}

/**
 * One row's lane.
 * @param depths Every row's depth, in order.
 * @param index The row.
 * @param depth Its depth.
 * @returns Its lane.
 */
function laneAt(depths: readonly number[], index: number, depth: number): Lane {
	const mainLater = depths.slice(index + 1).includes(0);
	// The line a row branches off is drawn by its elbow down to the mark; past
	// it only when a later row joins it too.
	const through = Array.from({ length: depth }, (_, level) => level).filter(
		(level) => branchContinues(depths, index, level) || (level === 0 && mainLater),
	);
	const onLine = depth === 0;
	return {
		depth,
		through,
		above: onLine && depths.slice(0, index).includes(0),
		below: depths[index + 1] === depth + 1 || (onLine && mainLater),
		from: onLine ? null : depth - 1,
	};
}

/**
 * Whether a branch's line at one depth runs past a row: a later row branches
 * off the same variant before anything as shallow as that variant comes.
 * @param depths Every row's depth, in order.
 * @param index The row.
 * @param level The depth of the variant the branch leaves.
 * @returns Whether it runs on.
 */
function branchContinues(depths: readonly number[], index: number, level: number): boolean {
	for (let next = index + 1; next < depths.length; next += 1) {
		const depth = depths[next]!;
		if (depth <= level) return false;
		if (depth === level + 1) return true;
	}
	return false;
}

export { timelineLanes, type Lane };
