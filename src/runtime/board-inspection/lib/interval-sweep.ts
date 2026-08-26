import { compareIdentity, compareIdentityLists } from "./ordering.js";

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
	/** Nodes whose semantic ancestors are excluded. The hierarchy owns the relation. */
	ancestorTargets?: readonly string[];
	hierarchy?: SweepHierarchy;
}

export interface SweepWork {
	events: number;
	activeVisits: number;
	expiryPops: number;
	partitionChecks: number;
	bucketScans: number;
	bucketIndexOperations: number;
	bucketLookups: number;
	bucketUpdates: number;
	bucketDeletes: number;
	compatibilityIndexUpdates: number;
	compatibilityProfiles: number;
	profileSnapshotEntries: number;
	profileSortComparisons: number;
	profileTerminalLookups: number;
	profileCreations: number;
	profileTrieSteps: number;
	compatibilityQueries: number;
	compatibilityQuerySteps: number;
	exactIndexUpdates: number;
	exactQuerySteps: number;
	exactMembershipTests: number;
	hierarchySummarySteps: number;
	compatibilityTests: number;
	hierarchyMembershipTests: number;
	hierarchyPathQueries: number;
	hierarchyPathSteps: number;
	hierarchySubtreeQueries: number;
	hierarchySubtreeSteps: number;
	hierarchyIndexUpdateSteps: number;
	peakRetainedBuckets: number;
	peakRetainedProfiles: number;
	peakRetainedProfileTrieNodes: number;
	peakRetainedHierarchyIndexCells: number;
	peakRetainedExclusionRefs: number;
	peakRetainedIndexRefs: number;
	/** Candidate references held only for the current compatibility query. */
	peakRetainedQueryRefs: number;
	peakRetainedExactIndexNodes: number;
	peakRetainedExactSummaryRefs: number;
	/** All sweep-owned event, profile, trie, active-node, bucket, index, and hierarchy references. */
	peakRetainedTotalStateRefs: number;
	peakRetainedSelections: number;
}

interface HierarchyNode {
	id: string;
	parent: string | null;
	children: string[];
	size: number;
	heavy: string | null;
	head: string;
	position: number;
}

/** Immutable hierarchy coordinates shared by compatibility profiles in one inspection. */
export interface SweepHierarchy {
	readonly size: number;
	position(id: string): number | undefined;
	subtree(id: string): readonly [number, number] | null;
	pathToRoot(id: string): readonly (readonly [number, number])[];
	isAncestor(ancestor: string, descendant: string): boolean;
	lca(left: string, right: string): string | null;
}

/** Build deterministic heavy-light coordinates without retaining per-profile ancestor copies. */
export function buildSweepHierarchy(
	parents: ReadonlyMap<string, string | null | undefined>,
): SweepHierarchy {
	const nodes = new Map<string, HierarchyNode>();
	for (const id of parents.keys())
		nodes.set(id, {
			id,
			parent: null,
			children: [],
			size: 1,
			heavy: null,
			head: id,
			position: -1,
		});
	for (const [id, parent] of parents) {
		if (!parent || !nodes.has(parent) || parent === id) continue;
		nodes.get(id)!.parent = parent;
		nodes.get(parent)!.children.push(id);
	}
	for (const node of nodes.values()) node.children.sort(compareIdentity);
	const roots = [...nodes.values()]
		.filter((node) => node.parent === null)
		.map((node) => node.id)
		.toSorted(compareIdentity);
	const order: string[] = [];
	const stack = roots.toReversed();
	while (stack.length > 0) {
		const id = stack.pop()!;
		order.push(id);
		const children = nodes.get(id)!.children;
		for (let index = children.length - 1; index >= 0; index -= 1) stack.push(children[index]!);
	}
	for (let index = order.length - 1; index >= 0; index -= 1) {
		const node = nodes.get(order[index]!)!;
		let heavy: HierarchyNode | null = null;
		for (const childId of node.children) {
			const child = nodes.get(childId)!;
			node.size += child.size;
			if (
				!heavy ||
				child.size > heavy.size ||
				(child.size === heavy.size && compareIdentity(child.id, heavy.id) < 0)
			)
				heavy = child;
		}
		node.heavy = heavy?.id ?? null;
	}
	let nextPosition = 0;
	const chains: Array<{ id: string; head: string }> = roots
		.toReversed()
		.map((id) => ({ id, head: id }));
	while (chains.length > 0) {
		let { id, head } = chains.pop()!;
		while (true) {
			const node = nodes.get(id)!;
			node.head = head;
			node.position = nextPosition;
			nextPosition += 1;
			for (let index = node.children.length - 1; index >= 0; index -= 1) {
				const child = node.children[index]!;
				if (child !== node.heavy) chains.push({ id: child, head: child });
			}
			if (!node.heavy) break;
			id = node.heavy;
		}
	}
	return {
		size: nodes.size,
		position: (id) => nodes.get(id)?.position,
		subtree: (id) => {
			const node = nodes.get(id);
			return node ? [node.position, node.position + node.size - 1] : null;
		},
		pathToRoot: (id) => {
			const ranges: Array<readonly [number, number]> = [];
			let node = nodes.get(id);
			while (node) {
				const head = nodes.get(node.head)!;
				ranges.push([head.position, node.position]);
				node = head.parent ? nodes.get(head.parent) : undefined;
			}
			return ranges;
		},
		isAncestor: (ancestor, descendant) => {
			const aa = nodes.get(ancestor);
			const dd = nodes.get(descendant);
			return (
				aa !== undefined &&
				dd !== undefined &&
				aa.position <= dd.position &&
				dd.position < aa.position + aa.size
			);
		},
		lca: (left, right) => {
			let aa = nodes.get(left),
				bb = nodes.get(right);
			if (!aa || !bb) return null;
			while (aa.head !== bb.head) {
				const aHead: HierarchyNode = nodes.get(aa.head)!,
					bHead: HierarchyNode = nodes.get(bb.head)!;
				if (aHead.position > bHead.position) {
					if (!aHead.parent) return null;
					aa = nodes.get(aHead.parent)!;
				} else {
					if (!bHead.parent) return null;
					bb = nodes.get(bHead.parent)!;
				}
			}
			return aa.position <= bb.position ? aa.id : bb.id;
		},
	};
}

interface CompatibilityProfile {
	exclusions: readonly string[];
	excluded: ReadonlySet<string>;
	ancestorTargets: readonly string[];
	hierarchy: SweepHierarchy | undefined;
}

interface ProfileNode {
	children: Map<string, ProfileNode>;
	profiles: Map<SweepHierarchy | null, ProfileNode>;
	profile: CompatibilityProfile | null;
}

interface ActiveNode<T> {
	interval: SweepInterval<T>;
	order: number;
	active: boolean;
	previous: ActiveNode<T> | null;
	next: ActiveNode<T> | null;
	list: ActiveList<T>;
}

interface ActiveList<T> {
	partition: string;
	profile: CompatibilityProfile;
	head: ActiveNode<T> | null;
	tail: ActiveNode<T> | null;
	index: BucketIndex<T>;
	exactRank: number;
}

interface BucketIndex<T> {
	buckets: Map<string, Map<CompatibilityProfile, ActiveList<T>>>;
	activeLists: Set<ActiveList<T>>;
	profileCounts: Map<CompatibilityProfile, number>;
	excludedByPartition: Map<string, Set<ActiveList<T>>>;
	hierarchy: SweepHierarchy | undefined;
	partitionCounts: RangeCount;
	targetCounts: RangeMaximum;
	targetPositionCounts: RangeCount;
	partitionLists: Map<number, Set<ActiveList<T>>>;
	targetLists: Map<number, Set<ActiveList<T>>>;
	unpositionedLists: Set<ActiveList<T>>;
	untargetedLists: Set<ActiveList<T>>;
	exact: ExactCompatibilityIndex<T>;
	totalBuckets: number;
	retainedExclusionRefs: number;
	retainedIndexRefs: number;
	activeNodes: number;
}

const EMPTY_IDENTITIES: readonly string[] = Object.freeze([]);

function identityIntersection(
	left: readonly string[],
	right: readonly string[],
): readonly string[] {
	if (left === right) return left;
	const intersection: string[] = [];
	let aa = 0,
		bb = 0;
	while (aa < left.length && bb < right.length) {
		const compared = compareIdentity(left[aa]!, right[bb]!);
		if (compared === 0) {
			intersection.push(left[aa]!);
			aa += 1;
			bb += 1;
		} else if (compared < 0) aa += 1;
		else bb += 1;
	}
	if (intersection.length === left.length) return left;
	if (intersection.length === right.length) return right;
	return intersection.length === 0 ? EMPTY_IDENTITIES : intersection;
}

function includesIdentity(values: readonly string[], wanted: string, work: SweepWork): boolean {
	let min = 0,
		max = values.length - 1;
	while (min <= max) {
		work.exactMembershipTests += 1;
		const middle = Math.floor((min + max) / 2);
		const compared = compareIdentity(values[middle]!, wanted);
		if (compared === 0) return true;
		if (compared < 0) min = middle + 1;
		else max = middle - 1;
	}
	return false;
}

class ExactCompatibilityIndex<T> {
	readonly size: number;
	readonly counts: number[];
	readonly lists: Array<ActiveList<T> | null>;
	readonly partitions: Array<string | null>;
	readonly commonExclusions: Array<readonly string[] | null>;
	readonly commonTargetCoverage: Array<readonly string[] | null>;
	readonly hierarchy: SweepHierarchy | undefined;
	retainedSummaryRefs = 0;

	constructor(length: number, hierarchy: SweepHierarchy | undefined) {
		let size = 1;
		while (size < Math.max(1, length)) size *= 2;
		this.size = size;
		this.counts = Array.from({ length: size * 2 }, () => 0);
		this.lists = Array.from({ length: size * 2 }, () => null);
		this.partitions = Array.from({ length: size * 2 }, () => null);
		this.commonExclusions = Array.from({ length: size * 2 }, () => null);
		this.commonTargetCoverage = Array.from({ length: size * 2 }, () => null);
		this.hierarchy = hierarchy;
	}

	private summaryRefs(node: number): number {
		if (this.counts[node] === 0) return 0;
		return (
			(this.lists[node] ? 1 : 0) +
			(this.partitions[node] === null ? 0 : 1) +
			(this.commonExclusions[node]?.length ?? 0) +
			(this.commonTargetCoverage[node]?.length ?? 0)
		);
	}

	private reducedCoverage(values: readonly string[], work: SweepWork): readonly string[] {
		if (!this.hierarchy || values.length < 2) return values;
		const kept: string[] = [];
		for (const value of values) {
			let redundant = false;
			for (const candidate of kept) {
				work.hierarchyMembershipTests += 1;
				if (this.hierarchy.isAncestor(value, candidate)) {
					redundant = true;
					break;
				}
			}
			if (redundant) continue;
			for (let index = kept.length - 1; index >= 0; index -= 1) {
				work.hierarchyMembershipTests += 1;
				if (this.hierarchy.isAncestor(kept[index]!, value)) kept.splice(index, 1);
			}
			kept.push(value);
		}
		return kept.toSorted(compareIdentity);
	}

	private intersectCoverage(
		left: readonly string[],
		right: readonly string[],
		work: SweepWork,
	): readonly string[] {
		if (left === right) return left;
		if (!this.hierarchy || left.length === 0 || right.length === 0) return EMPTY_IDENTITIES;
		const lcas = new Set<string>();
		for (const aa of left)
			for (const bb of right) {
				work.hierarchySummarySteps += 1;
				const lca = this.hierarchy.lca(aa, bb);
				if (lca) lcas.add(lca);
			}
		return this.reducedCoverage([...lcas], work);
	}

	set(rank: number, list: ActiveList<T> | null, work: SweepWork): void {
		let node = this.size + rank;
		this.retainedSummaryRefs -= this.summaryRefs(node);
		this.lists[node] = list;
		this.counts[node] = list ? 1 : 0;
		this.partitions[node] = list?.partition ?? null;
		this.commonExclusions[node] = list?.profile.exclusions ?? null;
		this.commonTargetCoverage[node] = list
			? this.reducedCoverage(list.profile.ancestorTargets, work)
			: null;
		this.retainedSummaryRefs += this.summaryRefs(node);
		work.exactIndexUpdates += 1;
		while (node > 1) {
			node = Math.floor(node / 2);
			this.retainedSummaryRefs -= this.summaryRefs(node);
			const left = node * 2,
				right = left + 1,
				leftCount = this.counts[left]!,
				rightCount = this.counts[right]!;
			this.counts[node] = leftCount + rightCount;
			this.lists[node] = null;
			if (leftCount === 0) {
				this.partitions[node] = this.partitions[right] ?? null;
				this.commonExclusions[node] = this.commonExclusions[right] ?? null;
				this.commonTargetCoverage[node] = this.commonTargetCoverage[right] ?? null;
			} else if (rightCount === 0) {
				this.partitions[node] = this.partitions[left] ?? null;
				this.commonExclusions[node] = this.commonExclusions[left] ?? null;
				this.commonTargetCoverage[node] = this.commonTargetCoverage[left] ?? null;
			} else {
				this.partitions[node] =
					this.partitions[left] !== null && this.partitions[left] === this.partitions[right]
						? (this.partitions[left] ?? null)
						: null;
				this.commonExclusions[node] = identityIntersection(
					this.commonExclusions[left] ?? EMPTY_IDENTITIES,
					this.commonExclusions[right] ?? EMPTY_IDENTITIES,
				);
				this.commonTargetCoverage[node] = this.intersectCoverage(
					this.commonTargetCoverage[left] ?? EMPTY_IDENTITIES,
					this.commonTargetCoverage[right] ?? EMPTY_IDENTITIES,
					work,
				);
			}
			this.retainedSummaryRefs += this.summaryRefs(node);
			work.exactIndexUpdates += 1;
		}
	}

	query(
		eventProfile: CompatibilityProfile,
		eventPartition: string,
		work: SweepWork,
	): Set<ActiveList<T>> {
		const candidates = new Set<ActiveList<T>>();
		const walk = (node: number): void => {
			work.exactQuerySteps += 1;
			if (this.counts[node] === 0) return;
			const partition = this.partitions[node];
			if (partition != null && partitionExcluded(eventProfile, partition, work)) return;
			const common = this.commonExclusions[node];
			if (common && includesIdentity(common, eventPartition, work)) return;
			const commonTargets = this.commonTargetCoverage[node];
			if (this.hierarchy && commonTargets)
				for (const target of commonTargets) {
					work.hierarchyMembershipTests += 1;
					if (this.hierarchy.isAncestor(eventPartition, target)) return;
				}
			if (node >= this.size) {
				const list = this.lists[node]!;
				work.compatibilityQuerySteps += 1;
				candidates.add(list);
				return;
			}
			walk(node * 2);
			walk(node * 2 + 1);
		};
		walk(1);
		return candidates;
	}
}

function mergedRanges(ranges: readonly (readonly [number, number])[]): Array<[number, number]> {
	const ordered = ranges
		.map(([min, max]) => [min, max] as [number, number])
		.toSorted((a, b) => a[0] - b[0] || a[1] - b[1]);
	const merged: Array<[number, number]> = [];
	for (const range of ordered) {
		const previous = merged.at(-1);
		if (!previous || range[0] > previous[1] + 1) merged.push(range);
		else previous[1] = Math.max(previous[1], range[1]);
	}
	return merged;
}

class RangeCount {
	readonly size: number;
	readonly values: number[];
	constructor(size: number) {
		let treeSize = 1;
		while (treeSize < Math.max(1, size)) treeSize *= 2;
		this.size = treeSize;
		this.values = Array.from({ length: treeSize * 2 }, () => 0);
	}
	add(position: number, delta: number): number {
		let steps = 0;
		for (let index = this.size + position; index > 0; index = Math.floor(index / 2)) {
			this.values[index]! += delta;
			steps += 1;
		}
		return steps;
	}
	range(min: number, max: number): { value: number; steps: number } {
		let left = min + this.size,
			right = max + this.size,
			value = 0,
			steps = 0;
		while (left <= right) {
			steps += 1;
			if (left % 2 === 1) value += this.values[left++]!;
			if (right % 2 === 0) value += this.values[right--]!;
			left = Math.floor(left / 2);
			right = Math.floor(right / 2);
		}
		return { value, steps };
	}
	positive(min: number, max: number, visit: (position: number) => void): number {
		let steps = 0;
		const walk = (node: number, nodeMin: number, nodeMax: number): void => {
			steps += 1;
			if (this.values[node] === 0 || nodeMax < min || nodeMin > max) return;
			if (nodeMin === nodeMax) {
				visit(nodeMin);
				return;
			}
			const middle = Math.floor((nodeMin + nodeMax) / 2);
			walk(node * 2, nodeMin, middle);
			walk(node * 2 + 1, middle + 1, nodeMax);
		};
		walk(1, 0, this.size - 1);
		return steps;
	}
}

class RangeMaximum {
	readonly size: number;
	readonly values: number[];
	constructor(length: number) {
		let size = 1;
		while (size < Math.max(1, length)) size *= 2;
		this.size = size;
		this.values = Array.from({ length: size * 2 }, () => 0);
	}
	add(position: number, delta: number): number {
		let index = this.size + position;
		this.values[index]! += delta;
		let steps = 1;
		while (index > 1) {
			index = Math.floor(index / 2);
			this.values[index] = Math.max(this.values[index * 2]!, this.values[index * 2 + 1]!);
			steps += 1;
		}
		return steps;
	}
	max(min: number, max: number): { value: number; steps: number } {
		let left = min + this.size,
			right = max + this.size,
			value = 0,
			steps = 0;
		while (left <= right) {
			steps += 1;
			if (left % 2 === 1) value = Math.max(value, this.values[left++]!);
			if (right % 2 === 0) value = Math.max(value, this.values[right--]!);
			left = Math.floor(left / 2);
			right = Math.floor(right / 2);
		}
		return { value, steps };
	}
}

function emptyWork(): SweepWork {
	return {
		events: 0,
		activeVisits: 0,
		expiryPops: 0,
		partitionChecks: 0,
		bucketScans: 0,
		bucketIndexOperations: 0,
		bucketLookups: 0,
		bucketUpdates: 0,
		bucketDeletes: 0,
		compatibilityIndexUpdates: 0,
		compatibilityProfiles: 0,
		profileSnapshotEntries: 0,
		profileSortComparisons: 0,
		profileTerminalLookups: 0,
		profileCreations: 0,
		profileTrieSteps: 0,
		compatibilityQueries: 0,
		compatibilityQuerySteps: 0,
		exactIndexUpdates: 0,
		exactQuerySteps: 0,
		exactMembershipTests: 0,
		hierarchySummarySteps: 0,
		compatibilityTests: 0,
		hierarchyMembershipTests: 0,
		hierarchyPathQueries: 0,
		hierarchyPathSteps: 0,
		hierarchySubtreeQueries: 0,
		hierarchySubtreeSteps: 0,
		hierarchyIndexUpdateSteps: 0,
		peakRetainedBuckets: 0,
		peakRetainedProfiles: 0,
		peakRetainedProfileTrieNodes: 1,
		peakRetainedHierarchyIndexCells: 0,
		peakRetainedExclusionRefs: 0,
		peakRetainedIndexRefs: 0,
		peakRetainedQueryRefs: 0,
		peakRetainedExactIndexNodes: 0,
		peakRetainedExactSummaryRefs: 0,
		peakRetainedTotalStateRefs: 0,
		peakRetainedSelections: 0,
	};
}

function compareNode<T>(a: ActiveNode<T>, b: ActiveNode<T>): number {
	return a.interval.max - b.interval.max || a.order - b.order;
}

function heapPush<T>(heap: ActiveNode<T>[], node: ActiveNode<T>): void {
	heap.push(node);
	let index = heap.length - 1;
	while (index > 0) {
		const parent = Math.floor((index - 1) / 2);
		if (compareNode(heap[parent]!, node) <= 0) break;
		heap[index] = heap[parent]!;
		index = parent;
	}
	heap[index] = node;
}

function heapPop<T>(heap: ActiveNode<T>[]): ActiveNode<T> | undefined {
	const first = heap[0];
	const last = heap.pop();
	if (!first || !last || heap.length === 0) return first;
	let index = 0;
	while (true) {
		const left = index * 2 + 1;
		if (left >= heap.length) break;
		const right = left + 1;
		const child = right < heap.length && compareNode(heap[right]!, heap[left]!) < 0 ? right : left;
		if (compareNode(last, heap[child]!) <= 0) break;
		heap[index] = heap[child]!;
		index = child;
	}
	heap[index] = last;
	return first;
}

function lookup(work: SweepWork, count = 1): void {
	work.bucketLookups += count;
	work.bucketIndexOperations += count;
}

function update(work: SweepWork, count = 1): void {
	work.bucketUpdates += count;
	work.bucketIndexOperations += count;
}

function deleted(work: SweepWork, count = 1): void {
	work.bucketDeletes += count;
	work.bucketIndexOperations += count;
}

function append<T>(list: ActiveList<T>, node: ActiveNode<T>, work: SweepWork): void {
	const wasEmpty = list.head === null;
	node.previous = list.tail;
	if (list.tail) list.tail.next = node;
	else list.head = node;
	list.tail = node;
	list.index.activeNodes += 1;
	if (wasEmpty) activateList(list, work);
}

function indexRefDelta<T>(list: ActiveList<T>, delta: 1 | -1, work: SweepWork): void {
	const index = list.index;
	for (const exclusion of list.profile.exclusions) {
		lookup(work);
		let lists = index.excludedByPartition.get(exclusion);
		if (delta === 1) {
			if (!lists) {
				lists = new Set();
				index.excludedByPartition.set(exclusion, lists);
				update(work);
			}
			lists.add(list);
			work.compatibilityIndexUpdates += 1;
		} else {
			lists?.delete(list);
			work.compatibilityIndexUpdates += 1;
			if (lists?.size === 0) {
				index.excludedByPartition.delete(exclusion);
				deleted(work);
			}
		}
	}
	index.retainedExclusionRefs +=
		delta * (list.profile.exclusions.length + list.profile.ancestorTargets.length);
	index.retainedIndexRefs +=
		delta * (3 + list.profile.exclusions.length + Math.max(1, list.profile.ancestorTargets.length));
	const hierarchy = index.hierarchy;
	if (!hierarchy) return;
	const position = hierarchy.position(list.partition);
	if (position !== undefined) {
		work.hierarchyIndexUpdateSteps += index.partitionCounts.add(position, delta);
		lookup(work);
		let lists = index.partitionLists.get(position);
		if (delta === 1) {
			if (!lists) {
				lists = new Set();
				index.partitionLists.set(position, lists);
				update(work);
			}
			lists.add(list);
			work.compatibilityIndexUpdates += 1;
		} else {
			lists?.delete(list);
			work.compatibilityIndexUpdates += 1;
			if (lists?.size === 0) {
				index.partitionLists.delete(position);
				deleted(work);
			}
		}
	} else {
		if (delta === 1) index.unpositionedLists.add(list);
		else index.unpositionedLists.delete(list);
		work.compatibilityIndexUpdates += 1;
	}
	for (const target of list.profile.ancestorTargets) {
		const targetPosition = hierarchy.position(target);
		if (targetPosition !== undefined) {
			work.hierarchyIndexUpdateSteps += index.targetCounts.add(targetPosition, delta);
			work.hierarchyIndexUpdateSteps += index.targetPositionCounts.add(targetPosition, delta);
			lookup(work);
			let lists = index.targetLists.get(targetPosition);
			if (delta === 1) {
				if (!lists) {
					lists = new Set();
					index.targetLists.set(targetPosition, lists);
					update(work);
				}
				lists.add(list);
				work.compatibilityIndexUpdates += 1;
			} else {
				lists?.delete(list);
				work.compatibilityIndexUpdates += 1;
				if (lists?.size === 0) {
					index.targetLists.delete(targetPosition);
					deleted(work);
				}
			}
		}
	}
	if (list.profile.ancestorTargets.length === 0) {
		if (delta === 1) index.untargetedLists.add(list);
		else index.untargetedLists.delete(list);
		work.compatibilityIndexUpdates += 1;
	}
}

function activateList<T>(list: ActiveList<T>, work: SweepWork): void {
	list.index.activeLists.add(list);
	update(work);
	list.index.totalBuckets += 1;
	lookup(work);
	list.index.profileCounts.set(list.profile, (list.index.profileCounts.get(list.profile) ?? 0) + 1);
	update(work);
	indexRefDelta(list, 1, work);
	list.index.exact.set(list.exactRank, list, work);
}

function retireEmptyList<T>(list: ActiveList<T>, work: SweepWork): void {
	if (list.head) return;
	lookup(work);
	const profiles = list.index.buckets.get(list.partition)!;
	profiles.delete(list.profile);
	deleted(work);
	if (profiles.size === 0) {
		list.index.buckets.delete(list.partition);
		deleted(work);
	}
	list.index.activeLists.delete(list);
	deleted(work);
	list.index.totalBuckets -= 1;
	lookup(work);
	const profileCount = list.index.profileCounts.get(list.profile)! - 1;
	if (profileCount === 0) {
		list.index.profileCounts.delete(list.profile);
		deleted(work);
	} else {
		list.index.profileCounts.set(list.profile, profileCount);
		update(work);
	}
	indexRefDelta(list, -1, work);
	list.index.exact.set(list.exactRank, null, work);
}

function remove<T>(node: ActiveNode<T>, work: SweepWork): void {
	if (!node.active) return;
	const list = node.list;
	if (node.previous) node.previous.next = node.next;
	else list.head = node.next;
	if (node.next) node.next.previous = node.previous;
	else list.tail = node.previous;
	node.active = false;
	list.index.activeNodes -= 1;
	retireEmptyList(list, work);
}

function bucketFor<T>(
	index: BucketIndex<T>,
	partition: string,
	profile: CompatibilityProfile,
	exactRank: number,
	work: SweepWork,
): ActiveList<T> {
	lookup(work);
	let profiles = index.buckets.get(partition);
	if (!profiles) {
		profiles = new Map();
		index.buckets.set(partition, profiles);
		update(work);
	}
	lookup(work);
	const existing = profiles.get(profile);
	if (existing) return existing;
	const list: ActiveList<T> = {
		partition,
		profile,
		head: null,
		tail: null,
		index,
		exactRank,
	};
	profiles.set(profile, list);
	update(work);
	return list;
}

function canonicalProfile(
	root: ProfileNode,
	semantics: SweepPartition,
	work: SweepWork,
): CompatibilityProfile {
	const profileOrder = (a: string, b: string) => {
		work.profileSortComparisons += 1;
		return compareIdentity(a, b);
	};
	const exclusions = [...semantics.excludedPartitions].toSorted(profileOrder);
	const ancestorTargets = [...new Set(semantics.ancestorTargets ?? [])].toSorted(profileOrder);
	work.profileSnapshotEntries += exclusions.length + ancestorTargets.length;
	let node = root;
	for (const exclusion of exclusions) {
		work.profileTrieSteps += 1;
		let child = node.children.get(exclusion);
		if (!child) {
			child = { children: new Map(), profiles: new Map(), profile: null };
			node.children.set(exclusion, child);
			work.peakRetainedProfileTrieNodes += 1;
		}
		node = child;
	}
	const hierarchyKey = semantics.hierarchy ?? null;
	let hierarchyNode = node.profiles.get(hierarchyKey);
	if (!hierarchyNode) {
		hierarchyNode = { children: new Map(), profiles: new Map(), profile: null };
		node.profiles.set(hierarchyKey, hierarchyNode);
		work.peakRetainedProfileTrieNodes += 1;
	}
	let targetNode = hierarchyNode;
	for (const target of ancestorTargets) {
		work.profileTrieSteps += 1;
		let child = targetNode.children.get(target);
		if (!child) {
			child = { children: new Map(), profiles: new Map(), profile: null };
			targetNode.children.set(target, child);
			work.peakRetainedProfileTrieNodes += 1;
		}
		targetNode = child;
	}
	work.profileTerminalLookups += 1;
	if (!targetNode.profile) {
		targetNode.profile = {
			exclusions,
			excluded: new Set(exclusions),
			ancestorTargets,
			hierarchy: semantics.hierarchy,
		};
		work.compatibilityProfiles += 1;
		work.profileCreations += 1;
	}
	return targetNode.profile;
}

function partitionExcluded(
	profile: CompatibilityProfile,
	partition: string,
	work?: SweepWork,
): boolean {
	if (work) work.exactMembershipTests += 1;
	if (profile.excluded.has(partition)) return true;
	if (!profile.hierarchy) return false;
	for (const target of profile.ancestorTargets) {
		if (work) work.hierarchyMembershipTests += 1;
		if (profile.hierarchy.isAncestor(partition, target)) return true;
	}
	return false;
}

function hierarchyEventExcludesAll<T>(
	index: BucketIndex<T>,
	profile: CompatibilityProfile,
	work: SweepWork,
): boolean {
	if (!index.hierarchy || profile.hierarchy !== index.hierarchy) return false;
	for (const target of profile.ancestorTargets) {
		work.hierarchyPathQueries += 1;
		let count = 0;
		for (const [min, max] of index.hierarchy.pathToRoot(target)) {
			const measured = index.partitionCounts.range(min, max);
			count += measured.value;
			work.hierarchyPathSteps += measured.steps + 1;
		}
		// This is deliberately per target: summing different target paths can count
		// one bucket twice and incorrectly suppress an eligible pair.
		if (count >= index.totalBuckets) return true;
	}
	return false;
}

function pairAllowed(
	event: CompatibilityProfile,
	eventPartition: string,
	active: ActiveList<unknown>,
	work: SweepWork,
): boolean {
	return (
		!partitionExcluded(event, active.partition, work) &&
		!partitionExcluded(active.profile, eventPartition, work)
	);
}

function hierarchyCandidates<T>(
	index: BucketIndex<T>,
	profile: CompatibilityProfile,
	work: SweepWork,
): Set<ActiveList<T>> | null {
	const hierarchy = index.hierarchy;
	if (!hierarchy || profile.hierarchy !== hierarchy || profile.ancestorTargets.length === 0)
		return null;
	const ranges: Array<readonly [number, number]> = [];
	for (const target of profile.ancestorTargets) {
		work.hierarchyPathQueries += 1;
		const path = hierarchy.pathToRoot(target);
		work.hierarchyPathSteps += path.length;
		ranges.push(...path);
	}
	for (const exclusion of profile.exclusions) {
		const position = hierarchy.position(exclusion);
		if (position !== undefined) ranges.push([position, position]);
	}
	const excluded = mergedRanges(ranges);
	const candidates = new Set<ActiveList<T>>();
	let cursor = 0;
	const collect = (min: number, max: number) => {
		if (min > max) return;
		work.hierarchySubtreeQueries += 1;
		work.hierarchySubtreeSteps += index.partitionCounts.positive(min, max, (position) => {
			lookup(work);
			const lists = index.partitionLists.get(position)!;
			for (const list of lists) {
				work.compatibilityQuerySteps += 1;
				candidates.add(list);
			}
		});
	};
	for (const [min, max] of excluded) {
		collect(cursor, min - 1);
		cursor = Math.max(cursor, max + 1);
	}
	collect(cursor, hierarchy.size - 1);
	// Partitions outside the hierarchy cannot be excluded by ancestor paths.
	for (const list of index.unpositionedLists) {
		work.compatibilityQuerySteps += 1;
		candidates.add(list);
	}
	return candidates;
}

/** Enumerate every semantically permitted closed x-overlap once in stable start-event order. */
export function sweepIntervalPairs<A, B>(
	left: readonly SweepInterval<A>[],
	right: readonly SweepInterval<B>[],
	sameSet: boolean,
	visit: (left: SweepInterval<A>, right: SweepInterval<B>) => boolean | void,
): SweepWork {
	type Value = A | B;
	const work = emptyWork();
	const profileRoot: ProfileNode = { children: new Map(), profiles: new Map(), profile: null };
	const events: Array<{
		interval: SweepInterval<Value>;
		set: 0 | 1;
		ordinal: number;
		profile: CompatibilityProfile;
	}> = [];
	let retainedCanonicalProfileRefs = 0;
	const addEvent = (interval: SweepInterval<Value>, set: 0 | 1, ordinal: number) =>
		events.push({
			interval,
			set,
			ordinal,
			profile: canonicalProfile(profileRoot, interval.semantics, work),
		});
	left.forEach((interval, ordinal) => addEvent(interval, 0, ordinal));
	if (!sameSet) right.forEach((interval, ordinal) => addEvent(interval, 1, ordinal));
	const retainedProfiles = new Set<CompatibilityProfile>();
	for (const event of events) {
		if (retainedProfiles.has(event.profile)) continue;
		retainedProfiles.add(event.profile);
		// Arrays and the exact Set retain their entries separately.
		retainedCanonicalProfileRefs +=
			1 + event.profile.exclusions.length * 2 + event.profile.ancestorTargets.length;
	}
	events.sort(
		(a, b) =>
			a.interval.min - b.interval.min ||
			a.interval.max - b.interval.max ||
			a.set - b.set ||
			compareIdentity(a.interval.id, b.interval.id) ||
			compareIdentityLists(a.profile.exclusions, b.profile.exclusions) ||
			compareIdentityLists(a.profile.ancestorTargets, b.profile.ancestorTargets) ||
			a.ordinal - b.ordinal,
	);
	const hierarchy = events.find((event) => event.profile.hierarchy)?.profile.hierarchy;
	const rankSpecs: Array<{ partition: string; profile: CompatibilityProfile }> = [];
	const seenRanks = new Map<string, Set<CompatibilityProfile>>();
	for (const event of events) {
		const partition = event.interval.semantics.partition;
		let profiles = seenRanks.get(partition);
		if (!profiles) {
			profiles = new Set();
			seenRanks.set(partition, profiles);
		}
		if (!profiles.has(event.profile)) {
			profiles.add(event.profile);
			rankSpecs.push({ partition, profile: event.profile });
		}
	}
	// Events are already in the public stable enumeration order. Ranking buckets by
	// first occurrence lets an in-order index query preserve that order without a
	// per-query sort.
	const ranks = new Map<string, Map<CompatibilityProfile, number>>();
	for (const [rank, spec] of rankSpecs.entries()) {
		let profiles = ranks.get(spec.partition);
		if (!profiles) {
			profiles = new Map();
			ranks.set(spec.partition, profiles);
		}
		profiles.set(spec.profile, rank);
	}
	const makeIndex = (): BucketIndex<Value> => ({
		buckets: new Map(),
		activeLists: new Set(),
		profileCounts: new Map(),
		excludedByPartition: new Map(),
		hierarchy,
		partitionCounts: new RangeCount(hierarchy?.size ?? 0),
		targetCounts: new RangeMaximum(hierarchy?.size ?? 0),
		targetPositionCounts: new RangeCount(hierarchy?.size ?? 0),
		partitionLists: new Map(),
		targetLists: new Map(),
		unpositionedLists: new Set(),
		untargetedLists: new Set(),
		exact: new ExactCompatibilityIndex(rankSpecs.length, hierarchy),
		totalBuckets: 0,
		retainedExclusionRefs: 0,
		retainedIndexRefs: 0,
		activeNodes: 0,
	});
	const indexes: [BucketIndex<Value>, BucketIndex<Value>] = [makeIndex(), makeIndex()];
	work.peakRetainedHierarchyIndexCells = indexes.reduce(
		(total, index) =>
			total +
			index.partitionCounts.values.length +
			index.targetCounts.values.length +
			index.targetPositionCounts.values.length,
		0,
	);
	const heap: ActiveNode<Value>[] = [];
	const sampleRetainedState = (queryRefs: number): void => {
		const buckets = indexes[0].totalBuckets + indexes[1].totalBuckets;
		const exclusionRefs = indexes[0].retainedExclusionRefs + indexes[1].retainedExclusionRefs;
		const indexRefs = indexes[0].retainedIndexRefs + indexes[1].retainedIndexRefs;
		const profiles = indexes[0].profileCounts.size + indexes[1].profileCounts.size;
		const hierarchyCells = indexes.reduce(
			(total, index) =>
				total +
				index.partitionCounts.values.length +
				index.targetCounts.values.length +
				index.targetPositionCounts.values.length,
			0,
		);
		const exactNodes = indexes.reduce((total, index) => total + index.exact.counts.length, 0);
		const exactSummaryRefs = indexes.reduce(
			(total, index) => total + index.exact.retainedSummaryRefs,
			0,
		);
		const activeState = indexes.reduce(
			(total, index) =>
				total +
				index.activeNodes +
				index.totalBuckets +
				index.profileCounts.size +
				index.retainedIndexRefs,
			0,
		);
		work.peakRetainedBuckets = Math.max(work.peakRetainedBuckets, buckets);
		work.peakRetainedExclusionRefs = Math.max(work.peakRetainedExclusionRefs, exclusionRefs);
		work.peakRetainedIndexRefs = Math.max(work.peakRetainedIndexRefs, indexRefs);
		work.peakRetainedProfiles = Math.max(work.peakRetainedProfiles, profiles);
		work.peakRetainedQueryRefs = Math.max(work.peakRetainedQueryRefs, queryRefs);
		work.peakRetainedExactIndexNodes = Math.max(work.peakRetainedExactIndexNodes, exactNodes);
		work.peakRetainedExactSummaryRefs = Math.max(
			work.peakRetainedExactSummaryRefs,
			exactSummaryRefs,
		);
		work.peakRetainedTotalStateRefs = Math.max(
			work.peakRetainedTotalStateRefs,
			events.length * 2 +
				work.peakRetainedProfileTrieNodes +
				retainedCanonicalProfileRefs +
				hierarchyCells +
				exactNodes * 4 +
				exactSummaryRefs +
				activeState +
				queryRefs,
		);
	};
	for (let order = 0; order < events.length; order += 1) {
		const event = events[order]!;
		work.events += 1;
		while (heap[0] && heap[0].interval.max < event.interval.min) {
			remove(heapPop(heap)!, work);
			work.expiryPops += 1;
		}
		const opposite = sameSet ? indexes[0] : indexes[event.set === 0 ? 1 : 0];
		work.compatibilityQueries += 1;
		if (opposite.totalBuckets > 0 && !hierarchyEventExcludesAll(opposite, event.profile, work)) {
			const eventCandidates = hierarchyCandidates(opposite, event.profile, work);
			let activeHierarchyExclusions = false;
			const subtree = opposite.hierarchy?.subtree(event.interval.semantics.partition);
			if (subtree) {
				work.hierarchySubtreeQueries += 1;
				const measured = opposite.targetPositionCounts.range(subtree[0], subtree[1]);
				work.hierarchySubtreeSteps += measured.steps;
				activeHierarchyExclusions = measured.value > 0;
			}
			lookup(work);
			const needsExactQuery =
				event.profile.exclusions.length > 0 ||
				(opposite.excludedByPartition.get(event.interval.semantics.partition)?.size ?? 0) > 0 ||
				activeHierarchyExclusions;
			const activeCandidates = needsExactQuery
				? opposite.exact.query(event.profile, event.interval.semantics.partition, work)
				: null;
			let intersection: Set<ActiveList<Value>> | null = null;
			if (eventCandidates && activeCandidates) {
				intersection = new Set();
				const [smaller, larger] =
					eventCandidates.size <= activeCandidates.size
						? [eventCandidates, activeCandidates]
						: [activeCandidates, eventCandidates];
				for (const candidate of smaller) {
					work.compatibilityQuerySteps += 1;
					if (larger.has(candidate)) intersection.add(candidate);
				}
			}
			const currentQueryRefs =
				(eventCandidates?.size ?? 0) + (activeCandidates?.size ?? 0) + (intersection?.size ?? 0);
			sampleRetainedState(currentQueryRefs);
			const candidates =
				intersection ?? eventCandidates ?? activeCandidates ?? opposite.activeLists;
			for (const list of candidates) {
				work.bucketScans += 1;
				work.partitionChecks += 1;
				work.compatibilityTests += 1;
				if (!pairAllowed(event.profile, event.interval.semantics.partition, list, work))
					throw new Error("compatibility index admitted an excluded interval bucket");
				for (let active: ActiveNode<Value> | null = list.head; active; active = active.next) {
					work.activeVisits += 1;
					const shouldContinue =
						event.set === 0
							? visit(event.interval as SweepInterval<A>, active.interval as SweepInterval<B>)
							: visit(active.interval as SweepInterval<A>, event.interval as SweepInterval<B>);
					if (shouldContinue === false) {
						sampleRetainedState(currentQueryRefs);
						return work;
					}
				}
			}
		}
		const list = bucketFor(
			indexes[event.set],
			event.interval.semantics.partition,
			event.profile,
			ranks.get(event.interval.semantics.partition)!.get(event.profile)!,
			work,
		);
		const node: ActiveNode<Value> = {
			interval: event.interval,
			order,
			active: true,
			previous: null,
			next: null,
			list,
		};
		append(list, node, work);
		heapPush(heap, node);
		sampleRetainedState(0);
	}
	return work;
}
