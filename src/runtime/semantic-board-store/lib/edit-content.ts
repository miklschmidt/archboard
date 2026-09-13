// Spending the agent's spelling: one batch of stated changes becomes one new
// content value, judged whole.
//
// Three rules from the drawing engine survive the move to semantics, because
// none of them was ever about drawing.
//
//   Every write path replaces an entity; nothing edits one in place. A stated
//   node is the whole node, so a field left out is a field cleared, and there
//   is no half-applied entity to reason about.
//
//   Ids are minted once and never renamed. A node matched by id or by an
//   unambiguous name keeps the id it already had, which is what lets a rename
//   stay a rename rather than becoming a delete and an add. Anything genuinely
//   new is minted against every id the board family holds (`references.ts`).
//
//   A reference is an input spelling and is spent here. After this module the
//   content holds ids, and nothing downstream resolves a name again.
//
// What is new here is that the batch is judged on what it would leave behind
// rather than on each line as it goes past. One thing somebody asked for is
// one write (TASK-068), so removing a container and re-parenting what was
// inside it is one command, in either order, and an edge that this command
// removes twice — once by name and once by taking its endpoint away — is
// removed once and is not a mistake. Removals resolve against the board as it
// stood, additions apply on top, and the only thing that has to hold is what
// is left at the end.

import type {
	SemanticBoard,
	SemanticView,
	SemanticEdge,
	SemanticEdgeInput,
	SemanticNode,
	SemanticNodeInput,
	VariantContent,
	VariantEditInput,
} from "@/shared/semantic-board/index";
import { refuse, type SemanticRefusal } from "@/runtime/semantic-board-store/lib/outcome";
import { place, resolveNode } from "@/runtime/semantic-board-store/lib/references";
import {
	held,
	idsInUse,
	mintInto,
	namesInPlay,
	openBatch,
	type Batch,
	type MintedId,
} from "@/runtime/semantic-board-store/lib/batch";
import { editViews } from "@/runtime/semantic-board-store/lib/edit-views";
import { editWalkthroughs } from "@/runtime/semantic-board-store/lib/edit-walkthroughs";

/** A content value, or why the edit could not produce one. */
type ContentEdit =
	| { readonly ok: true; readonly content: VariantContent; readonly views: SemanticView[] }
	| SemanticRefusal;

/** What one batch takes off the board, resolved against the board as it stood. */
interface Removals {
	readonly nodes: ReadonlySet<string>;
	readonly edges: ReadonlySet<string>;
}

/**
 * What the batch removes, resolved against the content as it stands.
 *
 * An edge that touches a node being removed goes with it — a relationship to
 * something that is no longer there is not a relationship — and naming that
 * edge explicitly as well is the same instruction twice, not an error.
 * @param before The content as it stands.
 * @param edit The batch as stated.
 * @param batch The batch, which has given out no handle yet: a removal names
 * something that stood before this command, and nothing this command creates.
 * @returns What to take off, or the first reference that named nothing.
 */
function planRemovals(
	before: VariantContent,
	edit: VariantEditInput,
	batch: Batch,
): { readonly ok: true; readonly removals: Removals } | SemanticRefusal {
	const nodes = new Set<string>();
	for (const reference of edit.removeNodes) {
		const found = resolveNode(before.nodes, reference, "remove", batch);
		if (!found.ok) {
			return found;
		}
		nodes.add(found.node.id);
	}
	const edges = new Set(
		before.edges
			.filter((edge) => nodes.has(edge.from) || nodes.has(edge.to))
			.map((edge) => edge.id),
	);
	for (const reference of edit.removeEdges) {
		const edge = before.edges.find((candidate) => candidate.id === reference);
		if (edge === undefined) {
			return refuse("UNKNOWN_EDGE", `no edge with the id "${reference}" to remove`);
		}
		edges.add(edge.id);
	}
	return { ok: true, removals: { nodes, edges } };
}

/**
 * The id a stated node should carry: the one it names, the one the node it
 * replaces already had, or a fresh one.
 *
 * A stated id names something that is already on this variant. It is not a way
 * to choose the identity of something new: a typo would otherwise leave the
 * node it meant to replace untouched and put a second one beside it, and the
 * mistake would only show up as a duplicate in the picture. Identities for new
 * things come from the mint owner, which is also what keeps them unique across
 * the whole variant family rather than only this variant.
 * @param nodes The nodes as they stand after removals.
 * @param batch The batch; its ids and handles are extended.
 * @param stated The node as the agent wrote it.
 * @returns The id to write it under, or why the reference could not be resolved.
 */
function idForNode(
	nodes: readonly SemanticNode[],
	batch: Batch,
	stated: SemanticNodeInput,
): MintedId {
	if (stated.id !== undefined) {
		return nodes.some((node) => node.id === stated.id)
			? held(batch, stated.as, stated.id)
			: refuse(
					"UNKNOWN_NODE",
					`there is no node "${stated.id}" on this variant to replace. Leave the id out to add ` +
						`"${stated.name}" as a new node, or state the id of the one you meant to change`,
				);
	}
	const byName = nodes.filter((node) => node.name === stated.name);
	const only = byName[0];
	if (byName.length > 1) {
		return refuse(
			"AMBIGUOUS_REFERENCE",
			`"${stated.name}" is already the name of ${byName.length} nodes on this board; ` +
				`state the id of the one you mean (${byName.map((node) => node.id).join(", ")})`,
		);
	}
	return held(batch, stated.as, only?.id ?? mintInto(batch));
}

/**
 * Apply every stated node, leaving containment to a second pass so that a
 * batch may state a child before the parent it names.
 * @param start The nodes as they stand after removals.
 * @param stated The nodes the agent wrote.
 * @param batch The batch; its ids and handles are extended.
 * @returns The nodes with containment still unresolved, or the refusal.
 */
function placeStatedNodes(
	start: readonly SemanticNode[],
	stated: readonly SemanticNodeInput[],
	batch: Batch,
): { readonly ok: true; readonly nodes: SemanticNode[]; readonly ids: string[] } | SemanticRefusal {
	let nodes = [...start];
	const ids: string[] = [];
	for (const input of stated) {
		const chosen = idForNode(nodes, batch, input);
		if (!chosen.ok) {
			return chosen;
		}
		ids.push(chosen.id);
		nodes = place(nodes, { ...saidOfNode(input), id: chosen.id });
	}
	return { ok: true, nodes, ids };
}

/**
 * What a stated node says about itself, with the three fields the write
 * boundary decides taken out: its identity, which is minted here; its
 * containment, which is resolved in a second pass once every stated node is on
 * the board; and the handle it asked for, which belongs to this command alone
 * and must not reach the document.
 *
 * Everything else is carried across whole rather than listed field by field.
 * A list is a thing that can be out of date: a field an agent may author and a
 * hand-written copier forgot passes the schema, passes the coherence check and
 * is reported as written, and then is not on the board — which is exactly how
 * `drillDown` was accepted and dropped. The two spellings share their fields by
 * construction, so there is nothing to remember.
 * @param input The node as the agent stated it.
 * @returns What it says, less its identity, its containment and its handle.
 */
function saidOfNode(input: SemanticNodeInput): Omit<SemanticNodeInput, "id" | "parent" | "as"> {
	const said = { ...input };
	delete said.id;
	delete said.parent;
	delete said.as;
	return said;
}

/**
 * Resolve the containment every stated node asked for, now that all of them
 * are on the board.
 * @param nodes The placed nodes.
 * @param stated The nodes the agent wrote, in the same order.
 * @param ids The id each stated node was written under.
 * @param batch The batch, for the handles it has given out.
 * @returns The nodes with containment resolved, or the first reference that named nothing.
 */
function resolveContainment(
	nodes: readonly SemanticNode[],
	stated: readonly SemanticNodeInput[],
	ids: readonly string[],
	batch: Batch,
): { readonly ok: true; readonly nodes: SemanticNode[] } | SemanticRefusal {
	let placed = [...nodes];
	for (const [index, input] of stated.entries()) {
		if (input.parent === undefined) {
			continue;
		}
		const parent = resolveNode(placed, input.parent, `contain "${input.name}"`, batch);
		if (!parent.ok) {
			return parent;
		}
		const node = placed.find((candidate) => candidate.id === ids[index]);
		if (node !== undefined) {
			placed = place(placed, { ...node, parent: parent.node.id });
		}
	}
	return { ok: true, nodes: placed };
}

/**
 * Build one stated edge against the nodes as they now stand.
 * @param edges The edges as they stand, for a stated id to name one of.
 * @param nodes The nodes the endpoints must name.
 * @param input The edge as the agent wrote it.
 * @param batch The batch; its ids and handles are extended.
 * @returns The edge, or the endpoint that named nothing.
 */
function buildEdge(
	edges: readonly SemanticEdge[],
	nodes: readonly SemanticNode[],
	input: SemanticEdgeInput,
	batch: Batch,
): { readonly ok: true; readonly edge: SemanticEdge } | SemanticRefusal {
	const from = resolveNode(nodes, input.from, "connect from", batch);
	if (!from.ok) {
		return from;
	}
	const to = resolveNode(nodes, input.to, "connect to", batch);
	if (!to.ok) {
		return to;
	}
	const id = edgeId(edges, input, batch);
	if (!id.ok) {
		return id;
	}
	return {
		ok: true,
		edge: {
			id: id.id,
			from: from.node.id,
			to: to.node.id,
			...saidOfEdge(input),
			emphasis: input.emphasis ?? "normal",
		},
	};
}

/**
 * The id a stated edge should carry: the one it names, which must already be a
 * relationship on this variant, or a fresh one.
 * @param edges The edges as they stand.
 * @param input The edge as the agent wrote it.
 * @param batch The batch; its ids and handles are extended.
 * @returns The id, or why the stated one names nothing.
 */
function edgeId(edges: readonly SemanticEdge[], input: SemanticEdgeInput, batch: Batch): MintedId {
	if (input.id === undefined) {
		return held(batch, input.as, mintInto(batch));
	}
	return edges.some((edge) => edge.id === input.id)
		? held(batch, input.as, input.id)
		: refuse(
				"UNKNOWN_EDGE",
				`there is no relationship "${input.id}" on this variant to replace. Leave the id out to ` +
					"add a new one, or state the id of the one you meant to change",
			);
}

/**
 * What a stated edge says about itself, except for the input-only fields the
 * write boundary resolves or spends.
 * @param input The edge as the agent wrote it.
 * @returns Its authored fields, ready to persist.
 */
function saidOfEdge(
	input: SemanticEdgeInput,
): Omit<SemanticEdgeInput, "id" | "as" | "from" | "to"> {
	const said = { ...input };
	Reflect.deleteProperty(said, "id");
	Reflect.deleteProperty(said, "as");
	Reflect.deleteProperty(said, "from");
	Reflect.deleteProperty(said, "to");
	return said;
}

/**
 * Apply every stated edge, resolving its endpoints against the nodes as they
 * now stand.
 * @param start The edges as they stand after removals.
 * @param nodes The nodes the endpoints must name.
 * @param stated The edges the agent wrote.
 * @param batch The batch; its ids and handles are extended.
 * @returns The edges, or the first endpoint that named nothing.
 */
function placeStatedEdges(
	start: readonly SemanticEdge[],
	nodes: readonly SemanticNode[],
	stated: readonly SemanticEdgeInput[],
	batch: Batch,
): { readonly ok: true; readonly edges: SemanticEdge[] } | SemanticRefusal {
	let edges = [...start];
	for (const input of stated) {
		const built = buildEdge(edges, nodes, input, batch);
		if (!built.ok) {
			return built;
		}
		edges = place(edges, built.edge);
	}
	return { ok: true, edges };
}

/**
 * Whether the batch leaves anything inside a container it also took away.
 *
 * This is the check that used to happen at removal time, moved to the end.
 * There it forced a container and its contents into two separate commands;
 * here the agent may remove the container and re-parent or remove its contents
 * in one, and is told about it only when something really is left dangling.
 * @param before The content as it stood, for naming what was removed.
 * @param nodes The nodes the batch would leave behind.
 * @returns The refusal, or null when nothing is orphaned.
 */
function orphanRefusal(
	before: VariantContent,
	nodes: readonly SemanticNode[],
): SemanticRefusal | null {
	const present = new Set(nodes.map((node) => node.id));
	for (const node of nodes) {
		const parent = node.parent;
		if (parent === undefined || present.has(parent)) {
			continue;
		}
		const gone = before.nodes.find((candidate) => candidate.id === parent);
		return refuse(
			"NODE_HAS_CHILDREN",
			`"${gone?.name ?? parent}" is not on the board any more but "${node.name}" is still ` +
				"inside it; re-parent or remove its contents in the same command",
		);
	}
	return null;
}

/**
 * One batch of stated changes, applied to one content value.
 * @param before The content as it stands.
 * @param edit What the agent stated.
 * @param board The board the content belongs to, for the ids already in use.
 * @returns The content after the edit, or why it was refused.
 */
function editContent(
	before: VariantContent,
	edit: VariantEditInput,
	board: SemanticBoard | null,
): ContentEdit {
	const batch = editBatch(board, before, edit);
	const planned = planRemovals(before, edit, batch);
	if (!planned.ok) {
		return planned;
	}
	const kept = {
		nodes: before.nodes.filter((node) => !planned.removals.nodes.has(node.id)),
		edges: before.edges.filter((edge) => !planned.removals.edges.has(edge.id)),
	};
	const placed = placeStatedNodes(kept.nodes, edit.nodes, batch);
	if (!placed.ok) {
		return placed;
	}
	const contained = resolveContainment(placed.nodes, edit.nodes, placed.ids, batch);
	if (!contained.ok) {
		return contained;
	}
	const orphan = orphanRefusal(before, contained.nodes);
	if (orphan !== null) {
		return orphan;
	}
	const edges = placeStatedEdges(kept.edges, contained.nodes, edit.edges, batch);
	return edges.ok ? withViews(before, board, edit, contained.nodes, edges.edges, batch) : edges;
}

/**
 * The rest of the batch: the flows, the views and the explanations, over the
 * nodes and edges it has already settled.
 *
 * The explanations come last because a beat is about the architecture and the
 * readings of it, so it can only be resolved against what the whole rest of the
 * batch leaves behind.
 * @param before The content as it stood.
 * @param board The board owning these views.
 * @param edit What the agent stated.
 * @param nodes The nodes the batch leaves behind.
 * @param edges The relationships the batch leaves behind.
 * @param batch The batch; its ids and handles are extended.
 * @returns The whole content, or why the batch was refused.
 */
function withViews(
	before: VariantContent,
	board: SemanticBoard | null,
	edit: VariantEditInput,
	nodes: readonly SemanticNode[],
	edges: readonly SemanticEdge[],
	batch: Batch,
): ContentEdit {
	const relatives = relativeContent(board, before);
	const rest = editViews(before, board?.views ?? [], edit, nodes, edges, batch, relatives);
	if (!rest.ok) {
		return rest;
	}
	const holds = { nodes, edges, flows: rest.flows, views: rest.views };
	const explained = editWalkthroughs(before, edit, holds, batch);
	if (!explained.ok) {
		return explained;
	}
	return {
		ok: true,
		views: rest.views,
		content: {
			nodes: [...nodes],
			edges: [...edges],
			flows: rest.flows,
			walkthroughs: explained.walkthroughs,
		},
	};
}

export { type ContentEdit, editContent };

/**
 * Open one identity namespace for the board and this content edit.
 * @param board The board, or null at creation.
 * @param before The variant before editing.
 * @param edit The stated edit.
 * @returns The batch identity owner.
 */
function editBatch(
	board: SemanticBoard | null,
	before: VariantContent,
	edit: VariantEditInput,
): Batch {
	return openBatch(idsInUse(board), namesInPlay(before, edit, board));
}

/**
 * The other variant contents available to a shared view selection.
 * @param board The board, or null at creation.
 * @param before The content being replaced.
 * @returns Unedited relatives, excluding stale content being replaced.
 */
function relativeContent(board: SemanticBoard | null, before: VariantContent): VariantContent[] {
	return (
		board?.variants
			.filter((variant) => variant.content !== before)
			.map((variant) => variant.content) ?? []
	);
}
