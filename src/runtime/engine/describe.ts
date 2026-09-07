import type { ServerElement } from "@/runtime/engine/types";
import { boxOf } from "@/runtime/engine/layout";
import { semanticElementProjection } from "@/runtime/engine/metadata";
import { withoutValidBridgeDecorations } from "@/runtime/board-inspection/bridge";
import {
	UNTYPED,
	clusterNodes,
	counts,
	foldBoundText,
	foldNodes,
	hasText,
	isConnector,
	readingOrder,
	toItem,
} from "@/runtime/engine/lib/describe-scene-model";
import type { Edge, Item } from "@/runtime/engine/lib/describe-scene-model";
import {
	appendClusters,
	appendGraphNotes,
	appendStats,
	nodeLine,
	plainLine,
	selectionSummary,
	summarise,
} from "@/runtime/engine/lib/describe-lines";
import { degreesOf, edgesFrom } from "@/runtime/engine/lib/describe-graph";
import {
	edgesSection,
	groupsSection,
	nodesSection,
	othersSection,
} from "@/runtime/engine/lib/describe-sections";

// Build an AI-readable description of the current canvas.
/**
 * The whole board as an agent reads it: the one sentence first, then the
 * numbers, then the nodes, edges and plain elements.
 * @param inputElements The board's elements.
 * @returns The description.
 */
function describeScene(inputElements: readonly ServerElement[]): string {
	const allElements = withoutValidBridgeDecorations(
		inputElements.map((element) => semanticElementProjection(element)),
	);
	if (allElements.length === 0) {
		return "The canvas is empty. No elements to describe.";
	}
	const scene = buildScene(allElements);
	const showLevel = Object.keys(scene.levelCounts).length > 1;
	return [
		"## Canvas Description",
		`Summary: ${summarise(summaryOf(scene))}`,
		...appendStats(statsOf(scene)),
		...appendGraphNotes(scene.nodes, scene.edges, scene.degree),
		...appendClusters(scene.realClusters, scene.clusters, scene.box),
		...nodesSection(scene.nodes, scene.kindCounts, showLevel),
		...edgesSection(scene.edges, scene.connectors.length - scene.edges.length),
		...othersSection(scene.others),
		...groupsSection(allElements),
	].join("\n");
}

/** The board as a description reads it, before any of it is written out. */
interface Scene {
	allElements: ServerElement[];
	nodes: Item[];
	others: Item[];
	connectors: Item[];
	edges: Edge[];
	degree: Map<string, { in: number; out: number }>;
	clusters: readonly (readonly Item[])[];
	realClusters: readonly (readonly Item[])[];
	folded: ReturnType<typeof foldBoundText>;
	nodeFold: ReturnType<typeof foldNodes>;
	kindCounts: Record<string, number>;
	variantCounts: Record<string, number>;
	levelCounts: Record<string, number>;
	typeCounts: Record<string, number>;
	boundNodes: number;
	box: { minX: number; minY: number; maxX: number; maxY: number };
}

/**
 * Read the board once: fold its labels and node members, sort what is left
 * into nodes, connectors and everything else, and count what a description
 * says about them.
 * @param allElements The board's elements.
 * @returns The scene.
 */
function buildScene(allElements: ServerElement[]): Scene {
	const byId = new Map(allElements.map((el) => [el.id, el]));
	const folded = foldBoundText(allElements, byId);
	const allItems = allElements
		.filter((el) => !folded.hidden.has(el.id))
		.map((el) => toItem(el, folded));
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
	const edges = edgesFrom(connectors, nodeFold, nameOf);
	const clusters = clusterNodes(nodes);
	return {
		allElements,
		nodes,
		others,
		connectors,
		edges,
		degree: degreesOf(edges),
		clusters,
		realClusters: clusters.filter((c) => c.length > 1),
		folded,
		nodeFold,
		kindCounts: counts(nodes.map((n) => n.meta.kind ?? UNTYPED)),
		variantCounts: counts(nodes.map((n) => n.meta.variant)),
		levelCounts: counts(nodes.map((n) => n.meta.level)),
		typeCounts: counts(allElements.map((el) => el.type)),
		boundNodes: nodes.filter((n) => hasText(n.meta.binding)).length,
		box: sceneBox(allElements),
	};
}

/**
 * The box every element on the board sits in.
 *
 * Measured over what each element actually covers: an arrow running leftwards
 * or upwards falls outside its own stored `x .. x + width`, so a box built
 * from those numbers used to crop the board it claims to frame (TASK-038).
 * @param allElements The board's elements.
 * @returns The box.
 */
function sceneBox(allElements: readonly ServerElement[]): {
	minX: number;
	minY: number;
	maxX: number;
	maxY: number;
} {
	let minX = Infinity;
	let minY = Infinity;
	let maxX = -Infinity;
	let maxY = -Infinity;
	for (const el of allElements) {
		const b = boxOf(el);
		minX = Math.min(minX, b.x);
		minY = Math.min(minY, b.y);
		maxX = Math.max(maxX, b.x + b.w);
		maxY = Math.max(maxY, b.y + b.h);
	}
	return { minX, minY, maxX, maxY };
}

/**
 * What the one-sentence summary is counted from.
 * @param scene The board as the description read it.
 * @returns The counts the summary needs.
 */
function summaryOf(scene: Scene): Parameters<typeof summarise>[0] {
	return {
		nodes: scene.nodes,
		others: scene.others,
		edges: scene.edges,
		kindCounts: scene.kindCounts,
		typeCounts: scene.typeCounts,
		clusters: scene.realClusters.length,
		boundNodes: scene.boundNodes,
		total: scene.allElements.length,
	};
}

/**
 * What the numbers at the top of the description are counted from.
 * @param scene The board as the description read it.
 * @returns The counts the statistics need.
 */
function statsOf(scene: Scene): Parameters<typeof appendStats>[0] {
	return {
		allElements: scene.allElements,
		nodes: scene.nodes,
		edges: scene.edges,
		others: scene.others,
		folded: scene.folded,
		nodeFold: scene.nodeFold,
		kindCounts: scene.kindCounts,
		variantCounts: scene.variantCounts,
		levelCounts: scene.levelCounts,
		typeCounts: scene.typeCounts,
		boundNodes: scene.boundNodes,
		box: scene.box,
	};
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
 * One selected element as the report holds it: enough to act on without
 * reading the board.
 * @param item The element.
 * @returns The report's entry.
 */
function selectedElement(item: Item): SelectedElement {
	return {
		id: item.el.id,
		type: item.el.type,
		isNode: item.isNode,
		...statedText(item),
		x: item.x,
		y: item.y,
		width: item.w,
		height: item.h,
	};
}

// What a selected element says about itself, and where each of those things
// is read from.
const SELECTED_TEXT_FIELDS = [
	["label", (item: Item): string | null | undefined => item.labelText],
	["node", (item: Item): string | null | undefined => item.meta.node],
	["kind", (item: Item): string | null | undefined => item.meta.kind],
	["binding", (item: Item): string | null | undefined => item.meta.binding],
	["variant", (item: Item): string | null | undefined => item.meta.variant],
	["level", (item: Item): string | null | undefined => item.meta.level],
	["link", (item: Item): string | null | undefined => item.el.link],
] as const;

/**
 * The text fields a selected element states, each left out where it says
 * nothing.
 * @param item The element.
 * @returns The fields it states.
 */
function statedText(item: Item): Partial<SelectedElement> {
	const stated: Record<string, string> = {};
	for (const [name, read] of SELECTED_TEXT_FIELDS) {
		const value = read(item);
		if (hasText(value)) {
			stated[name] = value;
		}
	}
	return stated;
}

// Build the selection read-out. `allElements` is the server's current scene —
// selection is stored as ids only, and the semantic detail is resolved here so
// the wire payload from the browser stays tiny.
/**
 * What the human has picked, in enough detail to act on.
 * @param selection What the pane reported picking, when it reported anything.
 * @param inputElements The board's elements.
 * @param browserClients How many browsers are connected, which is what makes
 * an empty selection meaningful rather than unknown.
 * @returns The report.
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
	const byId = new Map(allElements.map((el) => [el.id, el]));
	const ids = selection?.elementIds ?? [];
	const missingIds = ids.filter((id) => !byId.has(id));
	// Fold multi-element nodes here too: picking all three pieces of one node
	// and saying "this" means one thing, and the summary has to agree.
	const { items } = foldNodes(selectedItems(ids, byId, allElements));
	const summary = selectionSummary(items, missingIds.length);
	const lines = [
		summary,
		...selectedLines(items),
		...missingLine(missingIds),
		...reportedBy(selection, browserClients),
	];
	return {
		elementIds: [...ids],
		count: ids.length,
		nodeCount: items.filter((i) => i.isNode).length,
		elements: items.map((item) => selectedElement(item)),
		missingIds,
		...reporter(selection),
		browserClients,
		summary,
		text: lines.join("\n"),
	};
}

/**
 * The selected ids the board no longer holds, named so a caller can see which.
 * @param missingIds The ids.
 * @returns The line, or none.
 */
function missingLine(missingIds: readonly string[]): string[] {
	return missingIds.length > 0 ? [`  not on the canvas: ${missingIds.join(", ")}`] : [];
}

/**
 * Who reported the selection and when, as the report holds them.
 * @param selection What the pane reported, when it reported anything.
 * @returns The reporter fields.
 */
function reporter(
	selection: { readonly clientId: string; readonly at: string } | null,
): Pick<SelectionReport, "clientId" | "at"> {
	return { clientId: selection?.clientId ?? null, at: selection?.at ?? null };
}

/**
 * The selected elements, as the description's own items.
 * @param ids What the pane reported picking.
 * @param byId The board's elements by id.
 * @param allElements The board's elements, for the label folding.
 * @returns The items, skipping ids the board no longer holds.
 */
function selectedItems(
	ids: readonly string[],
	byId: ReadonlyMap<string, ServerElement>,
	allElements: readonly ServerElement[],
): Item[] {
	const folded = foldBoundText(allElements, byId);
	return ids.flatMap((id) => {
		const el = byId.get(id);
		return el ? [toItem(el, folded)] : [];
	});
}

/**
 * The selected elements, one line each, in the same words a description of
 * the whole board would use.
 * @param items The selected elements, folded.
 * @returns The lines.
 */
function selectedLines(items: readonly Item[]): string[] {
	const showLevel = new Set(items.map((i) => i.meta.level).filter(Boolean)).size > 1;
	return items.map((item) => `  ${item.isNode ? nodeLine(item, showLevel) : plainLine(item)}`);
}

/**
 * Who reported the selection and when, which is what makes an empty one
 * meaningful rather than unknown.
 * @param selection What the pane reported, when it reported anything.
 * @param browserClients How many browsers are connected.
 * @returns The line, or none when nothing was reported.
 */
function reportedBy(
	selection: { readonly clientId: string; readonly at: string } | null,
	browserClients: number,
): string[] {
	if (!selection) {
		return [];
	}
	return [
		`Reported by browser client ${selection.clientId} at ${selection.at}` +
			` (${browserClients} browser client${browserClients === 1 ? "" : "s"} connected).`,
	];
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
