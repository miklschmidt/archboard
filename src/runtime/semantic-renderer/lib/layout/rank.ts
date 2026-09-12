// How far down the diagram each card sits, derived from the edge graph.
//
// Forked from PR Lens's `layout/rank.ts`. Two changes. There are no document
// rank hints to apply as a floor: under ADR 0023 an agent authors meaning and
// never a coordinate, and a rank hint is a coordinate in disguise. And the
// cycle-breaking walk is written as recursion rather than as an explicit stack,
// because the stack version cannot be expressed inside this repository's
// complexity limit and a board's containment depth is small.

import type { SemanticEdge, SemanticNode } from "@/shared/semantic-board/index";

/** What a depth-first walk carries with it. */
interface Walk {
	/** The nodes on the current path, whose re-entry would close a cycle. */
	readonly open: Set<string>;
	/** The nodes already walked, which need no second visit. */
	readonly closed: Set<string>;
	/** The forward edges kept so far. */
	readonly kept: [string, string][];
}

/**
 * One node's successors, dropping any edge that reaches a node still open on
 * the path.
 * @param id The node being visited.
 * @param forward Each node's successors.
 * @param walk What the walk has seen so far.
 */
function visit(id: string, forward: ReadonlyMap<string, readonly string[]>, walk: Walk): void {
	walk.open.add(id);
	for (const successor of forward.get(id) ?? []) {
		if (walk.open.has(successor)) {
			continue;
		}
		walk.kept.push([id, successor]);
		if (!walk.closed.has(successor)) {
			visit(successor, forward, walk);
		}
	}
	walk.open.delete(id);
	walk.closed.add(id);
}

/**
 * Depth-first from every node in document order, dropping any edge that closes
 * a cycle. Which edge closes a cycle depends on where the walk started, so the
 * walk order is fixed by the document rather than by the iteration order of a
 * map.
 * @param nodes The nodes being ranked, in document order.
 * @param forward Each node's successors.
 * @returns The forward edges that do not close a cycle.
 */
function forwardEdgesWithoutCycles(
	nodes: readonly SemanticNode[],
	forward: ReadonlyMap<string, readonly string[]>,
): [string, string][] {
	const walk: Walk = { open: new Set(), closed: new Set(), kept: [] };
	for (const root of nodes) {
		if (!walk.closed.has(root.id)) {
			visit(root.id, forward, walk);
		}
	}
	return walk.kept;
}

/**
 * Each node's successors, counting only the edges whose two ends are both being
 * ranked and dropping the ones that leave and arrive at the same card.
 * @param nodes The nodes being ranked, in document order.
 * @param edges The relationships between them.
 * @returns Each node's successors.
 */
function forwardMap(
	nodes: readonly SemanticNode[],
	edges: readonly SemanticEdge[],
): Map<string, string[]> {
	const forward = new Map<string, string[]>(nodes.map((node) => [node.id, []]));
	for (const edge of edges) {
		const out = forward.get(edge.from);
		if (out !== undefined && edge.from !== edge.to && forward.has(edge.to)) {
			out.push(edge.to);
		}
	}
	return forward;
}

/**
 * Each node's predecessors, over the acyclic part of the graph.
 * @param nodes The nodes being ranked, in document order.
 * @param forward Each node's successors.
 * @returns Each node's predecessors.
 */
function incomingMap(
	nodes: readonly SemanticNode[],
	forward: ReadonlyMap<string, readonly string[]>,
): Map<string, string[]> {
	const incoming = new Map<string, string[]>(nodes.map((node) => [node.id, []]));
	for (const [from, to] of forwardEdgesWithoutCycles(nodes, forward)) {
		const list = incoming.get(to);
		if (list !== undefined) {
			list.push(from);
		}
	}
	return incoming;
}

/**
 * Layer index per node: how far down the diagram it sits.
 *
 * Longest path from a source, so an arrow always points at a node below the one
 * it left. Real dependency graphs contain cycles, and a cycle has no such
 * ordering, so the edges that close one are dropped first — the arrow still
 * gets drawn, it just runs back up the page.
 * @param nodes The nodes being ranked, in document order.
 * @param edges The relationships between them.
 * @returns Each node's rank.
 */
function rankNodes(
	nodes: readonly SemanticNode[],
	edges: readonly SemanticEdge[],
): Map<string, number> {
	const incoming = incomingMap(nodes, forwardMap(nodes, edges));
	const ranks = new Map<string, number>();

	/**
	 * One node's rank, computed from its predecessors' and remembered.
	 * @param id The node.
	 * @returns Its rank.
	 */
	const settle = (id: string): number => {
		const known = ranks.get(id);
		if (known !== undefined) {
			return known;
		}
		let rank = 0;
		for (const predecessor of incoming.get(id) ?? []) {
			rank = Math.max(rank, settle(predecessor) + 1);
		}
		ranks.set(id, rank);
		return rank;
	};

	for (const node of nodes) {
		settle(node.id);
	}
	return ranks;
}

export { rankNodes };
