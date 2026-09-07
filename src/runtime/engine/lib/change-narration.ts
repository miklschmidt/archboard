import type { FieldChange } from "@/runtime/engine/compare";
import type { SemanticChange } from "@/runtime/engine/changes";

type DeepReadonly<T> = T extends readonly (infer Item)[]
	? readonly DeepReadonly<Item>[]
	: T extends object
		? { readonly [Key in keyof T]: DeepReadonly<T[Key]> }
		: T;

/**
 *
 */
const changeRank = (model: DeepReadonly<{ changes: object }>): number =>
	["cluster", "container", "group"].some((key) => key in model.changes) ? 0 : 1;

/**
 *
 */
const quoted = (name: string): string => (name.startsWith("an ") ? name : `"${name}"`);

/**
 *
 */
const encodeValue = (value: unknown): string => {
	const encoded: unknown = JSON.stringify(value);
	return typeof encoded === "string" ? encoded : "none";
};

/**
 *
 */
function list(names: readonly string[], limit = 3): string {
	if (names.length <= limit) {
		return names.join(", ");
	}
	return `${names.slice(0, limit).join(", ")} and ${names.length - limit} more`;
}

/*
 * One sentence naming the most consequential thing in the change.
 *
 * Ranked, not summed: a headline that tried to mention everything would be
 * unreadable in the one place it is used, which is a line the agent may end up
 * speaking. Everything else is still in `narrateChange` and in `detail`.
 */
/**
 *
 */
function headlineFor(change: DeepReadonly<SemanticChange>): string {
	const c = change.counts;
	const n = change.nodes;
	const e = change.edges;

	if (n.identity.length > 0) {
		const first = n.identity.at(0);
		if (!first) {
			return "nothing this model can name changed";
		}
		let verb = "renamed";
		if (first.what === "promoted") {
			verb = "promoted";
		} else if (first.what === "demoted") {
			verb = "demoted";
		}
		const more = c.identityChanges > 1 ? ` (+${c.identityChanges - 1} more)` : "";
		return `${quoted(first.to.name)} ${verb}${first.what === "promoted" && first.to.kind !== undefined ? ` to a ${first.to.kind}` : ""}${more}`;
	}
	if (e.removed.length > 0 || e.rerouted.length > 0) {
		if (e.rerouted.length > 0) {
			const r = e.rerouted.at(0);
			if (!r) {
				return "nothing this model can name changed";
			}
			return `${quoted(r.anchorName)}'s ${r.end === "source" ? "incoming" : "outgoing"} edge now goes to ${quoted(r.nowName)}, not ${quoted(r.wasName)}`;
		}
		const r = e.removed.at(0);
		if (!r) {
			return "nothing this model can name changed";
		}
		const more = e.removed.length > 1 ? ` (+${e.removed.length - 1} more)` : "";
		return `the edge ${quoted(r.fromName)} → ${quoted(r.toName)} was cut${more}`;
	}
	if (n.removed.length > 0) {
		return `${list(n.removed.map((x) => quoted(x.name)))} ${n.removed.length === 1 ? "is" : "are"} gone from the board`;
	}
	if (n.added.length > 0) {
		return `${list(n.added.map((x) => quoted(x.name)))} appeared on the board`;
	}
	if (e.added.length > 0) {
		const a = e.added.at(0);
		if (!a) {
			return "nothing this model can name changed";
		}
		const more = e.added.length > 1 ? ` (+${e.added.length - 1} more)` : "";
		return `a new edge ${quoted(a.fromName)} → ${quoted(a.toName)}${more}`;
	}
	if (n.changed.length > 0) {
		const ch = n.changed.at(0);
		if (!ch) {
			return "nothing this model can name changed";
		}
		const fields = Object.keys(ch.changes).join(", ");
		const more = n.changed.length > 1 ? ` (+${n.changed.length - 1} more)` : "";
		return `${quoted(ch.name)} changed: ${fields}${more}`;
	}
	/**
	 *
	 */
	const named = (node: string): string => quoted(change.names[node] ?? node);
	if (change.layout.clusters.length > 0) {
		const cl = change.layout.clusters.at(0);
		if (!cl) {
			return "nothing this model can name changed";
		}
		const who = [...cl.joined, ...cl.left];
		return `the grouping changed — a cluster ${cl.kind}${who.length > 0 ? `, ${list(who.map((node) => named(node)))} moved between clusters` : ""}`;
	}
	if (c.nodesMoved > 0) {
		// Not every "moved" is equally meaningful: containment, grouping and
		// cluster membership say who a node now belongs with, whereas region only
		// says roughly where it sits and is the coarsest thing this can notice.
		// Headline the ones that name a relationship when there are any.
		const ordered = [...change.nodes.moved].toSorted((a, b) => changeRank(a) - changeRank(b));
		const deliberate = ordered.filter((m) => changeRank(m) === 0);
		const subjects = (deliberate.length > 0 ? deliberate : ordered).map((m) => quoted(m.name));
		return `${list(subjects)} moved`;
	}
	if (change.significance === "cosmetic") {
		return "only appearance changed";
	}
	return "nothing this model can name changed";
}

/**
 *
 */
function describeFieldChanges(
	changes: Readonly<Record<string, DeepReadonly<FieldChange>>>,
	names?: Readonly<Record<string, string>>,
): string {
	// `cluster` and `clusterWith` hold node ids, and the empty case is the one
	// that matters most — a node on its own, which "[]" says badly.
	/**
	 *
	 */
	const named = (node: string): string => quoted(names?.[node] ?? node);
	/**
	 *
	 */
	const company = (value: unknown): string => {
		if (!Array.isArray(value)) {
			return encodeValue(value);
		}
		if (value.length === 0) {
			return "on its own";
		}
		const memberNames: string[] = [];
		for (const member of value as unknown[]) {
			memberNames.push(named(String(member)));
		}
		return `with ${memberNames.join(", ")}`;
	};
	const descriptions: string[] = [];
	for (const [field, change] of Object.entries(changes)) {
		descriptions.push(
			field === "cluster" || field === "clusterWith"
				? `sits ${company(change.to)} (was ${company(change.from)})`
				: `${field} ${encodeValue(change.from)} → ${encodeValue(change.to)}`,
		);
	}
	return descriptions.join("; ");
}

/*
 * The change as compact lines, for a reader with a token budget — a hook's
 * additional context, or an injected item. Nothing here is invented: every
 * line restates one field of the change.
 *
 * `maxChars` truncates by dropping whole lines and saying how many were
 * dropped, never by cutting a line in half. The full structure is always
 * available from the feed.
 */
/**
 *
 */
function narrateChange(change: DeepReadonly<SemanticChange>, maxChars = 1800): string {
	const lines: string[] = [];
	// Never print a node id: a synthetic one means nothing to a reader, and a
	// real one is not what anybody calls the box.
	/**
	 *
	 */
	const named = (node: string): string => quoted(change.names[node] ?? node);
	/**
	 *
	 */
	const namedList = (ids: readonly string[], limit = 3): string =>
		list(
			ids.map((node) => named(node)),
			limit,
		);

	for (const id of change.nodes.identity) {
		if (id.what === "promoted") {
			const was =
				id.from.anonymous && id.from.name.startsWith("an ")
					? `was ${id.from.name}`
					: `was a plain ${id.from.type} labelled "${id.from.name}"`;
			lines.push(
				`promoted ${quoted(id.to.name)}${id.to.kind !== undefined ? ` to a ${id.to.kind}` : ""}${id.to.binding !== undefined ? ` bound to ${id.to.binding}` : ""} (${was})`,
			);
		} else if (id.what === "demoted") {
			lines.push(`demoted ${quoted(id.from.name)} back to a plain ${id.to.type}`);
		} else {
			lines.push(`renamed the node ${quoted(id.from.name)} to ${quoted(id.to.name)}`);
		}
	}
	for (const node of change.nodes.added) {
		lines.push(
			`new ${node.kind ?? "node"} ${quoted(node.name)}${node.binding !== undefined ? ` bound to ${node.binding}` : ""}`,
		);
	}
	for (const node of change.nodes.removed) {
		lines.push(
			`${quoted(node.name)}${node.kind !== undefined ? ` (${node.kind})` : ""} was removed`,
		);
	}
	for (const node of change.nodes.changed) {
		lines.push(`${quoted(node.name)}: ${describeFieldChanges(node.changes, change.names)}`);
	}
	for (const edge of change.edges.added) {
		lines.push(
			`new edge ${quoted(edge.fromName)} → ${quoted(edge.toName)}${edge.label !== undefined ? ` ("${edge.label}")` : ""}`,
		);
	}
	for (const edge of change.edges.removed) {
		lines.push(`edge cut: ${quoted(edge.fromName)} → ${quoted(edge.toName)}`);
	}
	for (const r of change.edges.rerouted) {
		lines.push(
			`rerouted: ${quoted(r.anchorName)}'s edge ${r.end === "source" ? "from" : "to"} ${quoted(r.wasName)} now ${r.end === "source" ? "from" : "to"} ${quoted(r.nowName)}`,
		);
	}
	for (const edge of change.edges.changed) {
		lines.push(
			`edge ${quoted(edge.fromName)} → ${quoted(edge.toName)}: ${describeFieldChanges(edge.changes)}`,
		);
	}
	// One board-level line per cluster, but only a couple: a board that broke
	// into five clusters produces five entries describing the same event from
	// five sides, and the per-node "sits with" lines below say it better.
	for (const cl of change.layout.clusters.slice(0, 2)) {
		const parts: string[] = [];
		if (cl.joined.length > 0) {
			parts.push(`joined by ${namedList(cl.joined)}`);
		}
		if (cl.left.length > 0) {
			parts.push(`left by ${namedList(cl.left)}`);
		}
		lines.push(
			`cluster ${cl.kind}${parts.length > 0 ? `: ${parts.join(", ")}` : ""}${cl.sharedMembers.length > 0 ? ` (around ${namedList(cl.sharedMembers)})` : ""}`,
		);
	}
	if (change.layout.clusters.length > 2) {
		lines.push(
			`… and ${change.layout.clusters.length - 2} other cluster change(s) from the same rearrangement`,
		);
	}
	for (const g of change.layout.groups) {
		lines.push(
			`group ${g.kind}${g.joined.length > 0 ? `: +${namedList(g.joined)}` : ""}${g.left.length > 0 ? `: -${namedList(g.left)}` : ""}`,
		);
	}
	for (const m of change.nodes.moved) {
		lines.push(`${quoted(m.name)} moved: ${describeFieldChanges(m.changes, change.names)}`);
	}
	for (const rel of change.layout.relations.slice(0, 8)) {
		lines.push(`${named(rel.a)} is now ${rel.to} ${named(rel.b)} (was ${rel.from})`);
	}
	if (change.layout.relations.length > 8) {
		lines.push(`… and ${change.layout.relations.length - 8} other relative-position changes`);
	}

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

export { headlineFor, narrateChange };
