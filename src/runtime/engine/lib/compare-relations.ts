// Which way one node lies from another, across two boards.
//
// Only pairs that are actually related are compared — edge-connected or
// co-clustered on either side — because a direction between two nodes nobody
// put near each other is not a statement anybody made.

import type { RelationChange } from "@/runtime/engine/lib/compare-contract";
import type { BoardModel } from "@/runtime/engine/lib/compare-board-model";
import { MAX_RELATION_PAIRS, relationOf } from "@/runtime/engine/lib/compare-diff";

/** Why two nodes count as related. */
type Relatedness = "edge" | "cluster";

/** The related pairs, and what relates each of them. */
interface RelatedPairs {
	pairs: Set<string>;
	reason: Map<string, Set<Relatedness>>;
}

/** What the relation pass found. */
interface RelationDiff {
	changes: RelationChange[];
	compared: number;
	/** Set when the pair budget was reached and no relation was compared. */
	overBudget: boolean;
}

// A cluster this big is not a statement about any pair in it.
const MAX_CLUSTER_FOR_PAIRS = 40;

/**
 * The name for one pair of nodes, whichever way round the caller names them,
 * so a relation is counted once.
 * @param x One node.
 * @param y The other.
 * @returns The key.
 */
function pairKey(x: string, y: string): string {
	return x < y ? `${x}\0${y}` : `${y}\0${x}`;
}

/**
 * Every pair of nodes worth comparing a direction for, and what relates them.
 *
 * Only pairs both boards hold are counted: a relation to a node that exists on
 * one side is a fact about that node, reported in its own facts.
 * @param A One board.
 * @param B The other.
 * @returns The pairs and their reasons.
 */
function relatedPairsOf(A: BoardModel, B: BoardModel): RelatedPairs {
	const related: RelatedPairs = { pairs: new Set(), reason: new Map() };
	for (const edge of [...A.edges, ...B.edges]) {
		mark(related, A, B, edge.from, edge.to, "edge");
	}
	for (const cluster of [...A.clusters, ...B.clusters]) {
		if (cluster.members.length <= MAX_CLUSTER_FOR_PAIRS) {
			markCluster(related, A, B, cluster.members);
		}
	}
	return related;
}

/**
 * Mark every pair within one cluster as co-clustered.
 * @param related The pairs so far, extended in place.
 * @param A One board.
 * @param B The other.
 * @param members The cluster's nodes.
 */
function markCluster(
	related: RelatedPairs,
	A: BoardModel,
	B: BoardModel,
	members: readonly string[],
): void {
	for (const [i, x] of members.entries()) {
		for (const y of members.slice(i + 1)) {
			mark(related, A, B, x, y, "cluster");
		}
	}
}

/**
 * Note that two nodes are related, and why.
 * @param related The pairs so far, extended in place.
 * @param A One board.
 * @param B The other.
 * @param x One node.
 * @param y The other.
 * @param why What relates them.
 */
function mark(
	related: RelatedPairs,
	A: BoardModel,
	B: BoardModel,
	x: string,
	y: string,
	why: Relatedness,
): void {
	if (x === y || !onBoth(A, B, x) || !onBoth(A, B, y)) {
		return;
	}
	const key = pairKey(x, y);
	related.pairs.add(key);
	const reasons = related.reason.get(key) ?? new Set<Relatedness>();
	reasons.add(why);
	related.reason.set(key, reasons);
}

/**
 * Whether both boards hold one node.
 * @param A One board.
 * @param B The other.
 * @param id The node.
 * @returns True when both do.
 */
function onBoth(A: BoardModel, B: BoardModel, id: string): boolean {
	return A.nodes.has(id) && B.nodes.has(id);
}

/**
 * What a relation change is attributed to, when it is related both ways.
 * @param why What relates the pair.
 * @returns The attribution a report carries.
 */
function relatednessOf(why: ReadonlySet<Relatedness>): RelationChange["related"] {
	if (!why.has("edge")) {
		return "cluster";
	}
	return why.has("cluster") ? "edge+cluster" : "edge";
}

/**
 * The direction between one pair of nodes, on both boards.
 * @param key The pair.
 * @param A One board.
 * @param B The other.
 * @returns What it was and became, or null when either board lost a node.
 */
function relationBetween(
	key: string,
	A: BoardModel,
	B: BoardModel,
): { x: string; y: string; before: string; after: string } | null {
	const [x = "", y = ""] = key.split("\0");
	const before = relationOn(A, x, y);
	const after = relationOn(B, x, y);
	if (before === undefined || after === undefined) {
		return null;
	}
	return { x, y, before, after };
}

/**
 * Which way one node lies from another on one board.
 * @param board The board.
 * @param x One node.
 * @param y The other.
 * @returns The relation, or undefined when the board lost either node.
 */
function relationOn(board: BoardModel, x: string, y: string): string | undefined {
	const a = board.nodes.get(x);
	const b = board.nodes.get(y);
	return a && b ? relationOf(a.box, b.box) : undefined;
}

/**
 * Which related pairs lie differently now.
 *
 * The pairwise pass is the only place with a budget, and it is declared rather
 * than applied silently: past the budget nothing is compared and the caller
 * says so in its warnings.
 * @param A One board.
 * @param B The other.
 * @param related The pairs worth comparing.
 * @returns The changes, how many pairs were compared, and whether the budget stopped it.
 */
function diffRelations(A: BoardModel, B: BoardModel, related: RelatedPairs): RelationDiff {
	if (related.pairs.size > MAX_RELATION_PAIRS) {
		return { changes: [], compared: 0, overBudget: true };
	}
	const changes: RelationChange[] = [];
	let compared = 0;
	for (const key of related.pairs) {
		const found = relationBetween(key, A, B);
		const why = related.reason.get(key);
		if (!found || !why) {
			continue;
		}
		compared += 1;
		if (found.before !== found.after) {
			changes.push({
				a: found.x,
				b: found.y,
				from: found.before,
				to: found.after,
				related: relatednessOf(why),
			});
		}
	}
	return { changes, compared, overBudget: false };
}

export { type RelatedPairs, type RelationDiff, diffRelations, relatedPairsOf };
