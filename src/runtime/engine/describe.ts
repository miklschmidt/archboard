import type { ServerElement } from "@/runtime/engine/types";
import { boxOf } from "@/runtime/engine/layout";
import { semanticElementProjection } from "@/runtime/engine/metadata";
import { withoutValidBridgeDecorations } from "@/runtime/board-inspection/bridge";
import {
	KIND_ORDER,
	UNTYPED,
	bindingOf,
	clusterNodes,
	counts,
	foldBoundText,
	foldNodes,
	hasText,
	isConnector,
	readingOrder,
	renderCounts,
	toItem,
} from "@/runtime/engine/lib/describe-scene-model";
import type { Edge, Item } from "@/runtime/engine/lib/describe-scene-model";
import {
	appendClusters,
	appendGraphNotes,
	appendStats,
	nodeExtras,
	nodeLine,
	plainLine,
	selectionSummary,
	summarise,
} from "@/runtime/engine/lib/describe-lines";

// Build an AI-readable description of the current canvas.
// Above this, nodes lose their extras line.
const NODE_DETAIL_LIMIT = 60;
// Above this, nodes are counted rather than listed.
const NODE_LIST_LIMIT = 120;
const EDGE_LIST_LIMIT = 60;
const OTHER_LIST_LIMIT = 40;

/**
 *
 */
function nodeDetailLines(item: Item, showLevel: boolean, terse: boolean): readonly string[] {
	const line = `    ${nodeLine(item, showLevel)}`;
	const extra = terse ? "" : nodeExtras(item);
	return hasText(extra) ? [line, `        + ${extra}`] : [line];
}

/**
 *
 */
function describeScene(inputElements: readonly ServerElement[]): string {
	const allElements = withoutValidBridgeDecorations(
		inputElements.map((element) => semanticElementProjection(element)),
	);
	if (allElements.length === 0) {
		return "The canvas is empty. No elements to describe.";
	}

	const byId = new Map<string, ServerElement>();
	for (const el of allElements) {
		byId.set(el.id, el);
	}

	const folded = foldBoundText(allElements, byId);

	const allItems: Item[] = [];
	for (const el of allElements) {
		if (folded.hidden.has(el.id)) {
			continue;
		}
		allItems.push(toItem(el, folded));
	}

	const nodeFold = foldNodes(allItems);
	const { items } = nodeFold;

	const nodes = items.filter((i) => i.isNode).toSorted(readingOrder);
	const others = items.filter((i) => !i.isNode && !isConnector(i.el.type)).toSorted(readingOrder);
	// A promoted arrow or line is a node and nothing else, so it is not counted
	// here as well: the two loops have to divide the board, not overlap it.
	const connectors = items.filter((i) => !i.isNode && isConnector(i.el.type));
	// Names resolve for every element, folded members included, so an arrow
	// drawn to a member still names its node.
	const nameOf = new Map(allItems.map((i) => [i.el.id, i.name]));
	/**
	 *
	 */
	const primary = (id: string | undefined): string | undefined =>
		id === undefined || id.length === 0 ? id : (nodeFold.primaryOf.get(id) ?? id);

	// Bounding box over everything, and over what each element actually covers:
	// an arrow running leftwards or upwards falls outside its own stored
	// `x .. x + width`, so a box built from those numbers used to crop the board
	// it claims to frame (TASK-038).
	let minX = Infinity,
		minY = Infinity,
		maxX = -Infinity,
		maxY = -Infinity;
	for (const el of allElements) {
		const b = boxOf(el);
		minX = Math.min(minX, b.x);
		minY = Math.min(minY, b.y);
		maxX = Math.max(maxX, b.x + b.w);
		maxY = Math.max(maxY, b.y + b.h);
	}
	const box = { minX, minY, maxX, maxY };

	const typeCounts = counts(allElements.map((el) => el.type));
	const kindCounts = counts(nodes.map((n) => n.meta.kind ?? UNTYPED));
	const variantCounts = counts(nodes.map((n) => n.meta.variant));
	const levelCounts = counts(nodes.map((n) => n.meta.level));
	const boundNodes = nodes.filter((n) => hasText(n.meta.binding)).length;
	// Edges: arrows resolved to node names. Ids stay so callers that parse them
	// keep working.
	const edges: Edge[] = [];
	for (const item of connectors) {
		const el: unknown = item.el;
		const fromId = primary(bindingOf(el, "start"));
		const toId = primary(bindingOf(el, "end"));
		if (!hasText(fromId) && !hasText(toId)) {
			continue;
		}
		let label: string | undefined;
		if (hasText(item.labelText)) {
			label = item.labelText;
		} else if (hasText(item.meta.kind)) {
			label = item.meta.kind;
		}
		edges.push({
			arrow: item.el,
			...(hasText(fromId) ? { fromId } : {}),
			...(hasText(toId) ? { toId } : {}),
			fromName: hasText(fromId) ? (nameOf.get(fromId) ?? "?") : "?",
			toName: hasText(toId) ? (nameOf.get(toId) ?? "?") : "?",
			...(label === undefined ? {} : { label }),
		});
	}

	const degree = new Map<string, { in: number; out: number }>();
	/**
	 *
	 */
	const bump = (id: string | undefined, dir: "in" | "out"): void => {
		if (id === undefined || id.length === 0) {
			return;
		}
		const d = degree.get(id) ?? { in: 0, out: 0 };
		d[dir]++;
		degree.set(id, d);
	};
	for (const e of edges) {
		bump(e.fromId, "out");
		bump(e.toId, "in");
	}

	const clusters = clusterNodes(nodes);
	const realClusters = clusters.filter((c) => c.length > 1);

	// --- the narratable sentence ---------------------------------------------
	const lines: string[] = [
		"## Canvas Description",
		`Summary: ${summarise({
			nodes,
			others,
			edges,
			kindCounts,
			typeCounts,
			clusters: realClusters.length,
			boundNodes,
			total: allElements.length,
		})}`,
		...appendStats({
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
		}),
		...appendGraphNotes(nodes, edges, degree),
		...appendClusters(realClusters, clusters, box),
	];

	// --- nodes ----------------------------------------------------------------
	if (nodes.length > 0) {
		lines.push("", `### Nodes (${nodes.length})`);
		if (nodes.length > NODE_LIST_LIMIT) {
			lines.push(`  ${nodes.length} nodes — too many to list; use \`query\` for the full set.`);
			for (const kind of Object.keys(kindCounts).toSorted(
				(a, b) => KIND_ORDER.indexOf(a) - KIND_ORDER.indexOf(b),
			)) {
				const sample = nodes
					.filter((n) => (n.meta.kind ?? UNTYPED) === kind)
					.slice(0, 6)
					.map((n) => n.name);
				lines.push(
					`  ${kind} (${kindCounts[kind]}): ${sample.join(", ")}${(kindCounts[kind] ?? 0) > 6 ? ", …" : ""}`,
				);
			}
		} else {
			const terse = nodes.length > NODE_DETAIL_LIMIT;
			const showLevel = Object.keys(levelCounts).length > 1;
			const kinds = Object.keys(kindCounts).toSorted((a, b) => {
				const ia = KIND_ORDER.indexOf(a),
					ib = KIND_ORDER.indexOf(b);
				if (ia !== ib) {
					return (ia === -1 ? 1e6 : ia) - (ib === -1 ? 1e6 : ib);
				}
				return a < b ? -1 : 1;
			});
			for (const kind of kinds) {
				lines.push(`  ${kind} (${kindCounts[kind]}):`);
				for (const n of nodes.filter((x) => (x.meta.kind ?? UNTYPED) === kind)) {
					lines.push(...nodeDetailLines(n, showLevel, terse));
				}
			}
		}
	}

	// --- edges ----------------------------------------------------------------
	const looseConnectors = connectors.length - edges.length;
	if (edges.length > 0 || looseConnectors > 0) {
		lines.push("", `### Edges (${edges.length})`);
		for (const e of edges.slice(0, EDGE_LIST_LIMIT)) {
			const arrow = hasText(e.label) ? `--"${e.label}"-->` : "-->";
			lines.push(
				`  "${e.fromName}" ${arrow} "${e.toName}"   (${e.fromId ?? "?"} --> ${e.toId ?? "?"}, arrow: ${e.arrow.id})`,
			);
		}
		if (edges.length > EDGE_LIST_LIMIT) {
			lines.push(`  … and ${edges.length - EDGE_LIST_LIMIT} more edges`);
		}
		if (looseConnectors > 0) {
			lines.push(
				`  (${looseConnectors} unbound connector${looseConnectors === 1 ? "" : "s"} — drawn but attached to nothing)`,
			);
		}
	}

	// --- everything else ------------------------------------------------------
	if (others.length > 0) {
		lines.push("", `### Other elements (${others.length}) — no archboard metadata`);
		const rest = others;
		const notable = rest.filter(
			(o) => hasText(o.labelText) || hasText(o.el.link) || Object.keys(o.meta.foreign).length > 0,
		);
		const dull = rest.filter(
			(o) =>
				!(hasText(o.labelText) || hasText(o.el.link) || Object.keys(o.meta.foreign).length > 0),
		);
		const listAll = rest.length <= OTHER_LIST_LIMIT;
		const listed = listAll ? rest.toSorted(readingOrder) : notable.slice(0, OTHER_LIST_LIMIT);
		for (const o of listed) {
			lines.push(`  ${plainLine(o)}`);
		}
		const omitted = rest.length - listed.length;
		if (omitted > 0) {
			const omittedItems = listAll ? [] : [...notable.slice(OTHER_LIST_LIMIT), ...dull];
			const byType = renderCounts(counts(omittedItems.map((o) => o.el.type)));
			const lead = listed.length > 0 ? `… ${omitted} more` : `${omitted}`;
			lines.push(`  ${lead} unlabelled, not listed: ${byType}`);
		}
	}

	// --- groups (unchanged) ---------------------------------------------------
	const groupedElements = allElements.filter((el) => el.groupIds.length > 0);
	if (groupedElements.length > 0) {
		const groupMap: Record<string, string[]> = {};
		for (const el of groupedElements) {
			for (const gid of el.groupIds) {
				if (!groupMap[gid]) {
					groupMap[gid] = [];
				}
				groupMap[gid]?.push(el.id);
			}
		}
		lines.push("", "### Groups:");
		for (const [gid, ids] of Object.entries(groupMap)) {
			lines.push(`  Group ${gid}: [${ids.join(", ")}]`);
		}
	}

	return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Line rendering
// ---------------------------------------------------------------------------

interface SelectedElement {
	id: string;
	type: string;
	label?: string;
	// Carries archboard metadata and stands for an architectural unit.
	isNode: boolean;
	// Stable node identity, when promoted.
	node?: string;
	kind?: string;
	binding?: string;
	variant?: string;
	level?: string;
	link?: string | null;
	x: number;
	y: number;
	width: number;
	height: number;
}

interface SelectionReport {
	elementIds: string[];
	count: number;
	nodeCount: number;
	elements: SelectedElement[];
	// Selected ids for which the server has no element.
	missingIds: string[];
	clientId: string | null;
	at: string | null;
	browserClients: number;
	// One speakable line.
	summary: string;
	// Summary plus per-element detail.
	text: string;
}

/**
 *
 */
function selectedElement(item: Item): SelectedElement {
	return {
		id: item.el.id,
		type: item.el.type,
		...(hasText(item.labelText) ? { label: item.labelText } : {}),
		isNode: item.isNode,
		...(hasText(item.meta.node) ? { node: item.meta.node } : {}),
		...(hasText(item.meta.kind) ? { kind: item.meta.kind } : {}),
		...(hasText(item.meta.binding) ? { binding: item.meta.binding } : {}),
		...(hasText(item.meta.variant) ? { variant: item.meta.variant } : {}),
		...(hasText(item.meta.level) ? { level: item.meta.level } : {}),
		...(hasText(item.el.link) ? { link: item.el.link } : {}),
		x: item.x,
		y: item.y,
		width: item.w,
		height: item.h,
	};
}

// Build the selection read-out. `allElements` is the server's current scene —
// selection is stored as ids only, and the semantic detail is resolved here so
// the wire payload from the browser stays tiny.
/**
 *
 */
function buildSelectionReport(
	selection: {
		readonly elementIds: readonly string[];
		readonly clientId: string;
		readonly at: string;
	} | null,
	inputElements: readonly ServerElement[],
	browserClients: number,
): SelectionReport {
	const allElements = inputElements.map((element) => semanticElementProjection(element));
	const byId = new Map<string, ServerElement>();
	for (const el of allElements) {
		byId.set(el.id, el);
	}
	const folded = foldBoundText(allElements, byId);

	const ids = selection?.elementIds ?? [];
	const selected: Item[] = [];
	const missingIds: string[] = [];
	for (const id of ids) {
		const el = byId.get(id);
		if (!el) {
			missingIds.push(id);
			continue;
		}
		selected.push(toItem(el, folded));
	}
	// Fold multi-element nodes here too: picking all three pieces of one node
	// and saying "this" means one thing, and the summary has to agree.
	const { items } = foldNodes(selected);
	items.toSorted(readingOrder);

	const summary = selectionSummary(items, missingIds.length);
	const lines = [summary];
	const showLevel = new Set(items.map((i) => i.meta.level).filter(Boolean)).size > 1;
	for (const item of items) {
		lines.push(`  ${item.isNode ? nodeLine(item, showLevel) : plainLine(item)}`);
	}
	if (missingIds.length > 0) {
		lines.push(`  not on the canvas: ${missingIds.join(", ")}`);
	}
	if (selection) {
		lines.push(
			`Reported by browser client ${selection.clientId} at ${selection.at}` +
				` (${browserClients} browser client${browserClients === 1 ? "" : "s"} connected).`,
		);
	}

	return {
		elementIds: [...ids],
		count: ids.length,
		nodeCount: items.filter((i) => i.isNode).length,
		elements: items.map((item) => selectedElement(item)),
		missingIds,
		clientId: selection?.clientId ?? null,
		at: selection?.at ?? null,
		browserClients,
		summary,
		text: lines.join("\n"),
	};
}

// ---------------------------------------------------------------------------
// Naming a selection in a few words
// ---------------------------------------------------------------------------

/** What a selection is, in the fewest words that still identify it. */
interface SelectionNames {
	/** Selected ids the board has an element for, after folding. */
	count: number;
	nodeCount: number;
	/** Up to `max` of them, in reading order. */
	names: string[];
	/** How many named things `names` left out. */
	more: number;
	/** Selected ids with no element on the board. */
	missing: number;
}

/**
 * Name what is selected without describing it.
 *
 * `buildSelectionReport` answers "what did the human pick, in enough detail to
 * act on it"; this answers "what would you call it out loud" — which is all a
 * per-pane report needs, and is bounded no matter how much is selected. It goes
 * through the same folding as the full report (bound text into its container, a
 * multi-element node into one thing) so the two never disagree about how many
 * things are selected or what they are called.
 * @param ids selected element ids
 * @param allElements current board elements
 * @param max maximum number of names to return
 * @returns a bounded, speakable selection name summary
 */
function nameSelection(
	ids: readonly string[],
	allElements: readonly ServerElement[],
	max = 4,
): SelectionNames {
	const byId = new Map<string, ServerElement>();
	for (const el of allElements) {
		byId.set(el.id, el);
	}
	const folded = foldBoundText(allElements, byId);

	const selected: Item[] = [];
	let missing = 0;
	for (const id of ids) {
		const el = byId.get(id);
		if (!el) {
			missing += 1;
			continue;
		}
		selected.push(toItem(el, folded));
	}

	const { items } = foldNodes(selected);
	items.toSorted(readingOrder);

	const named = items.filter((i) => hasText(i.labelText) || hasText(i.meta.name));
	return {
		count: items.length,
		nodeCount: items.filter((i) => i.isNode).length,
		names: named.slice(0, max).map((i) => i.name),
		more: Math.max(0, named.length - max),
		missing,
	};
}

export {
	describeScene,
	type SelectedElement,
	type SelectionReport,
	buildSelectionReport,
	type SelectionNames,
	nameSelection,
};
