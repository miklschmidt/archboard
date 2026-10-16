// The other half of one batch: the flows (built in `edit-flows.ts`) and the views.
//
// They follow the same rules as nodes and edges — an entity is replaced whole,
// a stated id must name something that is already there, a new one is minted
// against the whole family, and a name resolves only when it fits exactly one
// thing. What is different is what happens when a node goes away underneath
// them, and the two answers are deliberately not the same:
//
//   A relationship to a node that is gone is removed with it. An arrow is a
//   fact about two nodes, and one of them no longer exists.
//
//   A flow whose participant is gone is refused, not removed. A flow is an
//   explanation somebody wrote, and deleting somebody's paragraph because a box
//   moved is not a thing this program should do quietly.
//
//   Board views keep their selections. Each variant draws the selected subjects
//   it has, including an explicit empty reading when none are present.

import type {
	SemanticFlow,
	SemanticEdge,
	SemanticNode,
	SemanticView,
	SemanticViewInput,
	VariantContent,
	VariantEditInput,
	ViewScope,
} from "@/shared/semantic-board/index";
import { refuse, type SemanticRefusal } from "@/runtime/semantic-board-store/lib/outcome";
import { idFor, named, namedOne, place } from "@/runtime/semantic-board-store/lib/references";
import { byHandle, type Batch } from "@/runtime/semantic-board-store/lib/batch";
import {
	buildFlow,
	resolveAll,
	type RestorableFlows,
} from "@/runtime/semantic-board-store/lib/edit-flows";

/** The flows and views a batch leaves behind, or why it leaves none. */
type ViewEdit =
	| { readonly ok: true; readonly flows: SemanticFlow[]; readonly views: SemanticView[] }
	| SemanticRefusal;

/**
 * Build one stated view.
 * @param views The views as they stand.
 * @param stated The view as the agent wrote it.
 * @param holds What the batch leaves on the board, for the selection to name.
 * @param batch The batch; its ids and handles are extended.
 * @returns The view, or why it could not be built.
 */
function buildView(
	views: readonly SemanticView[],
	stated: SemanticViewInput,
	holds: Holdings,
	batch: Batch,
): { readonly ok: true; readonly view: SemanticView } | SemanticRefusal {
	const chosen = idFor(views, stated, batch, "view");
	if (!chosen.ok) {
		return chosen;
	}
	const scope = resolveScope(stated.scope, holds, batch);
	if (!scope.ok) {
		return scope;
	}
	return {
		ok: true,
		view: {
			id: chosen.id,
			name: stated.name,
			grammar: stated.grammar,
			scope: scope.scope,
			...named(stated),
		},
	};
}

/** What the batch leaves on the board, which is what a selection may name. */
interface Holdings {
	readonly nodes: readonly SemanticNode[];
	readonly edges: readonly SemanticEdge[];
	readonly flows: readonly SemanticFlow[];
}

/**
 * Turn a stated selection into one of identities.
 *
 * A node or a flow may be named; a relationship has no name, so it is
 * identified. A reference that names nothing is refused rather than quietly
 * dropped: a view that silently lost half its selection shows the wrong thing
 * without saying so.
 * @param stated What the agent wrote, or undefined for a view of everything.
 * @param holds What the batch leaves on the board.
 * @param batch The batch, for the handles it has given out.
 * @returns The resolved scope, or the first reference that named nothing.
 */
function resolveScope(
	stated: SemanticViewInput["scope"],
	holds: Holdings,
	batch: Batch,
): { readonly ok: true; readonly scope: ViewScope } | SemanticRefusal {
	if (stated === undefined || stated.kind === "all") {
		return { ok: true, scope: { kind: "all" } };
	}
	const nodes = resolveAll(holds.nodes, stated.nodes, "be selected by a view", batch);
	if (!nodes.ok) {
		return nodes;
	}
	const edges = identified(holds.edges, stated.edges, "UNKNOWN_EDGE", "relationship", batch);
	if (!edges.ok) {
		return edges;
	}
	const flows = identified(holds.flows, stated.flows, "UNKNOWN_FLOW", "flow", batch);
	if (!flows.ok) {
		return flows;
	}
	return {
		ok: true,
		scope: { kind: "selection", nodes: nodes.ids, edges: edges.ids, flows: flows.ids },
	};
}

/**
 * Resolve references against entities found by id, then by a handle this
 * command gave out, and then by name where they have one.
 * @param entities The entities to resolve against.
 * @param references What the agent wrote.
 * @param code The refusal to give when one names nothing.
 * @param what The kind of thing, for the refusal to name.
 * @param batch The batch, for the handles it has given out.
 * @returns The ids, or the first reference that named nothing.
 */
function identified(
	entities: readonly { readonly id: string; readonly name?: string }[],
	references: readonly string[],
	code: "UNKNOWN_EDGE" | "UNKNOWN_FLOW",
	what: string,
	batch: Batch,
): { readonly ok: true; readonly ids: string[] } | SemanticRefusal {
	const ids: string[] = [];
	for (const reference of references) {
		const found = selectedIdentity(entities, reference, batch);
		if (!found.ok) {
			return found;
		}
		if (found.id === undefined) {
			return refuse(code, `no ${what} called "${reference}" for a view to select`);
		}
		ids.push(found.id);
	}
	return { ok: true, ids };
}

/**
 * Every flow and view the batch leaves behind.
 * @param before The content as it stood.
 * @param viewsBefore The board views as they stood.
 * @param edit What the agent stated.
 * @param settled The nodes and relationships the batch leaves behind.
 * @param settled.nodes The nodes.
 * @param settled.edges The relationships, for a scope to name.
 * @param batch The batch; its ids and handles are extended.
 * @param family What the rest of the board family offers this batch.
 * @param family.relatives Other variants of the board.
 * @param family.restorable Absent flows this edit may restore.
 * @returns The flows and views, or why the batch was refused.
 */
function editViews(
	before: VariantContent,
	viewsBefore: readonly SemanticView[],
	edit: VariantEditInput,
	settled: { readonly nodes: readonly SemanticNode[]; readonly edges: readonly SemanticEdge[] },
	batch: Batch,
	family: { readonly relatives: readonly VariantContent[]; readonly restorable: RestorableFlows },
): ViewEdit {
	const { nodes, edges } = settled;
	const removed = plannedRemovals(before, viewsBefore, edit);
	if (!removed.ok) {
		return removed;
	}
	let flows = before.flows.filter((flow) => !removed.flows.has(flow.id));
	for (const stated of edit.flows) {
		const built = buildFlow(flows, nodes, stated, batch, family.restorable);
		if (!built.ok) {
			return built;
		}
		flows = place(flows, built.flow);
	}
	const holds = familyHoldings({ nodes, edges, flows }, family.relatives);
	let views = viewsBefore.filter((view) => !removed.views.has(view.id));
	for (const stated of edit.views) {
		const built = buildView(views, stated, holds, batch);
		if (!built.ok) {
			return built;
		}
		views = place(views, built.view);
	}
	return checkedViews(flows, views, nodes);
}

/**
 * What the batch takes off the board, resolved against the content as it stood.
 * @param before The content as it stood.
 * @param viewsBefore The board views as they stood.
 * @param edit What the agent stated.
 * @returns The flow and view ids to remove, or the first reference that named nothing.
 */
function plannedRemovals(
	before: VariantContent,
	viewsBefore: readonly SemanticView[],
	edit: VariantEditInput,
):
	| { readonly ok: true; readonly flows: ReadonlySet<string>; readonly views: ReadonlySet<string> }
	| SemanticRefusal {
	const flows = new Set<string>();
	for (const reference of edit.removeFlows) {
		const flow = namedOne(before.flows, reference);
		if (flow === undefined) {
			return refuse("UNKNOWN_FLOW", `no flow called "${reference}" to remove`);
		}
		flows.add(flow.id);
	}
	const views = new Set<string>();
	for (const reference of edit.removeViews) {
		const view = namedOne(viewsBefore, reference);
		if (view === undefined) {
			return refuse("UNKNOWN_VIEW", `no view called "${reference}" to remove`);
		}
		views.add(view.id);
	}
	return { ok: true, flows, views };
}

/**
 * Check what the batch leaves behind against the nodes it leaves behind.
 * @param flows The flows the batch leaves.
 * @param views The views the batch leaves.
 * @param nodes The nodes the batch leaves.
 * @returns The flows and views, narrowed, or why the batch was refused.
 */
function checkedViews(
	flows: readonly SemanticFlow[],
	views: readonly SemanticView[],
	nodes: readonly SemanticNode[],
): ViewEdit {
	const nodeIds = new Set(nodes.map((node) => node.id));
	for (const flow of flows) {
		const missing = flow.participants.find((participant) => !nodeIds.has(participant));
		if (missing !== undefined) {
			return refuse(
				"NODE_IN_FLOW",
				`"${flow.name}" is a flow between nodes one of which is not on the board any more; ` +
					"rewrite it or remove it in the same command",
			);
		}
	}
	return { ok: true, flows: [...flows], views: [...views] };
}

/**
 * All identities a board view can select, preferring the edited variant when shared.
 * @param edited The variant after its edit.
 * @param relatives Other variants of the board.
 * @returns The combined family holdings.
 */
function familyHoldings(edited: Holdings, relatives: readonly VariantContent[]): Holdings {
	const contents = [edited, ...relatives];
	return {
		nodes: distinct(contents.flatMap((content) => content.nodes)),
		edges: distinct(contents.flatMap((content) => content.edges)),
		flows: distinct(contents.flatMap((content) => content.flows)),
	};
}

/**
 * Keep the first spelling of each identity.
 * @param entities The entities in priority order.
 * @returns One entry per identity.
 */
function distinct<Entity extends { readonly id: string }>(entities: readonly Entity[]): Entity[] {
	return [...new Map(entities.toReversed().map((entity) => [entity.id, entity])).values()];
}

export { type ViewEdit, editViews };

/**
 * Resolve a family-wide identity without guessing between namesakes.
 * @param entities The board subjects a selection can name.
 * @param reference The stated id, handle or name.
 * @param batch The current command identity owner.
 * @returns The matching identity, or an ambiguity refusal.
 */
function selectedIdentity(
	entities: readonly { readonly id: string; readonly name?: string }[],
	reference: string,
	batch: Batch,
): { readonly ok: true; readonly id: string | undefined } | SemanticRefusal {
	const known =
		entities.find((entity) => entity.id === reference) ?? byHandle(entities, batch, reference);
	if (known !== undefined) {
		return { ok: true, id: known.id };
	}
	const matches = entities.filter((entity) => entity.name === reference);
	if (matches.length > 1) {
		return refuse(
			"AMBIGUOUS_REFERENCE",
			`"${reference}" names several subjects across this board; select one by id (${matches.map((entity) => entity.id).join(", ")})`,
		);
	}
	return { ok: true, id: matches[0]?.id };
}
