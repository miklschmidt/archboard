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
	exclusions: readonly string[];
	path: readonly BucketNode<T>[];
}

interface BucketNode<T> {
	children: Map<string, BucketNode<T>>;
	list: ActiveList<T> | null;
}

interface BucketIndex<T> {
	roots: Map<string, BucketNode<T>>;
	active: Set<ActiveList<T>>;
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
	list.index.active.delete(list);
	work.bucketIndexOperations += 1;
	const leaf = list.path.at(-1)!;
	leaf.list = null;
	for (let index = list.path.length - 1; index > 0; index -= 1) {
		const child = list.path[index]!;
		if (child.list || child.children.size > 0) break;
		list.path[index - 1]!.children.delete(list.exclusions[index - 1]!);
		work.bucketIndexOperations += 1;
	}
	const root = list.path[0]!;
	if (!root.list && root.children.size === 0) {
		list.index.roots.delete(list.partition);
		work.bucketIndexOperations += 1;
	}
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

function pairAllowed(a: SweepPartition, b: SweepPartition): boolean {
	return !a.excludedPartitions.has(b.partition) && !b.excludedPartitions.has(a.partition);
}

function bucketFor<T>(
	index: BucketIndex<T>,
	semantics: SweepPartition,
	exclusions: readonly string[],
	work: SweepWork,
): ActiveList<T> {
	work.bucketIndexOperations += 1;
	let root = index.roots.get(semantics.partition);
	if (!root) {
		root = { children: new Map(), list: null };
		index.roots.set(semantics.partition, root);
		work.bucketIndexOperations += 1;
	}
	const path = [root];
	let node = root;
	for (const exclusion of exclusions) {
		work.bucketIndexOperations += 1;
		let child = node.children.get(exclusion);
		if (!child) {
			child = { children: new Map(), list: null };
			node.children.set(exclusion, child);
			work.bucketIndexOperations += 1;
		}
		node = child;
		path.push(node);
	}
	if (node.list) return node.list;
	const list: ActiveList<T> = {
		semantics,
		head: null,
		tail: null,
		index,
		partition: semantics.partition,
		exclusions,
		path,
	};
	node.list = list;
	index.active.add(list);
	work.bucketIndexOperations += 1;
	return list;
}

/** Enumerate every semantically permitted closed x-overlap once in deterministic start-event order. */
export function sweepIntervalPairs<A, B>(
	left: readonly SweepInterval<A>[],
	right: readonly SweepInterval<B>[],
	sameSet: boolean,
	visit: (left: SweepInterval<A>, right: SweepInterval<B>) => boolean | void,
): SweepWork {
	type Value = A | B;
	const events: Array<{ interval: SweepInterval<Value>; set: 0 | 1; ordinal: number }> = [];
	left.forEach((interval, ordinal) => events.push({ interval, set: 0, ordinal }));
	if (!sameSet) right.forEach((interval, ordinal) => events.push({ interval, set: 1, ordinal }));
	events.sort(
		(a, b) =>
			a.interval.min - b.interval.min ||
			a.interval.max - b.interval.max ||
			a.set - b.set ||
			a.interval.id.localeCompare(b.interval.id) ||
			a.ordinal - b.ordinal,
	);
	const buckets: [BucketIndex<Value>, BucketIndex<Value>] = [
		{ roots: new Map(), active: new Set() },
		{ roots: new Map(), active: new Set() },
	];
	const heap: ActiveNode<Value>[] = [];
	const exclusionsBySemantics = new Map<SweepPartition, readonly string[]>();
	const sortedExclusions = (value: SweepPartition) => {
		const existing = exclusionsBySemantics.get(value);
		if (existing) return existing;
		const exclusions = [...value.excludedPartitions].toSorted();
		exclusionsBySemantics.set(value, exclusions);
		return exclusions;
	};
	const work: SweepWork = {
		events: 0,
		activeVisits: 0,
		expiryPops: 0,
		partitionChecks: 0,
		bucketScans: 0,
		bucketIndexOperations: 0,
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
		for (const bucket of opposite.active) {
			work.bucketScans += 1;
			if (!bucket.head) continue;
			work.partitionChecks += 1;
			if (!pairAllowed(event.interval.semantics, bucket.semantics)) continue;
			for (let active: ActiveNode<Value> | null = bucket.head; active; active = active.next) {
				work.activeVisits += 1;
				const shouldContinue =
					event.set === 0
						? visit(event.interval as SweepInterval<A>, active.interval as SweepInterval<B>)
						: visit(active.interval as SweepInterval<A>, event.interval as SweepInterval<B>);
				if (shouldContinue === false) return work;
			}
		}
		const list = bucketFor(
			buckets[event.set],
			event.interval.semantics,
			sortedExclusions(event.interval.semantics),
			work,
		);
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
