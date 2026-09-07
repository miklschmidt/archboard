// Pairing the connectors of one board with those of another, and reading a
// moved connector as the move it is.

import type { ChangedEdge, CompareResult, EdgeFacts } from "@/runtime/engine/lib/compare-contract";
import type { EdgeModel } from "@/runtime/engine/lib/compare-node-model";
import { diffFields, edgeFields } from "@/runtime/engine/lib/compare-diff";

/**
 * What makes two connectors comparable: the pair of nodes they join.
 * @param e The connector.
 * @returns The key.
 */
const edgeKey = (e: EdgeFacts): string => `${e.from}\0${e.to}`;

/**
 * The connectors grouped by the pair of nodes each joins, so parallel edges
 * are matched against one another rather than across pairs.
 * @param list The connectors.
 * @returns The connectors by node pair.
 */
const bucketEdges = (list: EdgeModel[]): Map<string, EdgeModel[]> => {
	const map = new Map<string, EdgeModel[]>();
	for (const edge of list) {
		const key = edgeKey(edge);
		const entries = map.get(key) ?? [];
		entries.push(edge);
		map.set(key, entries);
	}
	return map;
};

/**
 * The connectors grouped by the node at one of their ends.
 * @param list The connectors.
 * @param end Which end anchors them.
 * @returns The connectors by anchor node.
 */
const byAnchor = (list: EdgeFacts[], end: "source" | "target"): Map<string, EdgeFacts[]> => {
	const map = new Map<string, EdgeFacts[]>();
	for (const edge of list) {
		const anchor = end === "source" ? edge.from : edge.to;
		const entries = map.get(anchor) ?? [];
		entries.push(edge);
		map.set(anchor, entries);
	}
	return map;
};

/**
 * Pair the connectors on one side with those on the other.
 *
 * Parallel edges between the same pair of nodes are matched by label first, so
 * renaming one of two arrows does not read as one removed and one added;
 * whatever is left over pairs up positionally.
 * @param from The connectors on one side.
 * @param to The connectors on the other.
 * @returns What was added, removed, changed and left alone.
 */
function matchEdges(
	from: EdgeModel[],
	to: EdgeModel[],
): {
	added: EdgeFacts[];
	removed: EdgeFacts[];
	changed: ChangedEdge[];
	unchanged: EdgeFacts[];
} {
	const fromMap = bucketEdges(from);
	const toMap = bucketEdges(to);
	const matched: EdgeMatches = { added: [], removed: [], changed: [], unchanged: [] };
	for (const key of new Set([...fromMap.keys(), ...toMap.keys()])) {
		matchPair([...(fromMap.get(key) ?? [])], [...(toMap.get(key) ?? [])], matched);
	}
	return matched;
}

/** What matching the connectors of one node pair produced. */
interface EdgeMatches {
	added: EdgeFacts[];
	removed: EdgeFacts[];
	changed: ChangedEdge[];
	unchanged: EdgeFacts[];
}

/**
 * Match the connectors joining one pair of nodes: by label first, then
 * positionally, and whatever is left over was added or removed.
 * @param lefts The connectors on one side, consumed as they are matched.
 * @param rights The connectors on the other, likewise.
 * @param matched What the matching has found so far, extended in place.
 */
function matchPair(lefts: EdgeModel[], rights: EdgeModel[], matched: EdgeMatches): void {
	for (let i = lefts.length - 1; i >= 0; i--) {
		const left = lefts[i]!;
		const j = rights.findIndex((right) => (right.label ?? "") === (left.label ?? ""));
		if (j !== -1) {
			lefts.splice(i, 1);
			recordMatch(left, rights.splice(j, 1)[0]!, matched);
		}
	}
	// Whatever is left pairs up positionally: same endpoints, different label.
	while (lefts.length > 0 && rights.length > 0) {
		recordMatch(lefts.shift()!, rights.shift()!, matched);
	}
	matched.removed.push(...lefts);
	matched.added.push(...rights);
}

/**
 * Record one matched pair as changed or as left alone.
 * @param left The connector on one side.
 * @param right The connector it matched on the other.
 * @param matched What the matching has found so far, extended in place.
 */
function recordMatch(left: EdgeModel, right: EdgeModel, matched: EdgeMatches): void {
	const changes = diffFields(edgeFields(left), edgeFields(right));
	if (Object.keys(changes).length === 0) {
		matched.unchanged.push(right);
		return;
	}
	matched.changed.push({
		from: right.from,
		to: right.to,
		changes,
		fromFacts: left,
		toFacts: right,
	});
}

/**
 * The connectors that were moved rather than replaced: a removed edge and an
 * added edge that share exactly one endpoint, one-to-one on that endpoint.
 *
 * An inference, offered alongside added and removed rather than instead of
 * them, because "A now points at C instead of B" is the sentence a human would
 * say and reconstructing it from two lists is work the consumer should not
 * have to redo.
 * @param removed The connectors that went.
 * @param added The connectors that arrived.
 * @returns One entry per reroute.
 */
function inferReroutes(
	removed: EdgeFacts[],
	added: EdgeFacts[],
): CompareResult["edges"]["rerouted"] {
	const out: CompareResult["edges"]["rerouted"] = [];
	for (const end of ["source", "target"] as const) {
		const add = byAnchor(added, end);
		for (const [anchor, gone] of byAnchor(removed, end)) {
			const reroute = rerouteAt(anchor, end, gone, add.get(anchor) ?? []);
			if (reroute) {
				out.push(reroute);
			}
		}
	}
	return out;
}

/** One connector moved from one node to another. */
type Reroute = CompareResult["edges"]["rerouted"][number];

/**
 * The reroute at one anchor, when exactly one connector went and exactly one
 * arrived: anything else is two separate edits rather than a move.
 * @param anchor The node both connectors share.
 * @param end Which end of them it is.
 * @param gone The connectors removed at that anchor.
 * @param arrived The connectors added there.
 * @returns The reroute, or null when nothing was moved.
 */
function rerouteAt(
	anchor: string,
	end: "source" | "target",
	gone: readonly EdgeFacts[],
	arrived: readonly EdgeFacts[],
): Reroute | null {
	const r = onlyOne(gone);
	const a = onlyOne(arrived);
	if (!r || !a) {
		return null;
	}
	const was = farEnd(r, end);
	const now = farEnd(a, end);
	if (was.node === now.node) {
		return null;
	}
	return {
		anchor,
		end,
		was: was.node,
		now: now.node,
		anchorName: end === "source" ? a.fromName : a.toName,
		wasName: was.name,
		nowName: now.name,
	};
}

/**
 * The one connector in a list, when it holds exactly one.
 * @param edges The connectors.
 * @returns The connector, or undefined.
 */
function onlyOne(edges: readonly EdgeFacts[]): EdgeFacts | undefined {
	return edges.length === 1 ? edges[0] : undefined;
}

/**
 * The node at the other end of a connector from its anchor.
 * @param edge The connector.
 * @param end Which end anchors it.
 * @returns The far node's id and name.
 */
function farEnd(edge: EdgeFacts, end: "source" | "target"): { node: string; name: string } {
	if (end === "source") {
		return { node: edge.to, name: edge.toName };
	}
	return { node: edge.from, name: edge.fromName };
}

export { inferReroutes, matchEdges };
