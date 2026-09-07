import type { ServerElement } from "@/runtime/engine/types";
import { z } from "zod";
import { CLUSTER_GAP, boxOf, clusterBoxes } from "@/runtime/engine/layout";
import { readElementMetadata } from "@/runtime/engine/metadata";
import {
	KIND_ORDER,
	type Meta,
	UNTYPED,
	formatMeta,
	pairs,
} from "@/runtime/engine/lib/describe-element-meta";

const UnknownRecordSchema = z.record(z.string(), z.unknown());

/**
 * Whether a value is text with something in it, which is what makes a name
 * or a label worth reading out.
 * @param value The value.
 * @returns True when it is non-empty text.
 */
function hasText(value: string | null | undefined): value is string {
	return value !== null && value !== undefined && value.length > 0;
}

type DeepReadonly<Value> = Value extends readonly unknown[]
	? { readonly [Key in keyof Value]: DeepReadonly<Value[Key]> }
	: Value extends object
		? { readonly [Key in keyof Value]: DeepReadonly<Value[Key]> }
		: Value;

// Build an AI-readable description of the current canvas.
//
// The governing constraint (DESIGN.md): the voice model never sees tool
// results, so whatever an agent reads here it has to re-narrate in one or two
// spoken sentences, inside a ~2,500 token turn-start budget. So this output is
// optimised for narratability, not completeness — semantic model first, summary
// before detail, per-element dumps degraded gracefully on big scenes.
//
// Vocabulary is CONTEXT.md's: an element carrying archboard metadata is a
// NODE (it stands for an architectural unit, has a kind, usually a binding to
// code, a variant and a level); an arrow between two nodes is an EDGE;
// everything else is just an element.

// ---------------------------------------------------------------------------
// Scene model
// ---------------------------------------------------------------------------

interface Item {
	readonly el: DeepReadonly<ServerElement>;
	readonly meta: Meta;
	// What to call the item out loud.
	readonly name: string;
	// A label, text value, or folded bound text.
	readonly labelText?: string;
	readonly isNode: boolean;
	// Elements making up this node; one unless folded below.
	readonly members: number;
	readonly x: number;
	readonly y: number;
	readonly w: number;
	readonly h: number;
}

interface Edge {
	readonly arrow: DeepReadonly<ServerElement>;
	fromId?: string;
	toId?: string;
	fromName: string;
	toName: string;
	label?: string;
}

/**
 * Whether an element type is one a connector is drawn with.
 *
 * A connector is an arrow or a line that nobody promoted. Promotion is an
 * explicit act, so an element carrying a node id is part of that node whatever
 * its type: 74 of the 111 shipped stencils contain a line and 10 are made of
 * nothing else, and a datastore promoted from one of those used to read as no
 * node at all (TASK-053).
 * @param t The element type.
 * @returns True for an arrow or a line.
 */
const isConnector = (t: string): boolean => t === "arrow" || t === "line";

// A labelled shape comes back from a frontend sync as a shape plus a separate
// text element. Fold the text into its container so one node reads as one
// thing — both for the whole-scene description and for a selection, where the
// human selected the container and the label lives on the child.
interface Folded {
	// Text elements folded away.
	readonly hidden: ReadonlySet<string>;
	// Container id to label text.
	readonly labelOf: ReadonlyMap<string, string>;
}

/**
 * Fold every bound label into the shape it belongs to.
 *
 * A labelled shape comes back from a frontend sync as a shape plus a separate
 * text element. Folding makes one node read as one thing — both for the
 * whole-scene description and for a selection, where the human selected the
 * container and the label lives on the child.
 * @param all The scene's elements.
 * @param byId The same elements by id.
 * @returns Which texts were folded away, and what each container now says.
 */
function foldBoundText(
	all: readonly DeepReadonly<ServerElement>[],
	byId: ReadonlyMap<string, DeepReadonly<ServerElement>>,
): Folded {
	const hidden = new Set<string>();
	const labelOf = new Map<string, string>();
	for (const el of all) {
		if (el.type !== "text") {
			continue;
		}
		const container = containerOf(el, byId);
		if (container === undefined) {
			continue;
		}
		hidden.add(el.id);
		const text = hasText(el.text) ? el.text : el.originalText;
		if (hasText(text)) {
			labelOf.set(container, text);
		}
	}
	return { hidden, labelOf };
}

/**
 * The shape one text element labels, when it labels one the scene holds.
 * @param el The text element.
 * @param byId The scene's elements by id.
 * @returns The container's id, or undefined when this is not a bound label.
 */
function containerOf(
	el: DeepReadonly<Extract<ServerElement, { type: "text" }>>,
	byId: ReadonlyMap<string, DeepReadonly<ServerElement>>,
): string | undefined {
	if (!hasText(el.containerId) || el.containerId === el.id) {
		return undefined;
	}
	return byId.has(el.containerId) ? el.containerId : undefined;
}

/**
 * One element as a description reads it: what it is called, whether it is a
 * node, and the box it occupies.
 * @param el The element.
 * @param folded The labels folded into their containers.
 * @returns The item.
 */
function toItem(el: ServerElement, folded: Folded): Item {
	const metadata = readElementMetadata(el);
	const meta = formatMeta(metadata.archboard, metadata.foreign);
	const { name: declaredName } = meta;
	const labelText = (el.type === "text" ? el.text : undefined) ?? folded.labelOf.get(el.id);
	let name = el.id;
	if (hasText(labelText)) {
		name = labelText;
	} else if (hasText(declaredName)) {
		name = declaredName;
	}
	return {
		el,
		meta,
		...(labelText === undefined ? {} : { labelText }),
		name,
		isNode: meta.isNode,
		members: 1,
		// Measured rather than read straight off the element: an arrow keeps its
		// size in its points, and its stored `x, y` is its first point, not its
		// top-left corner (layout.ts's boxOf).
		...boxOf(el),
	};
}

// A node can be several elements: promoting a multi-element selection gives
// every element in it the same node id. Fold them the same way bound labels
// are folded, so the read-back says one node rather than three — the primary
// is the largest element (the one a human points at) and the rest are its
// members.
interface NodeFold {
	// Items with folded members removed.
	readonly items: readonly Item[];
	readonly hidden: number;
	// Any member element id to its primary element id.
	readonly primaryOf: ReadonlyMap<string, string>;
}

/**
 * Reading order: top-to-bottom in coarse rows, then left-to-right, which is
 * the order a person's eye takes a board in.
 * @param a One item.
 * @param b The other.
 * @returns Negative when the first is read first.
 */
const readingOrder = (a: DeepReadonly<Item>, b: DeepReadonly<Item>): number => {
	const row = Math.floor(a.y / 50) - Math.floor(b.y / 50);
	return row !== 0 ? row : a.x - b.x;
};

/**
 * Fold the elements of one node into it.
 *
 * A node can be several elements: promoting a multi-element selection gives
 * every element in it the same node id. Folding them makes the read-back say
 * one node rather than three — the primary is the largest element, the one a
 * human points at, and the rest are its members.
 * @param items The scene's items.
 * @returns The items with members folded away, how many were folded, and
 * which primary each member belongs to.
 */
function foldNodes(items: readonly DeepReadonly<Item>[]): NodeFold {
	const hidden = new Set<string>();
	const primaryOf = new Map<string, string>();
	const replacements = new Map<string, Item>();
	for (const group of groupByNode(items).values()) {
		if (group.length > 1) {
			foldGroup(group, { hidden, primaryOf, replacements });
		}
	}

	return {
		items: items
			.filter((item) => !hidden.has(item.el.id))
			.map((item) => replacements.get(item.el.id) ?? item),
		hidden: hidden.size,
		primaryOf,
	};
}

/** What folding the elements of one node into it produced. */
interface FoldState {
	hidden: Set<string>;
	primaryOf: Map<string, string>;
	replacements: Map<string, Item>;
}

/**
 * The items of each node, by node id. An item that is not a node, or that
 * names none, belongs to no group.
 * @param items The scene's items.
 * @returns The items by node id.
 */
function groupByNode(items: readonly DeepReadonly<Item>[]): Map<string, DeepReadonly<Item>[]> {
	const groups = new Map<string, DeepReadonly<Item>[]>();
	for (const item of items) {
		const node = item.isNode ? item.meta.node : undefined;
		if (hasText(node)) {
			const list = groups.get(node) ?? [];
			list.push(item);
			groups.set(node, list);
		}
	}
	return groups;
}

/**
 * Fold one node's elements into its primary: the largest, which is the one a
 * human points at, with the reading order breaking a tie.
 * @param group The node's items.
 * @param state What the fold has found so far, extended in place.
 * @throws {Error} When the group is empty, which its caller has ruled out.
 */
function foldGroup(group: readonly DeepReadonly<Item>[], state: FoldState): void {
	const [primary] = [...group].toSorted((a, b) => b.w * b.h - a.w * a.h || readingOrder(a, b));
	if (primary === undefined) {
		throw new Error("a folded node group unexpectedly had no primary element");
	}
	state.replacements.set(primary.el.id, { ...primary, members: group.length });
	for (const member of group) {
		state.primaryOf.set(member.el.id, primary.el.id);
		if (member !== primary) {
			state.hidden.add(member.el.id);
		}
	}
}

/**
 * The element one end of a connector is bound to.
 * @param el The connector.
 * @param end Which end.
 * @returns The element's id, or undefined when the end is bound to nothing.
 */
function bindingOf(el: unknown, end: "start" | "end"): string | undefined {
	const parsedElement = UnknownRecordSchema.safeParse(el);
	const record = parsedElement.success ? parsedElement.data : {};
	const binding = end === "start" ? record["startBinding"] : record["endBinding"];
	const parsedBinding = UnknownRecordSchema.safeParse(binding);
	const bindingRecord = parsedBinding.success ? parsedBinding.data : {};
	const id = bindingRecord["elementId"];
	return typeof id === "string" ? id : undefined;
}

/**
 * How many times each value appears, which is how a description says "three
 * services and a datastore".
 * @param values The values, where anything unstated is skipped.
 * @returns The count by value.
 */
function counts(values: readonly (string | undefined)[]): Record<string, number> {
	const out: Record<string, number> = {};
	for (const v of values) {
		if (v === undefined) {
			continue;
		}
		out[v] = (out[v] ?? 0) + 1;
	}
	return out;
}

/**
 * Counts as text, most interesting first: the caller's own order where it
 * gives one, then by how many there are, then alphabetically.
 * @param c The counts.
 * @param order The order the caller wants the known values in.
 * @returns The counts as `value(n)` pairs.
 */
function renderCounts(c: Readonly<Record<string, number>>, order?: readonly string[]): string {
	const keys = Object.keys(c).toSorted((a, b) => compareCounted(a, b, c, order));
	return keys.map((k) => `${k}(${c[k]})`).join(", ");
}

/**
 * Which of two counted values is said first.
 * @param a One value.
 * @param b The other.
 * @param c The counts.
 * @param order The order the caller wants the known values in.
 * @returns Negative when the first is said first.
 */
function compareCounted(
	a: string,
	b: string,
	c: Readonly<Record<string, number>>,
	order?: readonly string[],
): number {
	const ranked = rankIn(a, order) - rankIn(b, order);
	if (ranked !== 0) {
		return ranked;
	}
	return (c[b] ?? 0) - (c[a] ?? 0) || (a < b ? -1 : 1);
}

/**
 * Where one value sits in the caller's order; anything it does not name comes
 * after everything it does.
 * @param value The value.
 * @param order The order.
 * @returns Its rank.
 */
function rankIn(value: string, order?: readonly string[]): number {
	const at = order?.indexOf(value) ?? -1;
	return at === -1 ? 1e6 : at;
}

// ---------------------------------------------------------------------------
// Clustering — proximity is how a human states design intent on the board,
// so it has to survive into the read-back.
// ---------------------------------------------------------------------------

/**
 * Which nodes sit together, which is how a human states design intent on the
 * board and therefore has to survive into the read-back.
 *
 * The clustering itself lives in layout.ts, shared with `compare` so the two
 * agree on what "together" means — a cluster the read-back names has to be the
 * same cluster the diff says was split. Only the budget is local: below three
 * nodes there is nothing worth saying, and above four hundred the pairwise
 * pass is not worth its cost inside a description.
 * @param nodes The scene's nodes.
 * @returns The clusters, or none when the scene is too small or too large to
 * say anything useful about.
 */
function clusterNodes(nodes: DeepReadonly<Item>[]): readonly (readonly DeepReadonly<Item>[])[] {
	if (nodes.length < 3 || nodes.length > 400) {
		return [];
	}
	return clusterBoxes(nodes, CLUSTER_GAP);
}

// ---------------------------------------------------------------------------
// Detail budgets — a 200-element scene must still be readable aloud.
// ---------------------------------------------------------------------------

export {
	type DeepReadonly,
	hasText,
	KIND_ORDER,
	UNTYPED,
	type Meta,
	type Item,
	type Edge,
	isConnector,
	type Folded,
	foldBoundText,
	toItem,
	type NodeFold,
	foldNodes,
	bindingOf,
	counts,
	pairs,
	renderCounts,
	readingOrder,
	clusterNodes,
};
