import { type DecodedRecord } from "@/runtime/board-inspection/lib/decode";
import { type ExactBox } from "@/runtime/board-inspection/lib/geometry";
import {
	sweepIntervalPairs,
	type SweepPartition,
	type SweepWork,
} from "@/runtime/board-inspection/lib/interval-sweep";
import { emptySweepWork, type CollisionPass } from "@/runtime/board-inspection/lib/finding-builder";

/** One thing the broad phase compares: a box, what it stands for, and how it partitions. */
interface PairItem<T> {
	id: string;
	box: ExactBox;
	value: T;
	records: readonly DecodedRecord[];
	semantics: SweepPartition;
}

/**
 * The run's comparison budget, and which pass exhausted it. Once a pass runs out, the run
 * reports the ceiling instead of pretending the remaining passes found nothing.
 */
interface ComparisonCounter {
	value: number;
	limited: boolean;
	pass: CollisionPass | null;
	comparisonLimit: number;
}

/** A partition that excludes nothing, which is what most things sweep under. */
const NO_EXCLUSIONS: ReadonlySet<string> = new Set<string>();

/**
 * Re-partition a set of items, which is how one item set takes part in several passes under
 * different exclusions without being rebuilt.
 * @param items the items
 * @param semantics how each item's value partitions in this pass
 * @returns the items under their new partitions
 */
const partitioned = <T>(
	items: readonly PairItem<T>[],
	semantics: (value: T) => SweepPartition,
): PairItem<T>[] => items.map((item) => ({ ...item, semantics: semantics(item.value) }));

/**
 * A partition that excludes nothing, named after the thing it belongs to.
 * @param partition the partition's name
 * @returns the partition
 */
const unrestrictedPartition = (partition: string): SweepPartition => ({
	partition,
	excludedPartitions: NO_EXCLUSIONS,
});

/** Anything the sweep compares, which is anything with a box. */
interface BoxedItem {
	box: ExactBox;
}

/** One item as the interval the sweep orders it by. */
interface SweepInterval<T> {
	id: string;
	min: number;
	max: number;
	value: PairItem<T>;
	semantics: SweepPartition;
}

/**
 * The items as intervals on the sweep axis, which is the x extent of each one's box.
 * @param items the items
 * @returns the intervals
 */
function materialize<T>(items: readonly PairItem<T>[]): SweepInterval<T>[] {
	return items.map((item) => ({
		id: item.id,
		min: item.box.x,
		max: item.box.x + item.box.width,
		value: item,
		semantics: item.semantics,
	}));
}

/**
 * Add one pass's measured sweep work into the run's totals, taking the largest of every peak.
 * @param work the run's totals, advanced in place
 * @param measured what this pass measured
 */
function mergeSweepWork(work: SweepWork, measured: SweepWork): void {
	work.events += measured.events;
	work.activeVisits += measured.activeVisits;
	work.expiryPops += measured.expiryPops;
	work.bucketScans += measured.bucketScans;
	work.exactQuerySteps += measured.exactQuerySteps;
	work.hierarchyNodeVisits += measured.hierarchyNodeVisits;
	work.peakActiveBuckets = Math.max(work.peakActiveBuckets, measured.peakActiveBuckets);
	work.peakActiveProfiles = Math.max(work.peakActiveProfiles, measured.peakActiveProfiles);
	work.peakIndexNodes = Math.max(work.peakIndexNodes, measured.peakIndexNodes);
	work.peakSelections = Math.max(work.peakSelections, measured.peakSelections);
}

/**
 * Whether two items' boxes can touch at all on the axis the sweep does not order by, which is
 * the cheap rejection every pass makes before it looks at the shapes themselves.
 * @param a one item
 * @param b the other
 * @returns true when their vertical extents meet
 */
function verticallyDisjoint(a: BoxedItem, b: BoxedItem): boolean {
	return b.box.y > a.box.y + a.box.height || b.box.y + b.box.height < a.box.y;
}

/**
 * Compare two item sets pairwise through the interval sweep, stopping the moment the run's
 * comparison budget is spent so a large board reports a ceiling rather than running on.
 * @param left one item set
 * @param right the other, the same set when a pass compares a set against itself
 * @param sameSet whether the two sets are the same one
 * @param visit what to do with a pair whose boxes meet
 * @param counter the run's comparison budget, advanced in place
 * @param work the run's sweep totals, advanced in place
 * @param pass which pass this is, for the ceiling finding
 */
function pairSweep<A, B>(
	left: readonly PairItem<A>[],
	right: readonly PairItem<B>[],
	sameSet: boolean,
	visit: (a: A, b: B) => void,
	counter: ComparisonCounter,
	work: SweepWork,
	pass: CollisionPass,
): void {
	const measured = emptySweepWork();
	sweepIntervalPairs(
		materialize(left),
		materialize(right),
		sameSet,
		(aInterval, bInterval) => {
			const a = aInterval.value;
			const b = bInterval.value;
			counter.value += 1;
			if (counter.value > counter.comparisonLimit) {
				counter.limited = true;
				counter.pass = pass;
				return false;
			}
			if (verticallyDisjoint(a, b)) {
				return true;
			}
			visit(a.value, b.value);
			return true;
		},
		{ work: measured },
	);
	mergeSweepWork(work, measured);
}

export {
	NO_EXCLUSIONS,
	type ComparisonCounter,
	type PairItem,
	pairSweep,
	partitioned,
	unrestrictedPartition,
};
