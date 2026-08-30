import type {
	ChildId,
	DynamicToolCallId,
	ThreadId,
	TurnId,
} from "../../../shared/codex-workbench-identity/index.js";

export interface WaitOwner {
	readonly child: ChildId;
	readonly caller: ThreadId;
	readonly turn: TurnId;
	readonly call: DynamicToolCallId;
}

export interface WaitEdgeSetInput {
	readonly owner: WaitOwner;
	readonly targets: readonly ThreadId[];
}

export interface WaitEdge {
	readonly owner: WaitOwner;
	readonly target: ThreadId;
}

export type OwnedWaitCleanupCause =
	| "settle"
	| "decline"
	| "cancellation"
	| "interruption"
	| "disconnect";

export type WaitCleanup =
	| {
			readonly cause: OwnedWaitCleanupCause;
			readonly owner: WaitOwner;
	  }
	| {
			readonly cause: "child-exit";
			readonly child: ChildId;
	  };

export type WaitEdgeSetResult =
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

export interface CodexWaitGraph {
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

function compareText(left: string, right: string): number {
	return left < right ? -1 : left > right ? 1 : 0;
}

function ownerKey(owner: WaitOwner): string {
	return JSON.stringify([owner.child, owner.caller, owner.turn, owner.call]);
}

function vertexKey(child: ChildId, thread: ThreadId): string {
	return JSON.stringify([child, thread]);
}

function copyOwner(owner: WaitOwner): WaitOwner {
	return Object.freeze({
		child: owner.child,
		caller: owner.caller,
		turn: owner.turn,
		call: owner.call,
	});
}

function canonicalTargets(targets: readonly ThreadId[]): readonly ThreadId[] {
	return Object.freeze([...new Set(targets)].toSorted(compareText));
}

function registrationFor(input: WaitEdgeSetInput): Registration {
	const owner = copyOwner(input.owner);
	return Object.freeze({
		key: ownerKey(owner),
		owner,
		targets: canonicalTargets(input.targets),
	});
}

function edgeFor(registration: Registration, target: ThreadId): WaitEdge {
	return Object.freeze({ owner: registration.owner, target });
}

function edgesFor(registration: Registration): readonly WaitEdge[] {
	return Object.freeze(registration.targets.map((target) => edgeFor(registration, target)));
}

function compareEdges(left: WaitEdge, right: WaitEdge): number {
	const ownerComparison = compareText(ownerKey(left.owner), ownerKey(right.owner));
	return ownerComparison !== 0 ? ownerComparison : compareText(left.target, right.target);
}

function sortedEdges(registrations: Iterable<Registration>): readonly WaitEdge[] {
	return Object.freeze(
		[...registrations].flatMap((registration) => edgesFor(registration)).toSorted(compareEdges),
	);
}

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

function findCycle(registrations: Iterable<Registration>): readonly GraphNode[] | null {
	const { nodes, adjacency } = graphOf(registrations);
	const state = new Map<string, VisitState>();
	const stack: string[] = [];
	const stackIndex = new Map<string, number>();

	const visit = (key: string): readonly GraphNode[] | null => {
		state.set(key, "visiting");
		stackIndex.set(key, stack.length);
		stack.push(key);
		const targets = [...(adjacency.get(key) ?? [])].toSorted(compareText);
		for (const target of targets) {
			const targetState = state.get(target);
			if (targetState === "visiting") {
				const start = stackIndex.get(target);
				if (start === undefined) throw new Error("Wait graph traversal lost its stack index.");
				return [...stack.slice(start), target].map((nodeKey) => nodes.get(nodeKey)!);
			}
			if (targetState === undefined) {
				const cycle = visit(target);
				if (cycle) return cycle;
			}
		}
		stack.pop();
		stackIndex.delete(key);
		state.set(key, "visited");
		return null;
	};

	for (const key of [...nodes.keys()].toSorted(compareText)) {
		if (state.has(key)) continue;
		const cycle = visit(key);
		if (cycle) return cycle;
	}
	return null;
}

function freezeEdges(edges: readonly WaitEdge[]): readonly WaitEdge[] {
	return Object.freeze([...edges].toSorted(compareEdges));
}

function freezeCycle(nodes: readonly GraphNode[]): {
	readonly child: ChildId;
	readonly cycle: readonly ThreadId[];
} {
	const child = nodes[0]?.child;
	if (child === undefined) throw new Error("A wait cycle must contain at least one node.");
	return {
		child,
		cycle: Object.freeze(nodes.map((node) => node.thread)),
	};
}

export function createCodexWaitGraph(): CodexWaitGraph {
	const registrations = new Map<string, Registration>();

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

	const release = (cleanup: WaitCleanup): readonly WaitEdge[] => {
		const keys = new Set<string>();
		if (cleanup.cause === "child-exit") {
			for (const [key, registration] of registrations) {
				if (registration.owner.child === cleanup.child) keys.add(key);
			}
		} else {
			keys.add(ownerKey(cleanup.owner));
		}

		const removed: WaitEdge[] = [];
		for (const key of keys) {
			const registration = registrations.get(key);
			if (!registration) continue;
			removed.push(...edgesFor(registration));
		}
		for (const key of keys) registrations.delete(key);
		return freezeEdges(removed);
	};

	const inspect = (): readonly WaitEdge[] => sortedEdges(registrations.values());

	return Object.freeze({ addEdgeSet, release, inspect });
}
