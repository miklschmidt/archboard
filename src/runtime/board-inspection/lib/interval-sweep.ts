import { compareIdentity } from "./ordering.js";

export interface SweepInterval<T> {
	id: string;
	min: number;
	max: number;
	value: T;
	semantics: SweepPartition;
}

export interface SweepPartition {
	partition: string;
	excludedPartitions: ReadonlySet<string>;
	ancestorTargets?: readonly string[];
	hierarchy?: SweepHierarchy;
}

export interface SweepWork {
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

export interface SweepOptions {
	/** Caller-owned development counters. */
	work?: SweepWork;
}

export const emptySweepWork = (): SweepWork => ({
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

export interface SweepHierarchy {
	readonly size: number;
	position(id: string, step?: () => void): number | undefined;
	subtree(id: string, step?: () => void): readonly [number, number] | null;
	pathToRoot(id: string, step?: () => void): readonly (readonly [number, number])[];
	isAncestor(ancestor: string, descendant: string, step?: () => void): boolean;
	lca(left: string, right: string, step?: () => void): string | null;
}

/** Build deterministic hierarchy coordinates for semantic exclusion queries. */
export function buildSweepHierarchy(
	parents: ReadonlyMap<string, string | null | undefined>,
): SweepHierarchy {
	const parentById = new Map<string, string | null>();
	for (const [id, parent] of parents)
		parentById.set(id, parent && parents.has(parent) ? parent : null);
	const children = new Map<string, string[]>();
	for (const id of parentById.keys()) children.set(id, []);
	for (const [id, parent] of parentById) if (parent) children.get(parent)!.push(id);
	for (const [parent, values] of children) {
		children.set(parent, values.toSorted(compareIdentity));
	}
	const roots = [...parentById].filter(([, parent]) => parent === null).map(([id]) => id);
	const orderedRoots = roots.toSorted(compareIdentity);
	const positions = new Map<string, number>();
	const ranges = new Map<string, readonly [number, number]>();
	let cursor = 0;
	for (const root of orderedRoots) {
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
			for (let index = nested.length - 1; index >= 0; index -= 1)
				stack.push({ id: nested[index]!, leaving: false });
		}
	}
	const ancestors = (id: string, step?: () => void): string[] => {
		const result: string[] = [];
		let current: string | null | undefined = id;
		const seen = new Set<string>();
		while (current && !seen.has(current)) {
			step?.();
			seen.add(current);
			result.push(current);
			current = parentById.get(current);
		}
		return result;
	};
	return {
		size: parentById.size,
		position: (id, step) => {
			step?.();
			return positions.get(id);
		},
		subtree: (id, step) => {
			step?.();
			return ranges.get(id) ?? null;
		},
		pathToRoot: (id, step) =>
			ancestors(id, step).map((ancestor) => {
				const position = positions.get(ancestor)!;
				return [position, position] as const;
			}),
		isAncestor: (ancestor, descendant, step) => {
			step?.();
			const range = ranges.get(ancestor);
			const position = positions.get(descendant);
			return !!range && position !== undefined && range[0] <= position && position <= range[1];
		},
		lca: (left, right, step) => {
			const rightAncestors = new Set(ancestors(right, step));
			return ancestors(left, step).find((candidate) => rightAncestors.has(candidate)) ?? null;
		},
	};
}

interface Event<T> {
	interval: SweepInterval<T>;
	set: 0 | 1;
	ordinal: number;
}

const eventOrder = (left: Event<unknown>, right: Event<unknown>): number =>
	left.interval.min - right.interval.min ||
	left.interval.max - right.interval.max ||
	left.set - right.set ||
	compareIdentity(left.interval.id, right.interval.id) ||
	left.ordinal - right.ordinal;

function partitionExcluded(profile: SweepPartition, partition: string, work: SweepWork): boolean {
	if (profile.excludedPartitions.has(partition)) return true;
	if (!profile.hierarchy) return false;
	const targets = profile.ancestorTargets ?? [];
	for (const target of targets) {
		work.hierarchyNodeVisits += 1;
		if (profile.hierarchy.isAncestor(partition, target)) return true;
	}
	return false;
}

/** Enumerate every semantically permitted closed x-overlap once in stable event order. */
export function sweepIntervalPairs<A, B>(
	left: readonly SweepInterval<A>[],
	right: readonly SweepInterval<B>[],
	sameSet: boolean,
	visit: (left: SweepInterval<A>, right: SweepInterval<B>) => boolean | void,
	options?: SweepOptions,
): SweepWork {
	type Value = A | B;
	const work = options?.work ?? emptySweepWork();
	const events: Event<Value>[] = [];
	for (let ordinal = 0; ordinal < left.length; ordinal += 1)
		events.push({ interval: left[ordinal]!, set: 0, ordinal });
	if (!sameSet)
		for (let ordinal = 0; ordinal < right.length; ordinal += 1)
			events.push({ interval: right[ordinal]!, set: 1, ordinal });
	const orderedEvents = events.toSorted(eventOrder);

	const active: [Array<Event<Value>>, Array<Event<Value>>] = [[], []];
	const activeProfiles = new Map<SweepPartition, number>();
	for (const event of orderedEvents) {
		work.events += 1;
		for (let set = 0; set < active.length; set += 1) {
			const retained: Array<Event<Value>> = [];
			for (const candidate of active[set]!) {
				if (candidate.interval.max < event.interval.min) {
					work.expiryPops += 1;
					const profile = candidate.interval.semantics;
					const remaining = activeProfiles.get(profile)! - 1;
					if (remaining === 0) activeProfiles.delete(profile);
					else activeProfiles.set(profile, remaining);
				} else retained.push(candidate);
			}
			active[set] = retained;
		}
		const oppositeSet = sameSet ? 0 : event.set === 0 ? 1 : 0;
		for (const candidate of active[oppositeSet]) {
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
			if (eventExcludes || activeExcludes) continue;
			work.bucketScans += 1;
			work.activeVisits += 1;
			const shouldContinue =
				event.set === 0
					? visit(event.interval as SweepInterval<A>, candidate.interval as SweepInterval<B>)
					: visit(candidate.interval as SweepInterval<A>, event.interval as SweepInterval<B>);
			if (shouldContinue === false) return work;
		}
		active[event.set].push(event);
		activeProfiles.set(
			event.interval.semantics,
			(activeProfiles.get(event.interval.semantics) ?? 0) + 1,
		);
		work.peakActiveBuckets = Math.max(work.peakActiveBuckets, active[0].length + active[1].length);
		work.peakActiveProfiles = Math.max(work.peakActiveProfiles, activeProfiles.size);
		work.peakIndexNodes = Math.max(work.peakIndexNodes, active[0].length + active[1].length);
	}
	return work;
}
