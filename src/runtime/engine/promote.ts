import path from "node:path";
import type { ServerElement } from "@/runtime/engine/types";
import {
	DEFAULT_FILL_STYLE,
	DEFAULT_SHAPE_BACKGROUND,
	FILLABLE_TYPES,
	backgroundForKind,
	isTransparentBackground,
} from "@/shared/appearance/appearance";
import { extentOf } from "@/runtime/engine/geometry";
import { archboardBlock, nodeIdOf, nodeIdsOnBoard, readElementMetadata } from "@/runtime/engine/metadata";
import type { ArchboardBlock, LogicalAddress } from "@/runtime/engine/metadata";
import type {
	BindingOrigin,
	BindingRequest,
	BindingSource,
	ResolvedBinding,
} from "@/runtime/engine/lib/promotion-binding";
import { formatAddress, resolveBinding } from "@/runtime/engine/lib/promotion-binding";
import type { Kind } from "@/runtime/engine/lib/promotion-identity";
import {
	KINDS,
	normalizeKind,
	PromotionError,
	slugify,
	uniqueNodeId,
	validateNodeId,
} from "@/runtime/engine/lib/promotion-identity";

/**
 *
 */
const areaOf = (el: ServerElement): number => {
	const extent = extentOf(el);
	return extent.width * extent.height;
};

// Promotion declares selected elements as one semantic node. Metadata is
// merged under `customData.archboard` so unrelated custom data survives (ADR
// 0003). Any element may participate because stencils are arbitrary primitive
// sets, sometimes including connectors (TASK-053).

// Planning a promotion

interface PromotionRequest {
	// The elements to promote (selection or --ids).
	targets: ServerElement[];
	// Every board element, used for id uniqueness.
	board: ServerElement[];
	kind: Kind;
	name?: string;
	nodeId?: string;
	binding?: ResolvedBinding;
	// The variant of the board being promoted on, which is what a node promoted
	// there belongs to. Required, because there is no sensible guess: defaulting
	// it to `current` stamped every node on `payments@option-a` as belonging to
	// `payments`, and `compare` reported each one as a `variantAnomaly`
	// (TASK-040). The board is named on every call, so this is always knowable.
	boardVariant: string;
	// An override, for the rare promotion that means a variant other than the
	// board's own. Nothing has to pass it to be correct.
	variant?: string;
	level?: string;
	// Create one node per selected shape instead of one node for the selection.
	each?: boolean;
}

interface PlannedNode {
	node: string;
	kind: Kind;
	name: string;
	elementIds: string[];
	binding?: LogicalAddress;
	variant: string;
	level?: string;
}

interface ElementUpdate {
	id: string;
	customData: Record<string, unknown>;
	link?: string | null;
	backgroundColor?: string;
	fillStyle?: string;
}

interface PromotionPlan {
	nodes: PlannedNode[];
	updates: ElementUpdate[];
}

/**
 *
 */
function labelOf(el: ServerElement, board: ServerElement[]): string | undefined {
	const direct = el.type === "text" ? el.text : undefined;
	if (direct) {
		return String(direct);
	}
	// A labelled shape that came back through a frontend sync carries its label
	// as a separate bound text element.
	for (const other of board) {
		if (other.type === "text" && other.containerId === el.id) {
			const text = other.text ?? other.originalText;
			if (text) {
				return String(text);
			}
		}
	}
	return undefined;
}

// Bound labels are folded into their container by `describe`, so a shape plus
// its label is one thing, not two. Promotion has to agree: promoting a
// container promotes its label element too, and a label whose container is
// also selected never becomes a node of its own.
/**
 *
 */
function partition(
	targets: ServerElement[],
	board: ServerElement[],
): {
	shapes: ServerElement[];
	labelsByContainer: Map<string, ServerElement[]>;
} {
	const targetIds = new Set(targets.map((t) => t.id));
	const labelsByContainer = new Map<string, ServerElement[]>();
	for (const el of board) {
		if (
			el.type === "text" &&
			el.containerId &&
			el.containerId !== el.id &&
			targetIds.has(el.containerId)
		) {
			const container = el.containerId;
			const list = labelsByContainer.get(container) ?? [];
			list.push(el);
			labelsByContainer.set(container, list);
		}
	}
	/**
	 *
	 */
	const isFoldedLabel = (el: ServerElement): boolean =>
		el.type === "text" &&
		typeof el.containerId === "string" &&
		el.containerId.length > 0 &&
		targetIds.has(el.containerId);
	return { shapes: targets.filter((el) => !isFoldedLabel(el)), labelsByContainer };
}

// Promotion is where a box becomes a node, so it is also where the board gets
// to show that. Two jobs at once:
//
//  - hit-testing, for anything still transparent: a shape drawn before this
//    existed, or imported, is selectable only on its stroke (appearance.ts),
//    and a node with no selectable interior is hard to re-select and discuss.
//  - meaning: the kind's pastel makes a node look unlike a scratch box, which
//    is the one thing every node has and the thing a human reads at a glance.
//
// Applied only when nobody has expressed a preference — transparent, or still
// wearing the neutral default. A colour someone actually chose is never
// overwritten. Demotion deliberately does not undo it: reverting to
// transparent would take the interior hit-test away again.
/**
 *
 */
function fillFor(
	el: ServerElement,
	kind: Kind,
): Pick<ElementUpdate, "backgroundColor" | "fillStyle"> {
	if (!FILLABLE_TYPES.has(el.type)) {
		return {};
	}
	const current =
		typeof el.backgroundColor === "string" ? el.backgroundColor.toLowerCase() : undefined;
	const unchosen =
		isTransparentBackground(el.backgroundColor) || current === DEFAULT_SHAPE_BACKGROUND;
	if (!unchosen) {
		return {};
	}
	return { backgroundColor: backgroundForKind(kind), fillStyle: DEFAULT_FILL_STYLE };
}

/**
 *
 */
function mergedCustomData(el: ServerElement, block: ArchboardBlock): Record<string, unknown> {
	const existing = (
		el.customData && typeof el.customData === "object" ? el.customData : {}
	) as Record<string, unknown>;
	const previous = readElementMetadata(el).archboard ?? {};
	return { ...existing, archboard: { ...previous, ...block } };
}

// Branching a board: every node on the copy now belongs to the new variant.
//
// `board save --as payments@option-a` is how a proposal starts (TESTING.md),
// and it copies the elements verbatim, so without this every node would still
// record the variant it was promoted under. compare reads that disagreement as
// `variantAnomaly` — a node copied between variants and never re-promoted —
// and would report the whole board changed on the one workflow that is meant
// to leave it unchanged (TASK-035).
//
// Only the variant moves. The node id, kind, name and binding are what make
// the copy comparable with its origin, and rewriting any of them would sever
// the join the diff is built on. Elements that were never promoted are
// returned as they are, and so is every other `customData` key.
/**
 *
 */
function restampVariant(elements: ServerElement[], variant: string): ServerElement[] {
	return elements.map((el) => {
		const block = readElementMetadata(el).archboard;
		if (!block) {
			return el;
		}
		// A node, or something that has been stamped with a variant before.
		// Anything else is a plain element and has no variant to be wrong about.
		if (block.node === undefined && block.variant === undefined) {
			return el;
		}
		if (block.variant === variant) {
			return el;
		}
		return { ...el, customData: mergedCustomData(el, { variant }) };
	});
}

// One node from many elements, or one node per shape?
//
// Default: **one node from the whole selection**. A single promotion carries
// exactly one kind, one name, and one binding — one node's worth of meaning —
// and that matches the utterance it exists for ("map this to the payments
// service", said over however many boxes are lit up). Splitting one kind and
// one binding across five shapes would invent four bindings nobody stated.
//
// `each` covers the other real utterance — "these are all services" — where
// the shared thing is the kind and each shape keeps its own identity. A name
// or a binding is refused there, because those are per-node and the caller
// only supplied one.
/**
 *
 */
function planPromotion(request: PromotionRequest): PromotionPlan {
	const { targets, board, kind, binding } = request;
	if (targets.length === 0) {
		throw new PromotionError("Nothing to promote — no elements selected and no --ids given.");
	}

	const { shapes, labelsByContainer } = partition(targets, board);
	if (shapes.length === 0) {
		throw new PromotionError(
			"The selection is only bound labels — select the shapes they belong to.",
		);
	}

	// A node's variant is a fact about the board it sits on, not something the
	// caller has to state. `restampVariant` says the same thing for a branch.
	const variant = request.variant ?? request.boardVariant;
	// Ids belonging to the nodes we are about to (re)write are not "taken" — a
	// re-promotion keeps its node id rather than sliding to name-2.
	const rewriting = new Set(
		shapes.map((shape) => nodeIdOf(shape)).filter((id) => id !== undefined),
	);
	const taken = new Set([...nodeIdsOnBoard(board)].filter((id) => !rewriting.has(id)));

	const groups: { elements: ServerElement[]; name: string; nodeId?: string }[] = [];
	if (request.each) {
		if (request.name) {
			throw new PromotionError("--name promotes one node; drop it or drop --each.");
		}
		if (request.nodeId) {
			throw new PromotionError("--node names one node; drop it or drop --each.");
		}
		if (binding) {
			throw new PromotionError(
				"A binding belongs to one node; promote each shape separately, or drop --each.",
			);
		}
		for (const shape of shapes) {
			const label = labelOf(shape, board);
			if (!label) {
				throw new PromotionError(
					`--each derives a node id from each shape's label, and ${shape.id} has none. ` +
						`Label it, or promote the shapes one at a time with --name.`,
				);
			}
			groups.push({ elements: [shape, ...(labelsByContainer.get(shape.id) ?? [])], name: label });
		}
	} else {
		const elements: ServerElement[] = [];
		for (const shape of shapes) {
			elements.push(shape, ...(labelsByContainer.get(shape.id) ?? []));
		}
		// Name the node after whatever it already answers to: an explicit --name,
		// else the biggest labelled shape in the set (the one a human would read),
		// else the binding's file, else its existing node id.
		//
		// Biggest is measured, not read off `width` and `height`: a selection can
		// hold an arrow, whose stored size is the box round its path and whose
		// stored origin is its first point, so the untouched numbers can assign the
		// connector's label to the node instead of the box's label (TASK-038).
		const labelled = shapes
			.map((el) => ({ el, label: labelOf(el, board), area: areaOf(el) }))
			.filter((x) => x.label)
			.toSorted((a, b) => b.area - a.area);
		const fromBinding = binding
			? path.basename(binding.address.path).replace(/\.[^.]+$/u, "")
			: undefined;
		const declaredAlready = shapes
			.map((el) => readElementMetadata(el).archboard?.name)
			.find((name) => typeof name === "string" && name.length > 0);
		// A previously declared name outranks any inferred name.
		const name =
			request.name ??
			declaredAlready ??
			labelled[0]?.label ??
			fromBinding ??
			shapes.map((shape) => nodeIdOf(shape)).find((id) => id !== undefined);
		if (!name) {
			throw new PromotionError(
				"Cannot name this node: nothing selected has a label, and no --name, --node or --path was given.",
			);
		}
		groups.push({ elements, name, ...(request.nodeId ? { nodeId: request.nodeId } : {}) });
	}

	const nodes: PlannedNode[] = [];
	const updates: ElementUpdate[] = [];
	for (const group of groups) {
		const preferred =
			group.nodeId ?? group.elements.map(nodeIdOf).find(Boolean) ?? slugify(group.name);
		const node = uniqueNodeId(preferred, taken);
		taken.add(node);

		// `name` is only worth storing when it is not simply a copy of the label
		// the board already shows — a stored copy goes stale the moment a human
		// retypes the label, and the label is the board's truth.
		const primaryLabel = group.elements.map((el) => labelOf(el, board)).find(Boolean);
		const declared = group.name === primaryLabel ? undefined : group.name;

		const block: ArchboardBlock = {
			node,
			kind,
			...(declared ? { name: declared } : {}),
			variant,
			// Not defaulted from the board, unlike `variant` (ADR 0013). A node records a
			// level only to say it differs from its board, and `describe` shows one only
			// when a board's nodes carry more than one. Stamping every node with the
			// board's own level would remove the only thing the field says.
			...(request.level ? { level: request.level } : {}),
			...(binding ? { binding: binding.address } : {}),
		};

		for (const el of group.elements) {
			updates.push({
				id: el.id,
				customData: mergedCustomData(el, block),
				...fillFor(el, kind),
			});
		}

		nodes.push({
			node,
			kind,
			name: group.name,
			elementIds: group.elements.map((el) => el.id),
			...(binding ? { binding: binding.address } : {}),
			variant,
			...(request.level ? { level: request.level } : {}),
		});
	}

	return { nodes, updates };
}

// Demotion — promotion has to be reversible
//
// A node is a set of elements, so demotion works on whole nodes: select any
// member and the whole node comes back down. Only the `archboard` block is
// removed — another tool's `customData` is not ours to delete — and `link` is
// cleared only when it is the one our binding put there.

interface DemotionPlan {
	nodes: { node?: string; name?: string; elementIds: string[] }[];
	updates: ElementUpdate[];
}

/**
 *
 */
function planDemotion(targets: ServerElement[], board: ServerElement[]): DemotionPlan {
	if (targets.length === 0) {
		throw new PromotionError("Nothing to demote — no elements selected and no --ids given.");
	}

	const nodeIds = new Set(
		targets.map((target) => nodeIdOf(target)).filter((id) => id !== undefined),
	);
	const byId = new Map<string, ServerElement>();
	for (const el of targets) {
		if (readElementMetadata(el).archboard) {
			byId.set(el.id, el);
		}
	}
	// Pull in the rest of every touched node, wherever those elements sit.
	for (const el of board) {
		const id = nodeIdOf(el);
		if (id && nodeIds.has(id)) {
			byId.set(el.id, el);
		}
	}

	if (byId.size === 0) {
		throw new PromotionError("Nothing selected is a node — there is nothing to demote.");
	}

	const groups = new Map<string, ServerElement[]>();
	for (const el of byId.values()) {
		const key = nodeIdOf(el) ?? `element:${el.id}`;
		const list = groups.get(key) ?? [];
		list.push(el);
		groups.set(key, list);
	}

	const updates: ElementUpdate[] = [];
	const nodes: DemotionPlan["nodes"] = [];
	for (const [key, elements] of groups) {
		const first = elements.at(0);
		if (!first) {
			continue;
		}
		const block = readElementMetadata(first).archboard;
		// What to call it out loud: the declared name if there is one, else the
		// label the board shows.
		const spoken =
			typeof block?.name === "string"
				? block.name
				: elements.map((el) => labelOf(el, board)).find(Boolean);
		nodes.push({
			...(key.startsWith("element:") ? {} : { node: key }),
			...(spoken ? { name: spoken } : {}),
			elementIds: elements.map((el) => el.id),
		});
		for (const el of elements) {
			const custom = (
				el.customData && typeof el.customData === "object" ? el.customData : {}
			) as Record<string, unknown>;
			const { archboard: _archboard, ...rest } = custom;
			updates.push({
				id: el.id,
				customData: rest,
			});
		}
	}

	return { nodes, updates };
}

// Speakable results

/**
 *
 */
function promotionSummary(plan: PromotionPlan, note?: string): string {
	const lines: string[] = [];
	if (plan.nodes.length === 1) {
		const n = plan.nodes.at(0);
		if (!n) {
			return "";
		}
		const where = n.binding ? `bound to ${formatAddress(n.binding)}` : "unbound";
		const from = n.elementIds.length === 1 ? "1 element" : `${n.elementIds.length} elements`;
		lines.push(`Promoted ${from} to the ${n.kind} "${n.name}" (node ${n.node}), ${where}.`);
	} else {
		lines.push(
			`Promoted ${plan.nodes.length} elements to ${plan.nodes[0]?.kind ?? "node"}s: ${plan.nodes
				.map((n) => `"${n.name}" (${n.node})`)
				.join(", ")}.`,
		);
	}
	if (note) {
		lines.push(note);
	}
	return lines.join(" ");
}

/**
 *
 */
function demotionSummary(plan: DemotionPlan): string {
	const named = plan.nodes.map((n) => `"${n.name ?? n.node ?? "?"}"`).join(", ");
	const count = plan.updates.length;
	return (
		`Demoted ${plan.nodes.length === 1 ? "the node" : `${plan.nodes.length} nodes`} ${named} ` +
		`back to ${count === 1 ? "a plain element" : `${count} plain elements`}.`
	);
}

export {
	archboardBlock,
	demotionSummary,
	formatAddress,
	KINDS,
	labelOf,
	nodeIdOf,
	nodeIdsOnBoard,
	normalizeKind,
	planDemotion,
	planPromotion,
	PromotionError,
	promotionSummary,
	resolveBinding,
	restampVariant,
	slugify,
	uniqueNodeId,
	validateNodeId,
};
export type {
	ArchboardBlock,
	BindingOrigin,
	BindingRequest,
	BindingSource,
	DemotionPlan,
	ElementUpdate,
	Kind,
	LogicalAddress,
	PlannedNode,
	PromotionPlan,
	PromotionRequest,
	ResolvedBinding,
};
