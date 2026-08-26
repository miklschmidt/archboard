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

function remove<T>(node: ActiveNode<T>): void {
	if (!node.active) return;
	const list = node.list;
	if (node.previous) node.previous.next = node.next;
	else list.head = node.next;
	if (node.next) node.next.previous = node.previous;
	else list.tail = node.previous;
	node.active = false;
}

function pairAllowed(a: SweepPartition, b: SweepPartition): boolean {
	return !a.excludedPartitions.has(b.partition) && !b.excludedPartitions.has(a.partition);
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
	const buckets: [Map<string, ActiveList<Value>>, Map<string, ActiveList<Value>>] = [
		new Map(),
		new Map(),
	];
	const heap: ActiveNode<Value>[] = [];
	const partitionKeys = new Map<SweepPartition, string>();
	const partitionKey = (value: SweepPartition) => {
		const existing = partitionKeys.get(value);
		if (existing) return existing;
		const key = `${value.partition}\0${[...value.excludedPartitions].toSorted().join("\0")}`;
		partitionKeys.set(value, key);
		return key;
	};
	const work: SweepWork = {
		events: 0,
		activeVisits: 0,
		expiryPops: 0,
		partitionChecks: 0,
	};
	for (let order = 0; order < events.length; order += 1) {
		const event = events[order]!;
		work.events += 1;
		while (heap[0] && heap[0].interval.max < event.interval.min) {
			const expired = heapPop(heap)!;
			work.expiryPops += 1;
			remove(expired);
		}
		const opposite = sameSet ? buckets[0] : buckets[event.set === 0 ? 1 : 0];
		for (const bucket of opposite.values()) {
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
		const key = partitionKey(event.interval.semantics);
		const list = buckets[event.set].get(key) ?? {
			semantics: event.interval.semantics,
			head: null,
			tail: null,
		};
		buckets[event.set].set(key, list);
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
