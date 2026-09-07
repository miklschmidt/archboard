// The change as compact lines, for a reader with a token budget — a hook's
// additional context, or an injected item. Nothing here is invented: every
// line restates one field of the change.
//
// `maxChars` truncates by dropping whole lines and saying how many were
// dropped, never by cutting a line in half. The full structure is always
// available from the feed.

import type { SemanticChange } from "@/runtime/engine/changes";
import type {
	EdgeRef,
	EdgeReroute,
	NodeIdentityChange,
	NodeRef,
} from "@/runtime/engine/lib/change-refs";
import type { DeepReadonly, NameIndex } from "@/runtime/engine/lib/change-phrasing";
import {
	describeFieldChanges,
	namedBy,
	namedList,
	quoted,
} from "@/runtime/engine/lib/change-phrasing";

/** How many cluster lines are worth printing before they repeat themselves. */
const CLUSTER_LINE_LIMIT = 2;

/** How many relative-position lines are worth printing. */
const RELATION_LINE_LIMIT = 8;

/**
 * A shape that became a node, said with what it used to be so the reader can
 * tell a promotion from an arrival.
 * @param id The identity change.
 * @returns The line.
 */
function promotionLine(id: DeepReadonly<NodeIdentityChange>): string {
	const was =
		id.from.anonymous && id.from.name.startsWith("an ")
			? `was ${id.from.name}`
			: `was a plain ${id.from.type} labelled "${id.from.name}"`;
	const kind = id.to.kind !== undefined ? ` to a ${id.to.kind}` : "";
	const bound = id.to.binding !== undefined ? ` bound to ${id.to.binding}` : "";
	return `promoted ${quoted(id.to.name)}${kind}${bound} (${was})`;
}

/**
 * One shape's identity change.
 * @param id The identity change.
 * @returns The line.
 */
function identityLine(id: DeepReadonly<NodeIdentityChange>): string {
	if (id.what === "promoted") {
		return promotionLine(id);
	}
	if (id.what === "demoted") {
		return `demoted ${quoted(id.from.name)} back to a plain ${id.to.type}`;
	}
	return `renamed the node ${quoted(id.from.name)} to ${quoted(id.to.name)}`;
}

/**
 * A node that arrived, said with whatever it is bound to.
 * @param node The node.
 * @returns The line.
 */
function addedNodeLine(node: DeepReadonly<NodeRef>): string {
	const bound = node.binding !== undefined ? ` bound to ${node.binding}` : "";
	return `new ${node.kind ?? "node"} ${quoted(node.name)}${bound}`;
}

/**
 * A node that left.
 * @param node The node.
 * @returns The line.
 */
function removedNodeLine(node: DeepReadonly<NodeRef>): string {
	const kind = node.kind !== undefined ? ` (${node.kind})` : "";
	return `${quoted(node.name)}${kind} was removed`;
}

/**
 * A connector that was drawn, said with its label when it carries one.
 * @param edge The connector.
 * @returns The line.
 */
function addedEdgeLine(edge: DeepReadonly<EdgeRef>): string {
	const label = edge.label !== undefined ? ` ("${edge.label}")` : "";
	return `new edge ${quoted(edge.fromName)} → ${quoted(edge.toName)}${label}`;
}

/**
 * A connector that kept one end and moved the other.
 * @param r The reroute.
 * @returns The line.
 */
function rerouteLine(r: DeepReadonly<EdgeReroute>): string {
	const prep = r.end === "source" ? "from" : "to";
	return `rerouted: ${quoted(r.anchorName)}'s edge ${prep} ${quoted(r.wasName)} now ${prep} ${quoted(r.nowName)}`;
}

/**
 * Everything that happened to the board's nodes as identities and arrivals.
 * @param change The whole change.
 * @returns The lines.
 */
function nodeLines(change: DeepReadonly<SemanticChange>): string[] {
	return [
		...change.nodes.identity.map((id) => identityLine(id)),
		...change.nodes.added.map((node) => addedNodeLine(node)),
		...change.nodes.removed.map((node) => removedNodeLine(node)),
		...change.nodes.changed.map(
			(node) => `${quoted(node.name)}: ${describeFieldChanges(node.changes, change.names)}`,
		),
	];
}

/**
 * Everything that happened to the board's connectors.
 * @param change The whole change.
 * @returns The lines.
 */
function edgeLines(change: DeepReadonly<SemanticChange>): string[] {
	return [
		...change.edges.added.map((edge) => addedEdgeLine(edge)),
		...change.edges.removed.map(
			(edge) => `edge cut: ${quoted(edge.fromName)} → ${quoted(edge.toName)}`,
		),
		...change.edges.rerouted.map((r) => rerouteLine(r)),
		...change.edges.changed.map(
			(edge) =>
				`edge ${quoted(edge.fromName)} → ${quoted(edge.toName)}: ${describeFieldChanges(edge.changes)}`,
		),
	];
}

/**
 * One cluster's arrivals and departures.
 * @param cl The cluster change.
 * @param names Node id to reader-facing name.
 * @returns The line.
 */
function clusterLine(
	cl: DeepReadonly<SemanticChange>["layout"]["clusters"][number],
	names: NameIndex,
): string {
	const parts: string[] = [];
	if (cl.joined.length > 0) {
		parts.push(`joined by ${namedList(names, cl.joined)}`);
	}
	if (cl.left.length > 0) {
		parts.push(`left by ${namedList(names, cl.left)}`);
	}
	const detail = parts.length > 0 ? `: ${parts.join(", ")}` : "";
	const around =
		cl.sharedMembers.length > 0 ? ` (around ${namedList(names, cl.sharedMembers)})` : "";
	return `cluster ${cl.kind}${detail}${around}`;
}

/**
 * The board's clusters, capped.
 *
 * A board that broke into five clusters produces five entries describing the
 * same event from five sides, and the per-node "sits with" lines say it better.
 * @param change The whole change.
 * @returns The lines.
 */
function clusterLines(change: DeepReadonly<SemanticChange>): string[] {
	const lines = change.layout.clusters
		.slice(0, CLUSTER_LINE_LIMIT)
		.map((cl) => clusterLine(cl, change.names));
	if (change.layout.clusters.length > CLUSTER_LINE_LIMIT) {
		const rest = change.layout.clusters.length - CLUSTER_LINE_LIMIT;
		lines.push(`… and ${rest} other cluster change(s) from the same rearrangement`);
	}
	return lines;
}

/**
 * One explicit group's arrivals and departures.
 * @param g The group change.
 * @param names Node id to reader-facing name.
 * @returns The line.
 */
function groupLine(
	g: DeepReadonly<SemanticChange>["layout"]["groups"][number],
	names: NameIndex,
): string {
	const joined = g.joined.length > 0 ? `: +${namedList(names, g.joined)}` : "";
	const left = g.left.length > 0 ? `: -${namedList(names, g.left)}` : "";
	return `group ${g.kind}${joined}${left}`;
}

/**
 * How the board is arranged now: its clusters, its groups, and the nodes that
 * only moved.
 * @param change The whole change.
 * @returns The lines.
 */
function layoutLines(change: DeepReadonly<SemanticChange>): string[] {
	return [
		...clusterLines(change),
		...change.layout.groups.map((g) => groupLine(g, change.names)),
		...change.nodes.moved.map(
			(m) => `${quoted(m.name)} moved: ${describeFieldChanges(m.changes, change.names)}`,
		),
	];
}

/**
 * Which nodes now sit where relative to which, capped.
 * @param change The whole change.
 * @returns The lines.
 */
function relationLines(change: DeepReadonly<SemanticChange>): string[] {
	const lines = change.layout.relations
		.slice(0, RELATION_LINE_LIMIT)
		.map(
			(rel) =>
				`${namedBy(change.names, rel.a)} is now ${rel.to} ${namedBy(change.names, rel.b)} (was ${rel.from})`,
		);
	if (change.layout.relations.length > RELATION_LINE_LIMIT) {
		const rest = change.layout.relations.length - RELATION_LINE_LIMIT;
		lines.push(`… and ${rest} other relative-position changes`);
	}
	return lines;
}

/**
 * As many whole lines as fit, with a count of the ones that did not.
 * @param lines Every line the change produced.
 * @param maxChars The budget.
 * @returns The bullet list.
 */
function withinBudget(lines: readonly string[], maxChars: number): string {
	const kept: string[] = [];
	let used = 0;
	for (const line of lines) {
		if (used + line.length + 3 > maxChars) {
			kept.push(
				`… and ${lines.length - kept.length} more changes (ask the canvas for the full diff)`,
			);
			break;
		}
		kept.push(line);
		used += line.length + 3;
	}
	return kept.map((l) => `- ${l}`).join("\n");
}

/**
 * The whole change as a compact bullet list.
 * @param change The whole change.
 * @param maxChars The budget; lines past it are dropped whole and counted.
 * @returns The bullet list.
 */
function narrateChange(change: DeepReadonly<SemanticChange>, maxChars = 1800): string {
	return withinBudget(
		[...nodeLines(change), ...edgeLines(change), ...layoutLines(change), ...relationLines(change)],
		maxChars,
	);
}

export { narrateChange };
