import { compareIdentity } from "@/runtime/board-inspection/lib/ordering";

interface SweepInterval<T> {
	id: string;
	min: number;
	max: number;
	value: T;
	semantics: SweepPartition;
}

interface SweepPartition {
	partition: string;
	excludedPartitions: ReadonlySet<string>;
	ancestorTargets?: readonly string[];
	hierarchy?: SweepHierarchy;
}

interface SweepWork {
	events: number;
	activeVisits: number;
	expiryPops: number;
	bucketScans: number;
	exactQuerySteps: number;
	hierarchyNodeVisits: number;
	peakActiveBuckets: number;
	peakActiveProfiles: number;
	peakIndexNodes: number;
	peakSelections: number;
}

interface SweepOptions {
	/** Caller-owned development counters. */
	work?: SweepWork;
}

/**
 * A fresh set of development counters, all at zero.
 * @returns the counters
 */
const emptySweepWork = (): SweepWork => ({
	events: 0,
	activeVisits: 0,
	expiryPops: 0,
	bucketScans: 0,
	exactQuerySteps: 0,
	hierarchyNodeVisits: 0,
	peakActiveBuckets: 0,
	peakActiveProfiles: 0,
	peakIndexNodes: 0,
	peakSelections: 0,
});

interface SweepHierarchy {
	readonly size: number;
	position(id: string, step?: () => void): number | undefined;
	subtree(id: string, step?: () => void): readonly [number, number] | null;
	pathToRoot(id: string, step?: () => void): readonly (readonly [number, number])[];
	isAncestor(ancestor: string, descendant: string, step?: () => void): boolean;
	lca(left: string, right: string, step?: () => void): string | null;
}

/** The Euler-tour coordinates an ancestor query is answered from. */
interface HierarchyCoordinates {
	readonly positions: ReadonlyMap<string, number>;
	readonly ranges: ReadonlyMap<string, readonly [number, number]>;
}

/**
 * Resolve each node's parent, dropping a parent the hierarchy does not itself contain so no
 * query can walk out of the set it was built from.
 * @param parents the declared parent of each node
 * @returns the resolved parent of each node
 */
function resolveParents(
	parents: ReadonlyMap<string, string | null | undefined>,
): Map<string, string | null> {
	const parentById = new Map<string, string | null>();
	for (const [id, parent] of parents) {
		parentById.set(
			id,
			parent !== null && parent !== undefined && parents.has(parent) ? parent : null,
		);
	}
	return parentById;
}

/**
 * Invert the parent map into children, each in identity order so the tour is deterministic.
 * @param parentById the resolved parent of each node
 * @returns the children of each node
 */
function childrenByParent(parentById: ReadonlyMap<string, string | null>): Map<string, string[]> {
	const children = new Map<string, string[]>();
	for (const id of parentById.keys()) {
		children.set(id, []);
	}
	for (const [id, parent] of parentById) {
		if (parent !== null) {
			children.get(parent)!.push(id);
		}
	}
	for (const [parent, values] of children) {
		children.set(parent, values.toSorted(compareIdentity));
	}
	return children;
}

/**
 * Walk every root's subtree iteratively, numbering each node on entry and closing its range on
 * exit, so an ancestor test becomes one range comparison.
 * @param parentById the resolved parent of each node
 * @param children the children of each node
 * @returns each node's position and subtree range
 */
function eulerCoordinates(
	parentById: ReadonlyMap<string, string | null>,
	children: ReadonlyMap<string, string[]>,
): HierarchyCoordinates {
	const positions = new Map<string, number>();
	const ranges = new Map<string, readonly [number, number]>();
	const roots = [...parentById].filter(([, parent]) => parent === null).map(([id]) => id);
	let cursor = 0;
	for (const root of roots.toSorted(compareIdentity)) {
		const stack: Array<{ id: string; leaving: boolean }> = [{ id: root, leaving: false }];
		while (stack.length > 0) {
			const current = stack.pop()!;
			if (current.leaving) {
				ranges.set(current.id, [positions.get(current.id)!, cursor - 1]);
				continue;
			}
			positions.set(current.id, cursor++);
			stack.push({ id: current.id, leaving: true });
			const nested = children.get(current.id)!;
			for (let index = nested.length - 1; index >= 0; index -= 1) {
				stack.push({ id: nested[index]!, leaving: false });
			}
		}
	}
	return { positions, ranges };
}

/**
 * Build deterministic hierarchy coordinates for semantic exclusion queries.
 * @param parents the declared parent of each node
 * @returns the hierarchy queries the sweep consults
 */
function buildSweepHierarchy(
	parents: ReadonlyMap<string, string | null | undefined>,
): SweepHierarchy {
	const parentById = resolveParents(parents);
	const { positions, ranges } = eulerCoordinates(parentById, childrenByParent(parentById));

	/**
	 * Every ancestor of a node, nearest first, stopping at a cycle.
	 * @param id the node to walk up from
	 * @param step the caller's development counter
	 * @returns the node and its ancestors
	 */
	const ancestors = (id: string, step?: () => void): string[] => {
		const result: string[] = [];
		let current: string | null | undefined = id;
		const seen = new Set<string>();
		while (current !== null && current !== undefined && !seen.has(current)) {
			step?.();
			seen.add(current);
			result.push(current);
			current = parentById.get(current);
		}
		return result;
	};

	return {
		size: parentById.size,
		/**
		 * A node's position in the tour.
		 * @param id the node
		 * @param step the caller's development counter
		 * @returns the position, or undefined when the node is not in the hierarchy
		 */
		position: (id, step) => {
			step?.();
			return positions.get(id);
		},
		/**
		 * A node's subtree range.
		 * @param id the node
		 * @param step the caller's development counter
		 * @returns the range, or null when the node is not in the hierarchy
		 */
		subtree: (id, step) => {
			step?.();
			return ranges.get(id) ?? null;
		},
		/**
		 * The single-point ranges of a node and each of its ancestors.
		 * @param id the node
		 * @param step the caller's development counter
		 * @returns one range per node on the path to its root
		 */
		pathToRoot: (id, step) =>
			ancestors(id, step).map((ancestor) => {
				const position = positions.get(ancestor)!;
				return [position, position] as const;
			}),
		/**
		 * Whether one node's subtree contains another.
		 * @param ancestor the candidate ancestor
		 * @param descendant the candidate descendant
		 * @param step the caller's development counter
		 * @returns true when the descendant lies inside the ancestor's range
		 */
		isAncestor: (ancestor, descendant, step) => {
			step?.();
			const range = ranges.get(ancestor);
			const position = positions.get(descendant);
			return range !== undefined && position !== undefined && withinRange(position, range);
		},
		/**
		 * The nearest node that is an ancestor of both, if any.
		 * @param left one node
		 * @param right the other
		 * @param step the caller's development counter
		 * @returns the common ancestor, or null
		 */
		lca: (left, right, step) => {
			const rightAncestors = new Set(ancestors(right, step));
			return ancestors(left, step).find((candidate) => rightAncestors.has(candidate)) ?? null;
		},
	};
}

/**
 * Whether a tour position lies inside a subtree range.
 * @param position the position
 * @param range the subtree range
 * @returns true when the position is inside
 */
function withinRange(position: number, range: readonly [number, number]): boolean {
	return range[0] <= position && position <= range[1];
}

interface Event<T> {
	interval: SweepInterval<T>;
	set: 0 | 1;
	ordinal: number;
}

/**
 * Order sweep events so the enumeration is stable whatever order the caller supplied.
 * @param left one event
 * @param right the other
 * @returns -1, 0 or 1
 */
const eventOrder = (left: Event<unknown>, right: Event<unknown>): number =>
	left.interval.min - right.interval.min ||
	left.interval.max - right.interval.max ||
	left.set - right.set ||
	compareIdentity(left.interval.id, right.interval.id) ||
	left.ordinal - right.ordinal;

/**
 * Whether a partition excludes another, directly or because it excludes one of its ancestors.
 * @param profile the partition doing the excluding
 * @param partition the partition being tested
 * @param work the development counters, updated in place
 * @returns true when the pair must not be visited
 */
function partitionExcluded(profile: SweepPartition, partition: string, work: SweepWork): boolean {
	if (profile.excludedPartitions.has(partition)) {
		return true;
	}
	if (!profile.hierarchy) {
		return false;
	}
	const targets = profile.ancestorTargets ?? [];
	for (const target of targets) {
		work.hierarchyNodeVisits += 1;
		if (profile.hierarchy.isAncestor(partition, target)) {
			return true;
		}
	}
	return false;
}

/**
 * Build the event queue: one event per interval, both sets unless the sweep is over one set
 * against itself.
 * @param left the first set
 * @param right the second set
 * @param sameSet whether the two sets are the same one
 * @returns the events in stable sweep order
 */
function buildEvents<A, B>(
	left: readonly SweepInterval<A>[],
	right: readonly SweepInterval<B>[],
	sameSet: boolean,
): Event<A | B>[] {
	const events: Event<A | B>[] = [];
	for (let ordinal = 0; ordinal < left.length; ordinal += 1) {
		events.push({ interval: left[ordinal]!, set: 0, ordinal });
	}
	if (!sameSet) {
		for (let ordinal = 0; ordinal < right.length; ordinal += 1) {
			events.push({ interval: right[ordinal]!, set: 1, ordinal });
		}
	}
	return events.toSorted(eventOrder);
}

/**
 * Forget one expired interval's contribution to the active partition profiles.
 * @param profile the interval's partition
 * @param activeProfiles how many active intervals each partition has, updated in place
 */
function releaseProfile(
	profile: SweepPartition,
	activeProfiles: Map<SweepPartition, number>,
): void {
	const remaining = activeProfiles.get(profile)! - 1;
	if (remaining === 0) {
		activeProfiles.delete(profile);
	} else {
		activeProfiles.set(profile, remaining);
	}
}

/**
 * Drop the active intervals that end before the event begins, in place.
 * @param active the active intervals of both sets, replaced in place
 * @param activeProfiles how many active intervals each partition has, updated in place
 * @param minimum the event's start
 * @param work the development counters, updated in place
 */
function expireActive<T>(
	active: [Array<Event<T>>, Array<Event<T>>],
	activeProfiles: Map<SweepPartition, number>,
	minimum: number,
	work: SweepWork,
): void {
	for (let set = 0; set < active.length; set += 1) {
		const retained: Array<Event<T>> = [];
		for (const candidate of active[set]!) {
			if (candidate.interval.max < minimum) {
				work.expiryPops += 1;
				releaseProfile(candidate.interval.semantics, activeProfiles);
			} else {
				retained.push(candidate);
			}
		}
		active[set] = retained;
	}
}

/**
 * Whether either side of a pair excludes the other, which is what keeps a semantically
 * impossible pair out of the enumeration.
 * @param event the arriving interval
 * @param candidate the active interval
 * @param work the development counters, updated in place
 * @returns true when the pair must be skipped
 */
function pairExcluded<T>(event: Event<T>, candidate: Event<T>, work: SweepWork): boolean {
	work.exactQuerySteps += 2;
	const eventExcludes = partitionExcluded(
		event.interval.semantics,
		candidate.interval.semantics.partition,
		work,
	);
	const activeExcludes = partitionExcluded(
		candidate.interval.semantics,
		event.interval.semantics.partition,
		work,
	);
	return eventExcludes || activeExcludes;
}

/**
 * Record the peak sizes the sweep reached, which are the module's development evidence that
 * its working set stayed bounded.
 * @param work the development counters, updated in place
 * @param active the active intervals of both sets
 * @param activeProfiles how many active intervals each partition has
 */
function recordPeaks<T>(
	work: SweepWork,
	active: readonly [readonly Event<T>[], readonly Event<T>[]],
	activeProfiles: ReadonlyMap<SweepPartition, number>,
): void {
	const activeCount = active[0].length + active[1].length;
	work.peakActiveBuckets = Math.max(work.peakActiveBuckets, activeCount);
	work.peakActiveProfiles = Math.max(work.peakActiveProfiles, activeProfiles.size);
	work.peakIndexNodes = Math.max(work.peakIndexNodes, activeCount);
}

/**
 * Enumerate every semantically permitted closed x-overlap once in stable event order.
 * @param left the first set of intervals
 * @param right the second set of intervals
 * @param sameSet whether the two sets are the same one
 * @param visit receives each permitted pair; returning false stops the sweep
 * @param options the caller-owned development counters
 * @returns the development counters, whether the sweep finished or was stopped
 */
function sweepIntervalPairs<A, B>(
	left: readonly SweepInterval<A>[],
	right: readonly SweepInterval<B>[],
	sameSet: boolean,
	visit: (left: SweepInterval<A>, right: SweepInterval<B>) => boolean | void,
	options?: SweepOptions,
): SweepWork {
	type Value = A | B;
	const work = options?.work ?? emptySweepWork();
	const orderedEvents = buildEvents(left, right, sameSet);
	const active: [Array<Event<Value>>, Array<Event<Value>>] = [[], []];
	const activeProfiles = new Map<SweepPartition, number>();

	/**
	 * Deliver one overlapping pair the way the caller declared its two sets. An event's set is
	 * assigned where its interval is pushed, so the set and the interval's own type are
	 * correlated by construction; TypeScript cannot carry that through the shared event queue.
	 * @param event the arriving interval
	 * @param candidate the active interval it overlaps
	 * @returns whatever the visitor returned
	 */
	const deliver = (event: Event<Value>, candidate: Event<Value>): boolean | void => {
		// oxlint-disable-next-line typescript/no-unsafe-type-assertion -- an event's set names the side its interval came from
		const first = (event.set === 0 ? event.interval : candidate.interval) as SweepInterval<A>;
		// oxlint-disable-next-line typescript/no-unsafe-type-assertion -- an event's set names the side its interval came from
		const second = (event.set === 0 ? candidate.interval : event.interval) as SweepInterval<B>;
		return visit(first, second);
	};

	/**
	 * Visit every active interval on the opposite side that the arriving event overlaps.
	 * @param event the arriving interval
	 * @returns false when the visitor stopped the sweep
	 */
	const emitOverlaps = (event: Event<Value>): boolean => {
		const oppositeSet = sameSet ? 0 : event.set === 0 ? 1 : 0;
		for (const candidate of active[oppositeSet]) {
			if (pairExcluded(event, candidate, work)) {
				continue;
			}
			work.bucketScans += 1;
			work.activeVisits += 1;
			if (deliver(event, candidate) === false) {
				return false;
			}
		}
		return true;
	};

	for (const event of orderedEvents) {
		work.events += 1;
		expireActive(active, activeProfiles, event.interval.min, work);
		if (!emitOverlaps(event)) {
			return work;
		}
		active[event.set].push(event);
		activeProfiles.set(
			event.interval.semantics,
			(activeProfiles.get(event.interval.semantics) ?? 0) + 1,
		);
		recordPeaks(work, active, activeProfiles);
	}
	return work;
}

export {
	type SweepInterval,
	type SweepPartition,
	type SweepWork,
	type SweepOptions,
	emptySweepWork,
	type SweepHierarchy,
	buildSweepHierarchy,
	sweepIntervalPairs,
};
