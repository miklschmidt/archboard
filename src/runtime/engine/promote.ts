import type { ServerElement } from "@/runtime/engine/types";
import {
	DEFAULT_FILL_STYLE,
	DEFAULT_SHAPE_BACKGROUND,
	FILLABLE_TYPES,
	backgroundForKind,
	isTransparentBackground,
} from "@/shared/appearance/appearance";
import {
	archboardBlock,
	nodeIdOf,
	nodeIdsOnBoard,
	readElementMetadata,
} from "@/runtime/engine/metadata";
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
import type { PromotionGroup } from "@/runtime/engine/lib/promotion-grouping";
import {
	groupForSelection,
	groupsPerShape,
	labelOf,
	partition,
	refuseSingleNodeFlags,
} from "@/runtime/engine/lib/promotion-grouping";
import { isRecord } from "@/runtime/engine/lib/unknown-record";

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
 * The fill a promoted element takes on, where nobody has chosen one for it.
 * @param el The element.
 * @param kind What the node is, which decides the pastel.
 * @returns The colour fields to write, or nothing when a person picked the
 * colour or the shape cannot be filled.
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
 * One element's custom data with archboard's block merged into it, so metadata
 * another tool wrote survives the promotion (ADR 0003).
 * @param el The element.
 * @param block What the promotion declares about the node.
 * @returns The merged custom data.
 */
function mergedCustomData(el: ServerElement, block: ArchboardBlock): Record<string, unknown> {
	const existing = isRecord(el.customData) ? el.customData : {};
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
 * Every node on a copied board, restamped as belonging to the new variant.
 * @param elements The copy's elements.
 * @param variant The variant they now belong to.
 * @returns The elements, with nothing but the variant moved.
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

/**
 * How the selection divides into nodes: one per shape when the caller asked
 * for that with `--each`, else one node made of the whole thing.
 * @param request What the caller asked for.
 * @param shapes The shapes being promoted.
 * @param labelsByContainer Each shape's bound labels.
 * @returns The groups, one per node the promotion will declare.
 * @throws {PromotionError} When the flags contradict the division, or nothing
 * names a node.
 */
function groupsFor(
	request: PromotionRequest,
	shapes: readonly ServerElement[],
	labelsByContainer: ReadonlyMap<string, ServerElement[]>,
): PromotionGroup[] {
	if (!request.each) {
		return [groupForSelection(shapes, labelsByContainer, request.board, request)];
	}
	refuseSingleNodeFlags(request);
	return groupsPerShape(shapes, labelsByContainer, request.board);
}

/**
 * The node ids a promotion may not take.
 *
 * Ids belonging to the nodes it is about to rewrite do not count as taken: a
 * re-promotion keeps its node id rather than sliding along to name-2.
 * @param shapes The shapes being promoted.
 * @param board Every element on the board.
 * @returns The ids already spoken for by somebody else.
 */
function takenIds(shapes: readonly ServerElement[], board: ServerElement[]): Set<string> {
	const rewriting = new Set(
		shapes.map((shape) => nodeIdOf(shape)).filter((id) => id !== undefined),
	);
	return new Set([...nodeIdsOnBoard(board)].filter((id) => !rewriting.has(id)));
}

/**
 * The node id a group would prefer: one the caller named, else the one it
 * already carries, else a slug of its name.
 * @param group The node's elements, and what it is called.
 * @returns The preferred id, before uniqueness is enforced.
 */
function preferredIdFor(group: PromotionGroup): string {
	return group.nodeId ?? group.elements.map(nodeIdOf).find(Boolean) ?? slugify(group.name);
}

/**
 * The name a node stores, which is worth storing only when it is not simply a
 * copy of the label the board already shows: a stored copy goes stale the
 * moment a human retypes the label, and the label is the board's truth.
 * @param group The node's elements, and what it is called.
 * @param board Every element on the board, for the labels.
 * @returns The `name` field, or nothing at all.
 */
function declaredNameOf(group: PromotionGroup, board: ServerElement[]): { name?: string } {
	const primaryLabel = group.elements.map((el) => labelOf(el, board)).find(Boolean);
	return group.name === primaryLabel ? {} : { name: group.name };
}

/**
 * One node, and the element writes that declare it.
 * @param group The node's elements, and what it is called.
 * @param request What the caller asked for.
 * @param taken The ids already spoken for; this node's id is added to it.
 * @returns The node as the caller will hear it, and the element updates.
 */
function planNode(
	group: PromotionGroup,
	request: PromotionRequest,
	taken: Set<string>,
): { node: PlannedNode; updates: ElementUpdate[] } {
	const { board, kind, binding } = request;
	// A node's variant is a fact about the board it sits on, not something the
	// caller has to state. `restampVariant` says the same thing for a branch.
	const variant = request.variant ?? request.boardVariant;
	// Not defaulted from the board, unlike `variant` (ADR 0013). A node records
	// a level only to say it differs from its board, and `describe` shows one
	// only when a board's nodes carry more than one. Stamping every node with
	// the board's own level would remove the only thing the field says.
	const level = request.level ? { level: request.level } : {};
	const bound = binding ? { binding: binding.address } : {};
	const node = uniqueNodeId(preferredIdFor(group), taken);
	taken.add(node);
	const block: ArchboardBlock = {
		node,
		kind,
		...declaredNameOf(group, board),
		variant,
		...level,
		...bound,
	};
	return {
		node: {
			node,
			kind,
			name: group.name,
			elementIds: group.elements.map((el) => el.id),
			...bound,
			variant,
			...level,
		},
		updates: group.elements.map((el) => ({
			id: el.id,
			customData: mergedCustomData(el, block),
			...fillFor(el, kind),
		})),
	};
}

/**
 * What promoting one selection would do, without touching the board.
 * @param request The elements, the board they sit on, and what the caller said
 * they are.
 * @returns The nodes the promotion would declare and the element writes that
 * declare them.
 * @throws {PromotionError} When the selection cannot become a node.
 */
function planPromotion(request: PromotionRequest): PromotionPlan {
	const { targets, board } = request;
	if (targets.length === 0) {
		throw new PromotionError("Nothing to promote — no elements selected and no --ids given.");
	}
	const { shapes, labelsByContainer } = partition(targets, board);
	if (shapes.length === 0) {
		throw new PromotionError(
			"The selection is only bound labels — select the shapes they belong to.",
		);
	}
	const taken = takenIds(shapes, board);
	const nodes: PlannedNode[] = [];
	const updates: ElementUpdate[] = [];
	for (const group of groupsFor(request, shapes, labelsByContainer)) {
		const planned = planNode(group, request, taken);
		nodes.push(planned.node);
		updates.push(...planned.updates);
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
 * Whether one element belongs to a node the demotion is taking down.
 * @param el The element.
 * @param nodeIds The nodes being demoted.
 * @returns True when it is part of one of them.
 */
function belongsToNode(el: ServerElement, nodeIds: ReadonlySet<string>): boolean {
	const id = nodeIdOf(el);
	return id !== undefined && nodeIds.has(id);
}

/**
 * Every element a demotion touches, keyed by id so the same element is only
 * collected once.
 *
 * The rest of each touched node is pulled in wherever those elements sit, so
 * naming one member takes the whole node down.
 * @param targets The elements the caller named.
 * @param board Every element on the board.
 * @returns The elements to demote.
 */
function demotionTargets(
	targets: ServerElement[],
	board: ServerElement[],
): Map<string, ServerElement> {
	const nodeIds = new Set(
		targets.map((target) => nodeIdOf(target)).filter((id) => id !== undefined),
	);
	const byId = new Map<string, ServerElement>();
	for (const el of targets) {
		if (readElementMetadata(el).archboard) {
			byId.set(el.id, el);
		}
	}
	for (const el of board) {
		if (belongsToNode(el, nodeIds)) {
			byId.set(el.id, el);
		}
	}
	return byId;
}

/**
 * Gather elements by the node each belongs to.
 * @param elements The elements to group.
 * @returns The elements per node id, keyed by a synthetic `element:` key for
 * anything carrying metadata but no node id.
 */
function byNode(elements: Iterable<ServerElement>): Map<string, ServerElement[]> {
	const groups = new Map<string, ServerElement[]>();
	for (const el of elements) {
		const key = nodeIdOf(el) ?? `element:${el.id}`;
		groups.set(key, [...(groups.get(key) ?? []), el]);
	}
	return groups;
}

/**
 * One node as the demotion will report it back.
 * @param key The node id, or the synthetic key of an element that has none.
 * @param elements The node's elements.
 * @param board Every element on the board, for the labels.
 * @returns The node, named with whatever a human would call it.
 */
function demotedNode(
	key: string,
	elements: readonly ServerElement[],
	board: ServerElement[],
): DemotionPlan["nodes"][number] {
	const first = elements.at(0);
	const declared = first ? readElementMetadata(first).archboard?.name : undefined;
	// What to call it out loud: the declared name if there is one, else the
	// label the board shows.
	const spoken =
		typeof declared === "string"
			? declared
			: elements.map((el) => labelOf(el, board)).find(Boolean);
	return {
		...(key.startsWith("element:") ? {} : { node: key }),
		...(spoken ? { name: spoken } : {}),
		elementIds: elements.map((el) => el.id),
	};
}

/**
 * One element's custom data with archboard's own block taken out. Metadata
 * another tool wrote is not ours to delete.
 * @param el The element.
 * @returns The custom data that stays.
 */
function withoutArchboard(el: ServerElement): Record<string, unknown> {
	const custom = isRecord(el.customData) ? el.customData : {};
	const { archboard: _archboard, ...rest } = custom;
	return rest;
}

/**
 * What demoting a selection would do, without touching the board.
 * @param targets The elements the caller named.
 * @param board Every element on the board.
 * @returns The nodes the demotion would take down and the element writes that
 * take them down.
 * @throws {PromotionError} When nothing selected is a node.
 */
function planDemotion(targets: ServerElement[], board: ServerElement[]): DemotionPlan {
	if (targets.length === 0) {
		throw new PromotionError("Nothing to demote — no elements selected and no --ids given.");
	}
	const groups = byNode(demotionTargets(targets, board).values());
	if (groups.size === 0) {
		throw new PromotionError("Nothing selected is a node — there is nothing to demote.");
	}
	const updates: ElementUpdate[] = [];
	const nodes: DemotionPlan["nodes"] = [];
	for (const [key, elements] of groups) {
		nodes.push(demotedNode(key, elements, board));
		updates.push(...elements.map((el) => ({ id: el.id, customData: withoutArchboard(el) })));
	}
	return { nodes, updates };
}

// Speakable results

/**
 * One promoted node, said with what it is now bound to.
 * @param n The node.
 * @returns The sentence.
 */
function onePromoted(n: PlannedNode): string {
	const where = n.binding ? `bound to ${formatAddress(n.binding)}` : "unbound";
	const from = n.elementIds.length === 1 ? "1 element" : `${n.elementIds.length} elements`;
	return `Promoted ${from} to the ${n.kind} "${n.name}" (node ${n.node}), ${where}.`;
}

/**
 * Several nodes promoted at once, said as a list of their names.
 * @param nodes The nodes.
 * @returns The sentence.
 */
function manyPromoted(nodes: readonly PlannedNode[]): string {
	const named = nodes.map((n) => `"${n.name}" (${n.node})`).join(", ");
	return `Promoted ${nodes.length} elements to ${nodes[0]?.kind ?? "node"}s: ${named}.`;
}

/**
 * What a promotion did, in a sentence somebody can read out.
 * @param plan What the promotion planned.
 * @param note Anything else the caller wants said after it.
 * @returns The sentence.
 */
function promotionSummary(plan: PromotionPlan, note?: string): string {
	const only = plan.nodes.length === 1 ? plan.nodes.at(0) : undefined;
	const lead = only ? onePromoted(only) : manyPromoted(plan.nodes);
	return note ? `${lead} ${note}` : lead;
}

/**
 * What a demotion did, in a sentence somebody can read out.
 * @param plan What the demotion planned.
 * @returns The sentence.
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
