// The sections a whole-board description is made of, below its summary.
//
// Each degrades on its own terms: a board too big to list node by node is
// sampled per kind, the edges stop at a limit, and the elements nobody
// promoted are listed only where they carry something worth reading.

import {
	KIND_ORDER,
	UNTYPED,
	counts,
	hasText,
	readingOrder,
	renderCounts,
} from "@/runtime/engine/lib/describe-scene-model";
import type { DeepReadonly, Edge, Item } from "@/runtime/engine/lib/describe-scene-model";
import { nodeLine, nodeExtras, plainLine } from "@/runtime/engine/lib/describe-lines";
import type { ServerElement } from "@/runtime/engine/types";

// Past this many nodes the list is replaced by a sample per kind: a read-back
// nobody can hold in their head is not a read-back.
const NODE_LIST_LIMIT = 120;
// Past this many, each node keeps its main line and loses its extras.
const NODE_DETAIL_LIMIT = 60;
const EDGE_LIST_LIMIT = 60;
const OTHER_LIST_LIMIT = 40;

/**
 * One node's lines: what it is, and what it carries beyond that unless the
 * scene is too big to spend a second line on each.
 * @param item The node.
 * @param showLevel Whether the scene has levels worth naming.
 * @param terse Whether to leave the extras out.
 * @returns The lines.
 */
function nodeDetailLines(item: Item, showLevel: boolean, terse: boolean): readonly string[] {
	const line = `    ${nodeLine(item, showLevel)}`;
	const extra = terse ? "" : nodeExtras(item);
	return hasText(extra) ? [line, `        + ${extra}`] : [line];
}

/**
 * Where one kind sits in the order a description names them; a kind nobody
 * named comes after the ones that are.
 * @param kind The kind.
 * @returns Its rank.
 */
function rankOf(kind: string): number {
	const at = KIND_ORDER.indexOf(kind);
	return at === -1 ? 1e6 : at;
}

/**
 * The nodes, by kind: each listed where the board is small enough, and
 * sampled where it is not.
 * @param nodes The board's nodes.
 * @param kindCounts How many of each kind there are.
 * @param showLevel Whether the board has levels worth naming.
 * @returns The lines.
 */
function nodesSection(
	nodes: readonly Item[],
	kindCounts: Record<string, number>,
	showLevel: boolean,
): string[] {
	if (nodes.length === 0) {
		return [];
	}
	const lines = ["", `### Nodes (${nodes.length})`];
	if (nodes.length > NODE_LIST_LIMIT) {
		lines.push(`  ${nodes.length} nodes — too many to list; use \`query\` for the full set.`);
		lines.push(...sampledKinds(nodes, kindCounts));
		return lines;
	}
	const terse = nodes.length > NODE_DETAIL_LIMIT;
	for (const kind of Object.keys(kindCounts).toSorted(byKind)) {
		lines.push(`  ${kind} (${kindCounts[kind]}):`);
		for (const n of nodes.filter((x) => (x.meta.kind ?? UNTYPED) === kind)) {
			lines.push(...nodeDetailLines(n, showLevel, terse));
		}
	}
	return lines;
}

/**
 * Which kind is named first: the order a description uses, then alphabetical.
 * @param a One kind.
 * @param b The other.
 * @returns Negative when the first is named first.
 */
function byKind(a: string, b: string): number {
	return rankOf(a) - rankOf(b) || (a < b ? -1 : 1);
}

/**
 * A few nodes of each kind, for a board too big to list.
 * @param nodes The board's nodes.
 * @param kindCounts How many of each kind there are.
 * @returns The lines.
 */
function sampledKinds(nodes: readonly Item[], kindCounts: Record<string, number>): string[] {
	return Object.keys(kindCounts)
		.toSorted((a, b) => KIND_ORDER.indexOf(a) - KIND_ORDER.indexOf(b))
		.map((kind) => {
			const sample = nodes
				.filter((n) => (n.meta.kind ?? UNTYPED) === kind)
				.slice(0, 6)
				.map((n) => n.name);
			const more = (kindCounts[kind] ?? 0) > 6 ? ", …" : "";
			return `  ${kind} (${kindCounts[kind]}): ${sample.join(", ")}${more}`;
		});
}

/**
 * The connectors that join two nodes, and a count of the ones that join
 * nothing.
 * @param edges The connectors that resolved to nodes.
 * @param looseConnectors How many were drawn but attached to nothing.
 * @returns The lines.
 */
function edgesSection(edges: readonly DeepReadonly<Edge>[], looseConnectors: number): string[] {
	if (edges.length === 0 && looseConnectors === 0) {
		return [];
	}
	const lines = [
		"",
		`### Edges (${edges.length})`,
		...edges.slice(0, EDGE_LIST_LIMIT).map(edgeLine),
	];
	if (edges.length > EDGE_LIST_LIMIT) {
		lines.push(`  … and ${edges.length - EDGE_LIST_LIMIT} more edges`);
	}
	if (looseConnectors > 0) {
		lines.push(
			`  (${looseConnectors} unbound connector${looseConnectors === 1 ? "" : "s"} — drawn but attached to nothing)`,
		);
	}
	return lines;
}

/**
 * One edge as a line: the two names a person uses, and the ids a caller that
 * parses this needs.
 * @param e The edge.
 * @returns The line.
 */
function edgeLine(e: DeepReadonly<Edge>): string {
	const arrow = hasText(e.label) ? `--"${e.label}"-->` : "-->";
	return `  "${e.fromName}" ${arrow} "${e.toName}"   (${e.fromId ?? "?"} --> ${e.toId ?? "?"}, arrow: ${e.arrow.id})`;
}

/**
 * Whether one plain element carries anything worth a line: words, a link, or
 * somebody else's metadata.
 * @param o The element.
 * @returns True when it is worth listing.
 */
function isNotable(o: Item): boolean {
	return hasText(o.labelText) || hasText(o.el.link) || Object.keys(o.meta.foreign).length > 0;
}

/**
 * The elements nobody promoted: listed where the board is small enough, and
 * otherwise the notable ones with the rest counted by type.
 * @param others The plain elements.
 * @returns The lines.
 */
function othersSection(others: readonly Item[]): string[] {
	if (others.length === 0) {
		return [];
	}
	const notable = others.filter(isNotable);
	const listAll = others.length <= OTHER_LIST_LIMIT;
	const listed = listAll ? [...others].toSorted(readingOrder) : notable.slice(0, OTHER_LIST_LIMIT);
	const lines = ["", `### Other elements (${others.length}) — no archboard metadata`];
	lines.push(...listed.map((o) => `  ${plainLine(o)}`));
	const omitted = others.length - listed.length;
	if (omitted > 0) {
		const rest = listAll
			? []
			: [...notable.slice(OTHER_LIST_LIMIT), ...others.filter((o) => !isNotable(o))];
		const lead = listed.length > 0 ? `… ${omitted} more` : `${omitted}`;
		lines.push(
			`  ${lead} unlabelled, not listed: ${renderCounts(counts(rest.map((o) => o.el.type)))}`,
		);
	}
	return lines;
}

/**
 * Which elements are grouped with which, by group id.
 * @param allElements The board's elements.
 * @returns The lines.
 */
function groupsSection(allElements: readonly ServerElement[]): string[] {
	const groups = new Map<string, string[]>();
	for (const el of allElements) {
		for (const gid of el.groupIds) {
			groups.set(gid, [...(groups.get(gid) ?? []), el.id]);
		}
	}
	if (groups.size === 0) {
		return [];
	}
	return [
		"",
		"### Groups:",
		...[...groups].map(([gid, ids]) => `  Group ${gid}: [${ids.join(", ")}]`),
	];
}

export { edgesSection, groupsSection, nodesSection, othersSection };
