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
}

export interface SweepWork {
	events: number;
	activeVisits: number;
	expiryPops: number;
	partitionChecks: number;
	bucketScans: number;
	bucketIndexOperations: number;
	compatibilityProfiles: number;
}

interface CompatibilityProfile {
	exclusions: readonly string[];
	excluded: ReadonlySet<string>;
}

interface ActiveNode<T> {
	interval: SweepInterval<T>;
	set: 0 | 1;
	order: number;
	active: boolean;
	previous: ActiveNode<T> | null;
	next: ActiveNode<T> | null;
	list: ActiveList<T>;
}

interface ActiveList<T> {
	semantics: SweepPartition;
	head: ActiveNode<T> | null;
	tail: ActiveNode<T> | null;
	index: BucketIndex<T>;
	partition: string;
	profile: CompatibilityProfile;
	group: ProfileGroup<T>;
}

interface ProfileGroup<T> {
	profile: CompatibilityProfile;
	buckets: Map<string, ActiveList<T>>;
	compatible: Map<CompatibilityProfile, Set<ActiveList<T>>>;
}

interface BucketIndex<T> {
	groups: Map<CompatibilityProfile, ProfileGroup<T>>;
}

interface ProfileNode {
	children: Map<string, ProfileNode>;
	profile: CompatibilityProfile | null;
}

interface ProfileIndex {
	root: ProfileNode;
	count: number;
	bySet: Map<ReadonlySet<string>, CompatibilityProfile>;
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

function append<T>(list: ActiveList<T>, node: ActiveNode<T>): void {
	node.previous = list.tail;
	if (list.tail) list.tail.next = node;
	else list.head = node;
	list.tail = node;
}

function retireEmptyList<T>(list: ActiveList<T>, work: SweepWork): void {
	if (list.head) return;
	list.group.buckets.delete(list.partition);
	for (const compatible of list.group.compatible.values()) {
		compatible.delete(list);
		work.bucketIndexOperations += 1;
	}
	if (list.group.buckets.size === 0) list.index.groups.delete(list.profile);
	work.bucketIndexOperations += 1;
}

function remove<T>(node: ActiveNode<T>, work: SweepWork): void {
	if (!node.active) return;
	const list = node.list;
	if (node.previous) node.previous.next = node.next;
	else list.head = node.next;
	if (node.next) node.next.previous = node.previous;
	else list.tail = node.previous;
	node.active = false;
	retireEmptyList(list, work);
}

function bucketFor<T>(
	index: BucketIndex<T>,
	semantics: SweepPartition,
	profile: CompatibilityProfile,
	work: SweepWork,
): ActiveList<T> {
	work.bucketIndexOperations += 1;
	let group = index.groups.get(profile);
	if (!group) {
		group = { profile, buckets: new Map(), compatible: new Map() };
		index.groups.set(profile, group);
		work.bucketIndexOperations += 1;
	}
	const existing = group.buckets.get(semantics.partition);
	if (existing) return existing;
	const list: ActiveList<T> = {
		semantics,
		head: null,
		tail: null,
		index,
		partition: semantics.partition,
		profile,
		group,
	};
	group.buckets.set(list.partition, list);
	for (const [eventProfile, compatible] of group.compatible) {
		if (!eventProfile.excluded.has(list.partition)) compatible.add(list);
		work.bucketIndexOperations += 1;
	}
	work.bucketIndexOperations += 1;
	return list;
}

function canonicalProfile(index: ProfileIndex, semantics: SweepPartition): CompatibilityProfile {
	const reused = index.bySet.get(semantics.excludedPartitions);
	if (reused) return reused;
	const exclusions = [...semantics.excludedPartitions].toSorted(compareIdentity);
	let node = index.root;
	for (const exclusion of exclusions) {
		let child = node.children.get(exclusion);
		if (!child) {
			child = { children: new Map(), profile: null };
			node.children.set(exclusion, child);
		}
		node = child;
	}
	if (!node.profile) {
		node.profile = { exclusions, excluded: new Set(exclusions) };
		index.count += 1;
	}
	index.bySet.set(semantics.excludedPartitions, node.profile);
	return node.profile;
}

function compatibleBuckets<T>(
	group: ProfileGroup<T>,
	eventProfile: CompatibilityProfile,
	work: SweepWork,
): ReadonlySet<ActiveList<T>> {
	const cached = group.compatible.get(eventProfile);
	if (cached) return cached;
	const buckets = new Set<ActiveList<T>>();
	for (const [partition, bucket] of group.buckets) {
		work.bucketIndexOperations += 1;
		if (!eventProfile.excluded.has(partition)) buckets.add(bucket);
	}
	group.compatible.set(eventProfile, buckets);
	work.bucketIndexOperations += 1;
	return buckets;
}

/** Enumerate every semantically permitted closed x-overlap once in deterministic start-event order. */
export function sweepIntervalPairs<A, B>(
	left: readonly SweepInterval<A>[],
	right: readonly SweepInterval<B>[],
	sameSet: boolean,
	visit: (left: SweepInterval<A>, right: SweepInterval<B>) => boolean | void,
): SweepWork {
	type Value = A | B;
	const profileIndex: ProfileIndex = {
		root: { children: new Map(), profile: null },
		count: 0,
		bySet: new Map(),
	};
	const events: Array<{
		interval: SweepInterval<Value>;
		set: 0 | 1;
		ordinal: number;
		profile: CompatibilityProfile;
	}> = [];
	left.forEach((interval, ordinal) =>
		events.push({
			interval,
			set: 0,
			ordinal,
			profile: canonicalProfile(profileIndex, interval.semantics),
		}),
	);
	if (!sameSet)
		right.forEach((interval, ordinal) =>
			events.push({
				interval,
				set: 1,
				ordinal,
				profile: canonicalProfile(profileIndex, interval.semantics),
			}),
		);
	events.sort(
		(a, b) =>
			a.interval.min - b.interval.min ||
			a.interval.max - b.interval.max ||
			a.set - b.set ||
			compareIdentity(a.interval.id, b.interval.id) ||
			a.ordinal - b.ordinal,
	);
	const buckets: [BucketIndex<Value>, BucketIndex<Value>] = [
		{ groups: new Map() },
		{ groups: new Map() },
	];
	const heap: ActiveNode<Value>[] = [];
	const work: SweepWork = {
		events: 0,
		activeVisits: 0,
		expiryPops: 0,
		partitionChecks: 0,
		bucketScans: 0,
		bucketIndexOperations: 0,
		compatibilityProfiles: profileIndex.count,
	};
	for (let order = 0; order < events.length; order += 1) {
		const event = events[order]!;
		work.events += 1;
		while (heap[0] && heap[0].interval.max < event.interval.min) {
			const expired = heapPop(heap)!;
			work.expiryPops += 1;
			remove(expired, work);
		}
		const opposite = sameSet ? buckets[0] : buckets[event.set === 0 ? 1 : 0];
		for (const group of opposite.groups.values()) {
			work.bucketScans += 1;
			work.partitionChecks += 1;
			if (group.profile.excluded.has(event.interval.semantics.partition)) continue;
			for (const bucket of compatibleBuckets(group, event.profile, work)) {
				work.bucketScans += 1;
				for (let active: ActiveNode<Value> | null = bucket.head; active; active = active.next) {
					work.activeVisits += 1;
					const shouldContinue =
						event.set === 0
							? visit(event.interval as SweepInterval<A>, active.interval as SweepInterval<B>)
							: visit(active.interval as SweepInterval<A>, event.interval as SweepInterval<B>);
					if (shouldContinue === false) return work;
				}
			}
		}
		const list = bucketFor(buckets[event.set], event.interval.semantics, event.profile, work);
		const node: ActiveNode<Value> = {
			interval: event.interval,
			set: event.set,
			order,
			active: true,
			previous: null,
			next: null,
			list,
		};
		append(list, node);
		heapPush(heap, node);
	}
	return work;
}
