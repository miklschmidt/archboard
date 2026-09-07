import { DEFAULT_SHAPE_BACKGROUND } from "@/shared/appearance/appearance";
import type { ServerElement } from "@/runtime/engine/types";
import { CLUSTER_GAP, regionName } from "@/runtime/engine/layout";
import {
	KIND_ORDER,
	UNTYPED,
	counts,
	hasText,
	pairs,
	renderCounts,
} from "@/runtime/engine/lib/describe-scene-model";
import type { DeepReadonly, Edge, Folded, Item, NodeFold } from "@/runtime/engine/lib/describe-scene-model";

type SceneItem = DeepReadonly<Item>;
type SceneEdge = DeepReadonly<Edge>;

interface SceneBox {
	minX: number;
	minY: number;
	maxX: number;
	maxY: number;
}

/**
 *
 */
function appendStats(
	args: DeepReadonly<{
		allElements: ServerElement[];
		nodes: SceneItem[];
		edges: SceneEdge[];
		others: SceneItem[];
		folded: Folded;
		nodeFold: NodeFold;
		kindCounts: Record<string, number>;
		variantCounts: Record<string, number>;
		levelCounts: Record<string, number>;
		typeCounts: Record<string, number>;
		boundNodes: number;
		box: SceneBox;
	}>,
): readonly string[] {
	const lines: string[] = [];
	const {
		allElements,
		nodes,
		edges,
		others,
		folded,
		nodeFold,
		kindCounts,
		variantCounts,
		levelCounts,
		typeCounts,
		boundNodes,
		box,
	} = args;
	const composition = [
		`${nodes.length} node${nodes.length === 1 ? "" : "s"}`,
		`${edges.length} edge${edges.length === 1 ? "" : "s"}`,
		`${others.length} plain`,
	];
	if (folded.hidden.size > 0) {
		composition.push(
			`${folded.hidden.size} bound label${folded.hidden.size === 1 ? "" : "s"} folded in`,
		);
	}
	if (nodeFold.hidden > 0) {
		composition.push(`${nodeFold.hidden} node member${nodeFold.hidden === 1 ? "" : "s"} folded in`);
	}
	lines.push(`Total elements: ${allElements.length} (${composition.join(", ")})`);
	if (nodes.length > 0) {
		lines.push(`Kinds: ${renderCounts(kindCounts, KIND_ORDER)}`);
		const semantic: string[] = [];
		if (Object.keys(variantCounts).length > 0) {
			semantic.push(`Variants: ${renderCounts(variantCounts, ["current"])}`);
		}
		if (Object.keys(levelCounts).length > 0) {
			semantic.push(`Levels: ${renderCounts(levelCounts)}`);
		}
		semantic.push(`Bindings: ${boundNodes}/${nodes.length} bound to code`);
		lines.push(semantic.join(" | "));
	}
	lines.push(
		`Types: ${renderCounts(typeCounts)}`,
		`Bounding box: (${Math.round(box.minX)}, ${Math.round(box.minY)}) to (${Math.round(box.maxX)}, ${Math.round(box.maxY)}) = ${Math.round(box.maxX - box.minX)}x${Math.round(box.maxY - box.minY)}`,
	);
	return lines;
}

/**
 *
 */
function appendGraphNotes(
	nodes: readonly SceneItem[],
	edges: readonly SceneEdge[],
	degree: ReadonlyMap<string, DeepReadonly<{ in: number; out: number }>>,
): readonly string[] {
	const lines: string[] = [];
	if (edges.length >= 3 && nodes.length > 0) {
		const ranked = nodes
			.map((n) => ({ n, d: degree.get(n.el.id) ?? { in: 0, out: 0 } }))
			.filter((r) => r.d.in + r.d.out >= 3)
			.toSorted((a, b) => b.d.in + b.d.out - (a.d.in + a.d.out))
			.slice(0, 3);
		if (ranked.length > 0) {
			lines.push(
				`Most connected: ${ranked.map((r) => `${r.n.name} (${r.d.in} in, ${r.d.out} out)`).join(", ")}`,
			);
		}
	}
	const isolated = nodes.filter((n) => !degree.has(n.el.id));
	if (isolated.length > 0 && edges.length > 0) {
		const shown = isolated
			.slice(0, 8)
			.map((n) => n.name)
			.join(", ");
		lines.push(
			`Unconnected nodes (${isolated.length}): ${shown}${isolated.length > 8 ? ", …" : ""}`,
		);
	}
	return lines;
}

/**
 *
 */
function appendClusters(
	realClusters: readonly (readonly SceneItem[])[],
	clusters: readonly (readonly SceneItem[])[],
	box: SceneBox,
): readonly string[] {
	const lines: string[] = [];
	if (realClusters.length <= 1) {
		return lines;
	}
	lines.push("", `### Clusters (nodes within ${CLUSTER_GAP}px of each other)`);
	for (const cluster of realClusters.slice(0, 12)) {
		const cx = cluster.reduce((sum, n) => sum + n.x + n.w / 2, 0) / cluster.length;
		const cy = cluster.reduce((sum, n) => sum + n.y + n.h / 2, 0) / cluster.length;
		const kinds = renderCounts(counts(cluster.map((n) => n.meta.kind ?? UNTYPED)), KIND_ORDER);
		const names = cluster
			.slice(0, 8)
			.map((n) => n.name)
			.join(", ");
		lines.push(
			`  ${regionName(cx, cy, box)} (${cluster.length}): ${names}${cluster.length > 8 ? ", …" : ""} — ${kinds}`,
		);
	}
	const loose = clusters.filter((cluster) => cluster.length === 1);
	if (loose.length > 0) {
		lines.push(
			`  on their own (${loose.length}): ${loose
				.slice(0, 8)
				.map((cluster) => cluster[0]?.name ?? "unnamed")
				.join(", ")}${loose.length > 8 ? ", …" : ""}`,
		);
	}
	return lines;
}

/**
 *
 */
function geometry(i: SceneItem): string {
	const parts = [`at (${Math.round(i.x)}, ${Math.round(i.y)})`];
	if (i.w || i.h) {
		parts.push(`size ${Math.round(i.w)}x${Math.round(i.h)}`);
	}
	return parts.join(" | ");
}

/**
 *
 */
function nodeLine(n: SceneItem, showLevel: boolean): string {
	// Node identity leads: it is the join key across variants and boards, and
	// the only handle that survives a redraw.
	const parts = [`${hasText(n.meta.node) ? `<${n.meta.node}>` : `[${n.el.id}]`} "${n.name}"`];
	if (hasText(n.meta.node)) {
		parts.push(`element ${n.el.id}${n.members > 1 ? ` +${n.members - 1} more` : ""}`);
	}
	// The label is what the board shows and what a human points at; a declared
	// name only earns a mention when the two have diverged.
	if (hasText(n.meta.name) && hasText(n.labelText) && n.meta.name !== n.labelText) {
		parts.push(`declared "${n.meta.name}"`);
	}
	parts.push(hasText(n.meta.binding) ? `bound ${n.meta.binding}` : "unbound");
	if (hasText(n.meta.variant) && n.meta.variant !== "current") {
		parts.push(`variant ${n.meta.variant}`);
	}
	if (showLevel && hasText(n.meta.level)) {
		parts.push(`level ${n.meta.level}`);
	}
	parts.push(geometry(n), n.el.type);
	if (n.el.locked) {
		parts.push("(locked)");
	}
	return parts.join(" | ");
}

// Only the things the main line didn't already say.
/**
 *
 */
function nodeExtras(n: SceneItem): string {
	const parts: string[] = [];
	// The link is only worth a line when it says something the binding didn't:
	// a `file://` that just re-states the bound path is noise on every node.
	const { link } = n.el;
	const echoesBinding =
		hasText(link) &&
		((hasText(n.meta.binding) && link.includes(n.meta.binding)) ||
			(hasText(n.meta.bindingPath) && link.endsWith(n.meta.bindingPath)));
	if (hasText(link) && !echoesBinding) {
		parts.push(`link ${link}`);
	}
	if (Object.keys(n.meta.extra).length > 0) {
		parts.push(pairs(n.meta.extra));
	}
	if (Object.keys(n.meta.foreign).length > 0) {
		parts.push(`other customData: ${pairs(n.meta.foreign)}`);
	}
	if (n.el.groupIds.length > 0) {
		parts.push(`groups: [${n.el.groupIds.join(", ")}]`);
	}
	return parts.join(" | ");
}

/**
 *
 */
function plainLine(o: SceneItem): string {
	const { el } = o;
	const parts = [`[${el.id}] ${el.type}`, geometry(o)];
	if (el.type === "text" && hasText(el.text)) {
		parts.push(`text: "${el.text}"`);
	} else if (hasText(o.labelText)) {
		parts.push(`label: "${o.labelText}"`);
	}
	// A colour is worth a word only when someone chose it. The default fill is
	// on nearly every shape now (it is what makes them tappable), so printing it
	// would add a column of noise to the agent's main read path.
	if (
		el.backgroundColor &&
		el.backgroundColor !== "transparent" &&
		el.backgroundColor.toLowerCase() !== DEFAULT_SHAPE_BACKGROUND
	) {
		parts.push(`bg: ${el.backgroundColor}`);
	}
	if (hasText(el.strokeColor) && el.strokeColor !== "#000000") {
		parts.push(`stroke: ${el.strokeColor}`);
	}
	if (hasText(el.link)) {
		parts.push(`link: ${el.link}`);
	}
	if (Object.keys(o.meta.foreign).length > 0) {
		parts.push(`customData: ${pairs(o.meta.foreign)}`);
	}
	if (el.locked) {
		parts.push("(locked)");
	}
	if (el.groupIds.length > 0) {
		parts.push(`groups: [${el.groupIds.join(", ")}]`);
	}
	return parts.join(" | ");
}

// ---------------------------------------------------------------------------
// The one sentence an agent can speak verbatim
// ---------------------------------------------------------------------------

/**
 *
 */
function plural(n: number, word: string): string {
	const noun = word === "external" ? "external system" : word;
	if (n === 1) {
		return `1 ${noun}`;
	}
	return `${n} ${noun}${noun.endsWith("s") ? "" : "s"}`;
}

/**
 *
 */
function joinList(parts: readonly string[]): string {
	if (parts.length <= 1) {
		return parts[0] ?? "";
	}
	return `${parts.slice(0, -1).join(", ")} and ${parts.at(-1)}`;
}

/**
 *
 */
function summarise(
	s: DeepReadonly<{
		nodes: SceneItem[];
		others: SceneItem[];
		edges: SceneEdge[];
		kindCounts: Record<string, number>;
		typeCounts: Record<string, number>;
		clusters: number;
		boundNodes: number;
		total: number;
	}>,
): string {
	if (s.nodes.length === 0) {
		const kinds = renderCounts(s.typeCounts);
		return `no nodes yet — ${s.total} elements (${kinds}). Nothing on this canvas carries archboard metadata.`;
	}

	const kindOrder = Object.keys(s.kindCounts).toSorted((a, b) => {
		const ia = KIND_ORDER.indexOf(a),
			ib = KIND_ORDER.indexOf(b);
		if (ia !== ib) {
			return (ia === -1 ? 1e6 : ia) - (ib === -1 ? 1e6 : ib);
		}
		return (s.kindCounts[b] ?? 0) - (s.kindCounts[a] ?? 0);
	});
	const shownKinds = kindOrder.slice(0, 6).map((k) => plural(s.kindCounts[k] ?? 0, k));
	const hidden = kindOrder.length - 6;
	if (hidden > 0) {
		shownKinds.push(hidden === 1 ? "1 other kind" : `${hidden} other kinds`);
	}

	const clauses: string[] = [joinList(shownKinds)];
	if (s.clusters > 1) {
		clauses.push(`in ${s.clusters} clusters`);
	}
	clauses.push(
		s.edges.length > 0 ? `linked by ${plural(s.edges.length, "edge")}` : "with no edges drawn yet",
	);

	const notes: string[] = [];
	const unbound = s.nodes.length - s.boundNodes;
	if (unbound > 0) {
		notes.push(`${unbound} unbound`);
	}
	if (s.others.length > 0) {
		notes.push(`${plural(s.others.length, "plain element")} alongside`);
	}

	return `${clauses.join(" ")}${notes.length > 0 ? `; ${joinList(notes)}` : ""}.`;
}

// ---------------------------------------------------------------------------
// Selection — what a human has picked on the board
// ---------------------------------------------------------------------------
//
// Same read-path discipline as the scene description: an agent has to be able
// to re-narrate this in one spoken sentence ("you've got the two payment
// services selected"), so `summary` comes first and the per-element lines are
// the same ones `describe` uses.

/**
 *
 */
function selectionSummary(items: readonly SceneItem[], missing: number): string {
	if (items.length === 0 && missing === 0) {
		return "Nothing is selected on the board.";
	}

	const nodes = items.filter((i) => i.isNode);
	const plain = items.filter((i) => !i.isNode);
	/**
	 *
	 */
	const named = (list: readonly SceneItem[]): string =>
		joinList(list.slice(0, 6).map((i) => `"${i.name}"`)) +
		(list.length > 6 ? `, and ${list.length - 6} more` : "");

	const clauses: string[] = [];
	if (nodes.length > 0) {
		const kinds = renderCounts(counts(nodes.map((n) => n.meta.kind ?? UNTYPED)), KIND_ORDER);
		clauses.push(`${plural(nodes.length, "node")} (${kinds}) — ${named(nodes)}`);
	}
	if (plain.length > 0) {
		const withLabel = plain.filter((p) => p.labelText);
		const detail = withLabel.length > 0 ? ` — ${named(withLabel)}` : "";
		const plainTypes = counts(plain.map((p) => p.el.type));
		clauses.push(`${plural(plain.length, "plain element")} (${renderCounts(plainTypes)})${detail}`);
	}
	if (missing > 0) {
		clauses.push(`${missing} selected id${missing === 1 ? "" : "s"} not on the canvas`);
	}

	const total = items.length + missing;
	return `${plural(total, "element")} selected: ${joinList(clauses)}.`;
}

export {
	appendStats,
	appendGraphNotes,
	appendClusters,
	nodeLine,
	nodeExtras,
	plainLine,
	summarise,
	selectionSummary,
};
