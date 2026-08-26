export interface SweepInterval<T> {
	id: string;
	min: number;
	max: number;
	value: T;
}

export interface SweepWork {
	events: number;
	activeVisits: number;
	expiryPops: number;
}

interface ActiveNode<T> {
	interval: SweepInterval<T>;
	set: 0 | 1;
	order: number;
	active: boolean;
	previous: ActiveNode<T> | null;
	next: ActiveNode<T> | null;
}

interface ActiveList<T> {
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

function remove<T>(lists: [ActiveList<T>, ActiveList<T>], node: ActiveNode<T>): void {
	if (!node.active) return;
	const list = lists[node.set];
	if (node.previous) node.previous.next = node.next;
	else list.head = node.next;
	if (node.next) node.next.previous = node.previous;
	else list.tail = node.previous;
	node.active = false;
}

/** Enumerate every closed x-interval overlap once in deterministic start-event order. */
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
	const lists: [ActiveList<Value>, ActiveList<Value>] = [
		{ head: null, tail: null },
		{ head: null, tail: null },
	];
	const heap: ActiveNode<Value>[] = [];
	const work: SweepWork = { events: 0, activeVisits: 0, expiryPops: 0 };
	for (let order = 0; order < events.length; order += 1) {
		const event = events[order]!;
		work.events += 1;
		while (heap[0] && heap[0].interval.max < event.interval.min) {
			const expired = heapPop(heap)!;
			work.expiryPops += 1;
			remove(lists, expired);
		}
		const opposite = sameSet ? lists[0] : lists[event.set === 0 ? 1 : 0];
		for (let active = opposite.head; active; active = active.next) {
			work.activeVisits += 1;
			const shouldContinue =
				event.set === 0
					? visit(event.interval as SweepInterval<A>, active.interval as SweepInterval<B>)
					: visit(active.interval as SweepInterval<A>, event.interval as SweepInterval<B>);
			if (shouldContinue === false) return work;
		}
		const node: ActiveNode<Value> = {
			interval: event.interval,
			set: event.set,
			order,
			active: true,
			previous: null,
			next: null,
		};
		append(lists[event.set], node);
		heapPush(heap, node);
	}
	return work;
}
