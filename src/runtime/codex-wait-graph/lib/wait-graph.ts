import type {
	ChildId,
	DynamicToolCallId,
	ThreadId,
	TurnId,
} from "@/shared/codex-workbench-identity";

interface WaitOwner {
	readonly child: ChildId;
	readonly caller: ThreadId;
	readonly turn: TurnId;
	readonly call: DynamicToolCallId;
}

interface WaitEdgeSetInput {
	readonly owner: WaitOwner;
	readonly targets: readonly ThreadId[];
}

interface WaitEdge {
	readonly owner: WaitOwner;
	readonly target: ThreadId;
}

type OwnedWaitCleanupCause = "settle" | "decline" | "cancellation" | "interruption" | "disconnect";

type WaitCleanup =
	| {
			readonly cause: OwnedWaitCleanupCause;
			readonly owner: WaitOwner;
	  }
	| {
			readonly cause: "child-exit";
			readonly child: ChildId;
	  };

type WaitEdgeSetResult =
	| {
			readonly ok: true;
			readonly edges: readonly WaitEdge[];
	  }
	| {
			readonly ok: false;
			readonly reason: "cycle";
			/** A closed path: the first thread is repeated at the end. */
			readonly child: ChildId;
			readonly cycle: readonly ThreadId[];
	  };

interface CodexWaitGraph {
	/** Add or atomically replace one dynamic operation's outgoing edges. */
	readonly addEdgeSet: (input: WaitEdgeSetInput) => WaitEdgeSetResult;
	/** Remove the exact owner, or every owner belonging to one exited child. */
	readonly release: (cleanup: WaitCleanup) => readonly WaitEdge[];
	/** Return all active edges in deterministic order. */
	readonly inspect: () => readonly WaitEdge[];
}

interface Registration {
	readonly key: string;
	readonly owner: WaitOwner;
	readonly targets: readonly ThreadId[];
}

interface GraphNode {
	readonly child: ChildId;
	readonly thread: ThreadId;
}

type VisitState = "visiting" | "visited";

/**
 * Order two strings by code unit so every listing the graph produces is deterministic.
 * @param left - The first string.
 * @param right - The second string.
 * @returns A negative, zero or positive comparison result.
 */
function compareText(left: string, right: string): number {
	return left < right ? -1 : left > right ? 1 : 0;
}

/**
 * Build the map key that identifies one dynamic operation's edge set.
 * @param owner - The child, calling thread, turn and call that own the edges.
 * @returns A stable string key unique to that owner.
 */
function ownerKey(owner: WaitOwner): string {
	return JSON.stringify([owner.child, owner.caller, owner.turn, owner.call]);
}

/**
 * Build the graph vertex key for one thread as seen from one child; threads of different children
 * never share a vertex, so waits cannot cycle across children.
 * @param child - The child whose thread this is.
 * @param thread - The thread.
 * @returns A stable string key unique to that vertex.
 */
function vertexKey(child: ChildId, thread: ThreadId): string {
	return JSON.stringify([child, thread]);
}

/**
 * Copy an owner into a frozen record so the graph never keeps a reference the caller can mutate.
 * @param owner - The owner to copy.
 * @returns A frozen copy carrying the same identity.
 */
function copyOwner(owner: WaitOwner): WaitOwner {
	return Object.freeze({
		child: owner.child,
		caller: owner.caller,
		turn: owner.turn,
		call: owner.call,
	});
}

/**
 * Deduplicate and sort target threads so an edge set has one canonical form.
 * @param targets - The threads the owner waits on, in any order and possibly repeated.
 * @returns The unique targets in sorted order.
 */
function canonicalTargets(targets: readonly ThreadId[]): readonly ThreadId[] {
	return Object.freeze([...new Set(targets)].toSorted(compareText));
}

/**
 * Turn caller input into the frozen registration the graph stores.
 * @param input - The owner and the targets it waits on.
 * @returns The registration keyed by owner with canonical targets.
 */
function registrationFor(input: WaitEdgeSetInput): Registration {
	const owner = copyOwner(input.owner);
	return Object.freeze({
		key: ownerKey(owner),
		owner,
		targets: canonicalTargets(input.targets),
	});
}

/**
 * Build one edge from a registration to a target thread.
 * @param registration - The owner's registration.
 * @param target - The thread waited on.
 * @returns A frozen edge.
 */
function edgeFor(registration: Registration, target: ThreadId): WaitEdge {
	return Object.freeze({ owner: registration.owner, target });
}

/**
 * Expand a registration into one edge per target.
 * @param registration - The owner's registration.
 * @returns The frozen edges in canonical target order.
 */
function edgesFor(registration: Registration): readonly WaitEdge[] {
	return Object.freeze(registration.targets.map((target) => edgeFor(registration, target)));
}

/**
 * Order edges by owner and then by target.
 * @param left - The first edge.
 * @param right - The second edge.
 * @returns A negative, zero or positive comparison result.
 */
function compareEdges(left: WaitEdge, right: WaitEdge): number {
	const ownerComparison = compareText(ownerKey(left.owner), ownerKey(right.owner));
	return ownerComparison !== 0 ? ownerComparison : compareText(left.target, right.target);
}

/**
 * Flatten registrations into one sorted, frozen edge list.
 * @param registrations - The registrations to list.
 * @returns Every edge of every registration in deterministic order.
 */
function sortedEdges(registrations: Iterable<Registration>): readonly WaitEdge[] {
	return Object.freeze(
		[...registrations].flatMap((registration) => edgesFor(registration)).toSorted(compareEdges),
	);
}

/**
 * Ensure a vertex exists for a thread in a child's graph and return its key.
 * @param child - The child whose thread this is.
 * @param thread - The thread.
 * @param nodes - The vertex map being built.
 * @param adjacency - The adjacency map being built.
 * @returns The vertex key.
 */
function addNode(
	child: ChildId,
	thread: ThreadId,
	nodes: Map<string, GraphNode>,
	adjacency: Map<string, Set<string>>,
): string {
	const key = vertexKey(child, thread);
	if (!nodes.has(key)) {
		nodes.set(key, { child, thread });
		adjacency.set(key, new Set());
	}
	return key;
}

/**
 * Build the directed graph of "caller waits on target" edges from a set of registrations.
 * @param registrations - The registrations to graph.
 * @returns The vertex map and adjacency sets.
 */
function graphOf(registrations: Iterable<Registration>): {
	readonly nodes: Map<string, GraphNode>;
	readonly adjacency: Map<string, Set<string>>;
} {
	const nodes = new Map<string, GraphNode>();
	const adjacency = new Map<string, Set<string>>();
	for (const registration of registrations) {
		const source = addNode(registration.owner.child, registration.owner.caller, nodes, adjacency);
		for (const target of registration.targets) {
			const destination = addNode(registration.owner.child, target, nodes, adjacency);
			adjacency.get(source)!.add(destination);
		}
	}
	return { nodes, adjacency };
}

/**
 * Close the cycle that a back edge to a vertex still on the traversal stack has just revealed.
 * @param target - The vertex the back edge points at.
 * @param stack - The vertices on the current traversal path, in order.
 * @param stackIndex - Each stacked vertex's position in that path.
 * @param nodes - The vertex map.
 * @returns The closed path from the target back to itself.
 */
function cycleClosedAt(
	target: string,
	stack: readonly string[],
	stackIndex: ReadonlyMap<string, number>,
	nodes: ReadonlyMap<string, GraphNode>,
): readonly GraphNode[] {
	const start = stackIndex.get(target);
	if (start === undefined) {
		throw new Error("Wait graph traversal lost its stack index.");
	}
	return [...stack.slice(start), target].map((nodeKey) => nodes.get(nodeKey)!);
}

/**
 * Search a set of registrations for a wait cycle by depth-first traversal in deterministic order,
 * so a refusal always names the same cycle for the same graph.
 * @param registrations - The registrations to search, including the one being proposed.
 * @returns The first cycle found as a closed path, or null when the graph is acyclic.
 */
function findCycle(registrations: Iterable<Registration>): readonly GraphNode[] | null {
	const { nodes, adjacency } = graphOf(registrations);
	const state = new Map<string, VisitState>();
	const stack: string[] = [];
	const stackIndex = new Map<string, number>();

	/**
	 * Visit one vertex and everything reachable from it that has not been visited yet.
	 * @param key - The vertex to visit.
	 * @returns The cycle found below this vertex, or null.
	 */
	const visit = (key: string): readonly GraphNode[] | null => {
		state.set(key, "visiting");
		stackIndex.set(key, stack.length);
		stack.push(key);
		const targets = [...(adjacency.get(key) ?? [])].toSorted(compareText);
		for (const target of targets) {
			const targetState = state.get(target);
			if (targetState === "visiting") {
				return cycleClosedAt(target, stack, stackIndex, nodes);
			}
			const cycle = targetState === undefined ? visit(target) : null;
			if (cycle) {
				return cycle;
			}
		}
		stack.pop();
		stackIndex.delete(key);
		state.set(key, "visited");
		return null;
	};

	for (const key of [...nodes.keys()].toSorted(compareText)) {
		if (state.has(key)) {
			continue;
		}
		const cycle = visit(key);
		if (cycle) {
			return cycle;
		}
	}
	return null;
}

/**
 * Sort and freeze a list of edges for return to a caller.
 * @param edges - The edges to freeze.
 * @returns The edges in deterministic order.
 */
function freezeEdges(edges: readonly WaitEdge[]): readonly WaitEdge[] {
	return Object.freeze([...edges].toSorted(compareEdges));
}

/**
 * Convert a cycle of graph vertices into the child and thread path a refusal reports.
 * @param nodes - The closed path found by traversal.
 * @returns The child the cycle belongs to and its thread path.
 */
function freezeCycle(nodes: readonly GraphNode[]): {
	readonly child: ChildId;
	readonly cycle: readonly ThreadId[];
} {
	const child = nodes[0]?.child;
	if (child === undefined) {
		throw new Error("A wait cycle must contain at least one node.");
	}
	return {
		child,
		cycle: Object.freeze(nodes.map((node) => node.thread)),
	};
}

/**
 * Pick the registration keys a cleanup removes: exactly one owner, or every owner of an exited
 * child.
 * @param cleanup - The cleanup being applied.
 * @param registrations - The live registrations.
 * @returns The keys to remove, whether or not each is currently registered.
 */
function keysReleasedBy(
	cleanup: WaitCleanup,
	registrations: ReadonlyMap<string, Registration>,
): ReadonlySet<string> {
	if (cleanup.cause !== "child-exit") {
		return new Set([ownerKey(cleanup.owner)]);
	}
	const keys = new Set<string>();
	for (const [key, registration] of registrations) {
		if (registration.owner.child === cleanup.child) {
			keys.add(key);
		}
	}
	return keys;
}

/**
 * Create the wait graph that refuses a dynamic wait which would deadlock: an edge set is accepted
 * only when the graph with it stays acyclic.
 * @returns A fresh, empty graph.
 */
function createCodexWaitGraph(): CodexWaitGraph {
	const registrations = new Map<string, Registration>();

	/**
	 * Add or replace one owner's edge set, refusing it when it would close a cycle.
	 * @param input - The owner and the targets it waits on.
	 * @returns The accepted edges, or the cycle that refused them.
	 */
	const addEdgeSet = (input: WaitEdgeSetInput): WaitEdgeSetResult => {
		const registration = registrationFor(input);
		const proposed = new Map(registrations);
		proposed.set(registration.key, registration);
		const cycle = findCycle(proposed.values());
		if (cycle) {
			const refusal = freezeCycle(cycle);
			return Object.freeze({ ok: false, reason: "cycle", ...refusal });
		}
		registrations.set(registration.key, registration);
		return Object.freeze({ ok: true, edges: edgesFor(registration) });
	};

	/**
	 * Remove the edge sets a cleanup names and report which edges went away.
	 * @param cleanup - The owner, or the exited child, whose waits end.
	 * @returns The removed edges in deterministic order.
	 */
	const release = (cleanup: WaitCleanup): readonly WaitEdge[] => {
		const keys = keysReleasedBy(cleanup, registrations);
		const removed: WaitEdge[] = [];
		for (const key of keys) {
			const registration = registrations.get(key);
			if (registration) {
				removed.push(...edgesFor(registration));
			}
		}
		for (const key of keys) {
			registrations.delete(key);
		}
		return freezeEdges(removed);
	};

	/**
	 * List every active edge in deterministic order.
	 * @returns The active edges.
	 */
	const inspect = (): readonly WaitEdge[] => sortedEdges(registrations.values());

	return Object.freeze({ addEdgeSet, release, inspect });
}

export {
	type WaitOwner,
	type WaitEdgeSetInput,
	type WaitEdge,
	type OwnedWaitCleanupCause,
	type WaitCleanup,
	type WaitEdgeSetResult,
	type CodexWaitGraph,
	createCodexWaitGraph,
};
