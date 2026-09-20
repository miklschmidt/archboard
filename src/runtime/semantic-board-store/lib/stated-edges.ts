// The relationships one batch states, against the parts the batch leaves behind.
//
// An endpoint resolves against the nodes as they stand after removals, and the
// id is read after that, which is what lets the two questions be told apart.
// A relationship the batch restates is not swept off by its part going
// (`edit-content.ts`), so moving one onto the part that replaces the one it was
// on keeps its id; a relationship still left on a part the batch takes away has
// nowhere to land, and is refused saying so rather than as a reference to
// nothing. What the batch itself named in `removeEdges` is gone either way.

import type { SemanticEdge, SemanticEdgeInput, SemanticNode } from "@/shared/semantic-board/index";
import { refuse, type SemanticRefusal } from "@/runtime/semantic-board-store/lib/outcome";
import { place, resolveNode } from "@/runtime/semantic-board-store/lib/references";
import { subjectOrder } from "@/runtime/semantic-board-store/lib/subject-order";
import {
	held,
	mintInto,
	type Batch,
	type MintedId,
} from "@/runtime/semantic-board-store/lib/batch";

/**
 * What this command took off, for a relationship that still names one of those
 * things to be told which of the two mistakes it made.
 */
interface TakenOff {
	/** The nodes the command removed, as they stood, for naming them. */
	readonly nodes: readonly SemanticNode[];
	/** The relationship ids the command itself named in `removeEdges`. */
	readonly edges: ReadonlySet<string>;
	/** Absent relationship identities inherited before this command. */
	readonly restorable: ReadonlySet<string>;
}

/**
 * Build one stated edge against the nodes as they now stand.
 * @param edges The edges as they stand, for a stated id to name one of.
 * @param nodes The nodes the endpoints must name.
 * @param input The edge as the agent wrote it.
 * @param batch The batch; its ids and handles are extended.
 * @param gone What this command took off, for the refusals to say why.
 * @returns The edge, or the endpoint that named nothing.
 */
function buildEdge(
	edges: readonly SemanticEdge[],
	nodes: readonly SemanticNode[],
	input: SemanticEdgeInput,
	batch: Batch,
	gone: TakenOff,
): { readonly ok: true; readonly edge: SemanticEdge } | SemanticRefusal {
	const from = endpoint(nodes, input.from, "connect from", batch, gone);
	if (!from.ok) {
		return from;
	}
	const to = endpoint(nodes, input.to, "connect to", batch, gone);
	if (!to.ok) {
		return to;
	}
	const id = edgeId(edges, input, batch, gone);
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
			order: subjectOrder(edges, id.id, input.order),
		},
	};
}

/**
 * The node one end of a stated relationship names, among those the batch
 * leaves behind.
 * @param nodes The nodes as they stand after removals.
 * @param reference The endpoint as the agent wrote it.
 * @param what What the caller was trying to do, for the refusal to quote.
 * @param batch The batch, for the handles it has given out.
 * @param gone What this command took off.
 * @returns The node, or why the end named nothing it could land on.
 */
function endpoint(
	nodes: readonly SemanticNode[],
	reference: string,
	what: string,
	batch: Batch,
	gone: TakenOff,
): ReturnType<typeof resolveNode> {
	const found = resolveNode(nodes, reference, what, batch);
	return found.ok ? found : (removedEndpointRefusal(gone, reference) ?? found);
}

/**
 * Why an endpoint that named nothing named a part this very command removes.
 *
 * The two mistakes read the same to an agent and are not the same mistake: a
 * reference that never named anything is a typo, and a reference to a part the
 * batch itself takes away is a relationship left hanging in a batch that was
 * otherwise coherent. Told apart here because endpoints resolve against the
 * nodes as they stand after removals, so the part is gone by the time the
 * reference is read.
 * @param gone What this command took off.
 * @param reference The endpoint as the agent wrote it.
 * @returns The refusal, or null when the reference named nothing this command removed.
 */
function removedEndpointRefusal(gone: TakenOff, reference: string): SemanticRefusal | null {
	const removed = gone.nodes.find((node) => node.id === reference || node.name === reference);
	if (removed === undefined) {
		return null;
	}
	return refuse(
		"UNKNOWN_NODE",
		`"${removed.name}" is a part this command removes, so no relationship can be left on it; ` +
			"point this relationship at what replaces it, or remove the relationship too",
	);
}

/**
 * The id a stated edge should carry: the one it names, which must already be a
 * relationship on this variant or inherited from its predecessor/base, or a fresh one.
 *
 * A relationship whose endpoint this command removes is not gone by the time
 * it is read here: the cascade leaves a restated relationship alone, so moving
 * it onto the part that replaces the one it was on keeps its id. What the
 * command named in `removeEdges` is gone, and stating it again as well is two
 * contradictory instructions rather than one thing asked for.
 * @param edges The edges as they stand.
 * @param input The edge as the agent wrote it.
 * @param batch The batch; its ids and handles are extended.
 * @param gone What this command took off.
 * @returns The id, or why the stated one names nothing.
 */
function edgeId(
	edges: readonly SemanticEdge[],
	input: SemanticEdgeInput,
	batch: Batch,
	gone: TakenOff,
): MintedId {
	if (input.id === undefined) {
		return held(batch, input.as, mintInto(batch));
	}
	if (edges.some((edge) => edge.id === input.id) || gone.restorable.has(input.id)) {
		return held(batch, input.as, input.id);
	}
	if (gone.edges.has(input.id)) {
		return refuse(
			"UNKNOWN_EDGE",
			`this command removes relationship "${input.id}" and states it again. Take it out of ` +
				"removeEdges to change it, or leave the id out of the statement to add a new one",
		);
	}
	return refuse(
		"UNKNOWN_EDGE",
		`there is no relationship "${input.id}" on this variant, its direct predecessor or its recorded reconciliation base. Leave the id out to ` +
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
 * @param gone What this command took off, for the refusals to say why.
 * @returns The edges, or the first endpoint that named nothing.
 */
function placeStatedEdges(
	start: readonly SemanticEdge[],
	nodes: readonly SemanticNode[],
	stated: readonly SemanticEdgeInput[],
	batch: Batch,
	gone: TakenOff,
): { readonly ok: true; readonly edges: SemanticEdge[] } | SemanticRefusal {
	let edges = [...start];
	for (const input of stated) {
		const built = buildEdge(edges, nodes, input, batch, gone);
		if (!built.ok) {
			return built;
		}
		edges = place(edges, built.edge);
	}
	return { ok: true, edges };
}

export { type TakenOff, placeStatedEdges };
