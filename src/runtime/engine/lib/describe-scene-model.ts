import type { ServerElement } from "../types.js";
import { z } from "zod";
import { CLUSTER_GAP, boxOf, clusterBoxes } from "../layout.js";
import { readElementMetadata } from "../metadata.js";
import type { ArchboardBlock } from "../metadata.js";

const UnknownRecordSchema = z.record(z.string(), z.unknown());

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
// Metadata
// ---------------------------------------------------------------------------

const KIND_ORDER = ["gateway", "service", "queue", "datastore", "external"];

const UNTYPED = "untyped";

interface Meta {
	readonly isNode: boolean;
	// Stable node identity, distinct from the element id.
	readonly node?: string;
	// The raw path inside the binding, for link de-duping.
	readonly bindingPath?: string;
	readonly kind?: string;
	readonly binding?: string;
	readonly variant?: string;
	readonly level?: string;
	readonly name?: string;
	// Other keys inside the archboard block.
	readonly extra: Readonly<Record<string, unknown>>;
	// customData that is not owned by Archboard.
	readonly foreign: Readonly<Record<string, unknown>>;
}

function scalarText(v: unknown): string {
	if (typeof v === "string") {
		return v;
	}
	if (v === null || v === undefined) {
		return "";
	}
	try {
		const serialized = JSON.stringify(v);
		return serialized === undefined ? Object.prototype.toString.call(v) : serialized;
	} catch {
		return Object.prototype.toString.call(v);
	}
}

function pairs(o: Record<string, unknown>, max = 160): string {
	const s = Object.entries(o)
		.map(([k, v]) => `${k}=${scalarText(v)}`)
		.join(", ");
	return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

// A binding may be a bare path or a logical address (repo + path + branch +
// commit). Render both as one short string a person can read out.
function formatBinding(v: unknown): string | undefined {
	if (typeof v === "string") {
		const trimmed = v.trim();
		return trimmed.length === 0 ? undefined : trimmed;
	}
	const parsed = UnknownRecordSchema.safeParse(v);
	if (!parsed.success) {
		return undefined;
	}
	const b = parsed.data;
	const path = typeof b["path"] === "string" ? b["path"] : undefined;
	if ((path === undefined || path.length === 0) && b["repo"] === undefined) {
		const rendered = pairs(b);
		return rendered.length === 0 ? undefined : rendered;
	}
	const repo = typeof b["repo"] === "string" ? `${b["repo"]}:` : "";
	const branch = typeof b["branch"] === "string" ? `@${b["branch"]}` : "";
	const commit = typeof b["commit"] === "string" ? ` (${b["commit"].slice(0, 7)})` : "";
	return `${repo}${path ?? "?"}${branch}${commit}`;
}

function bindingPathOf(v: unknown): string | undefined {
	if (typeof v === "string") {
		const trimmed = v.trim();
		return trimmed.length === 0 ? undefined : trimmed;
	}
	const parsed = UnknownRecordSchema.safeParse(v);
	return parsed.success && typeof parsed.data["path"] === "string"
		? parsed.data["path"]
		: undefined;
}

function formatMeta(block: ArchboardBlock | undefined, foreign: Record<string, unknown>): Meta {
	const extra: Record<string, unknown> = {};
	if (!block) {
		return { isNode: false, extra, foreign };
	}
	let node: string | undefined;
	let kind: string | undefined;
	let variant: string | undefined;
	let level: string | undefined;
	let name: string | undefined;
	let binding: string | undefined;
	let bindingPath: string | undefined;

	for (const [k, v] of Object.entries(block)) {
		switch (k) {
			case "node": {
				node = scalarText(v) || undefined;
				break;
			}
			case "kind": {
				kind = scalarText(v) || undefined;
				break;
			}
			case "variant": {
				variant = scalarText(v) || undefined;
				break;
			}
			case "level": {
				level = scalarText(v) || undefined;
				break;
			}
			case "name": {
				name = scalarText(v) || undefined;
				break;
			}
			case "binding": {
				binding = formatBinding(v);
				bindingPath = bindingPathOf(v);
				break;
			}
			case "path": {
				if (binding === undefined || binding.length === 0) {
					binding = formatBinding(v);
					bindingPath = bindingPathOf(v);
				}
				break;
			}
			default: {
				extra[k] = v;
			}
		}
	}

	return {
		isNode: true,
		...(node === undefined ? {} : { node }),
		...(kind === undefined ? {} : { kind }),
		...(variant === undefined ? {} : { variant }),
		...(level === undefined ? {} : { level }),
		...(name === undefined ? {} : { name }),
		...(binding === undefined ? {} : { binding }),
		...(bindingPath === undefined ? {} : { bindingPath }),
		extra,
		foreign,
	};
}

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

// A connector is an arrow or a line that nobody promoted. Promotion is an
// explicit act, so an element carrying a node id is part of that node whatever
// its type: 74 of the 111 shipped stencils contain a line and 10 are made of
// nothing else, and a datastore promoted from one of those used to read as no
// node at all (TASK-053).
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

function foldBoundText(
	all: readonly DeepReadonly<ServerElement>[],
	byId: ReadonlyMap<string, DeepReadonly<ServerElement>>,
): Folded {
	const hidden = new Set<string>();
	const labelOf = new Map<string, string>();
	for (const el of all) {
		if (
			el.type === "text" &&
			hasText(el.containerId) &&
			byId.has(el.containerId) &&
			el.containerId !== el.id
		) {
			hidden.add(el.id);
			const text = hasText(el.text) ? el.text : el.originalText;
			if (hasText(text)) {
				labelOf.set(el.containerId, text);
			}
		}
	}
	return { hidden, labelOf };
}

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

// Reading order: top-to-bottom in coarse rows, then left-to-right.
const readingOrder = (a: DeepReadonly<Item>, b: DeepReadonly<Item>): number => {
	const row = Math.floor(a.y / 50) - Math.floor(b.y / 50);
	return row !== 0 ? row : a.x - b.x;
};

function foldNodes(items: readonly DeepReadonly<Item>[]): NodeFold {
	const groups = new Map<string, DeepReadonly<Item>[]>();
	for (const item of items) {
		if (!item.isNode || !hasText(item.meta.node)) {
			continue;
		}
		const list = groups.get(item.meta.node) ?? [];
		list.push(item);
		groups.set(item.meta.node, list);
	}

	const hidden = new Set<string>();
	const primaryOf = new Map<string, string>();
	const replacements = new Map<string, Item>();
	for (const group of groups.values()) {
		if (group.length < 2) {
			continue;
		}
		const [primary] = [...group].toSorted((a, b) => b.w * b.h - a.w * a.h || readingOrder(a, b));
		if (primary === undefined) {
			throw new Error("a folded node group unexpectedly had no primary element");
		}
		replacements.set(primary.el.id, { ...primary, members: group.length });
		for (const member of group) {
			primaryOf.set(member.el.id, primary.el.id);
			if (member !== primary) {
				hidden.add(member.el.id);
			}
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

function bindingOf(el: unknown, end: "start" | "end"): string | undefined {
	const parsedElement = UnknownRecordSchema.safeParse(el);
	const record = parsedElement.success ? parsedElement.data : {};
	const binding = end === "start" ? record["startBinding"] : record["endBinding"];
	const parsedBinding = UnknownRecordSchema.safeParse(binding);
	const bindingRecord = parsedBinding.success ? parsedBinding.data : {};
	const id = bindingRecord["elementId"];
	return typeof id === "string" ? id : undefined;
}

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

function renderCounts(c: Readonly<Record<string, number>>, order?: readonly string[]): string {
	const keys = Object.keys(c).toSorted((a, b) => {
		const ia = order ? order.indexOf(a) : -1;
		const ib = order ? order.indexOf(b) : -1;
		if (ia !== ib) {
			return (ia === -1 ? 1e6 : ia) - (ib === -1 ? 1e6 : ib);
		}
		return (c[b] ?? 0) - (c[a] ?? 0) || (a < b ? -1 : 1);
	});
	return keys.map((k) => `${k}(${c[k]})`).join(", ");
}

// ---------------------------------------------------------------------------
// Clustering — proximity is how a human states design intent on the board,
// so it has to survive into the read-back.
// ---------------------------------------------------------------------------

// The clustering itself lives in layout.ts, shared with `compare` so the two
// agree on what "together" means — a cluster the read-back names has to be the
// same cluster the diff says was split. Only the budget is local: below three
// nodes there is nothing worth saying, and above four hundred the pairwise pass
// is not worth its cost inside a description.
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
