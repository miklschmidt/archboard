// The other half of one batch: the flows and the views.
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
	FlowStep,
	FlowStepInput,
	SemanticFlow,
	SemanticFlowInput,
	SemanticEdge,
	SemanticNode,
	SemanticView,
	SemanticViewInput,
	VariantContent,
	VariantEditInput,
	ViewScope,
} from "@/shared/semantic-board/index";
import { refuse, type SemanticRefusal } from "@/runtime/semantic-board-store/lib/outcome";
import {
	idFor,
	named,
	namedOne,
	place,
	resolveNode,
} from "@/runtime/semantic-board-store/lib/references";
import {
	byHandle,
	held,
	mintInto,
	type Batch,
	type MintedId,
} from "@/runtime/semantic-board-store/lib/batch";

/** The flows and views a batch leaves behind, or why it leaves none. */
type ViewEdit =
	| { readonly ok: true; readonly flows: SemanticFlow[]; readonly views: SemanticView[] }
	| SemanticRefusal;

/**
 * Build one stated flow against the nodes as they now stand.
 * @param flows The flows as they stand.
 * @param nodes The nodes its participants must name.
 * @param stated The flow as the agent wrote it.
 * @param batch The batch; its ids and handles are extended.
 * @returns The flow, or why it could not be built.
 */
function buildFlow(
	flows: readonly SemanticFlow[],
	nodes: readonly SemanticNode[],
	stated: SemanticFlowInput,
	batch: Batch,
): { readonly ok: true; readonly flow: SemanticFlow } | SemanticRefusal {
	const chosen = idFor(flows, stated, batch, "flow");
	if (!chosen.ok) {
		return chosen;
	}
	const participants = resolveAll(nodes, stated.participants, "take part in a flow", batch);
	if (!participants.ok) {
		return participants;
	}
	// The steps a stated id may name are the ones the flow being replaced
	// already had. A flow's steps belong to that flow, so an id from elsewhere
	// names nothing here even when it names something on the board.
	const had = flows.find((flow) => flow.id === chosen.id)?.steps ?? [];
	const steps = buildSteps(had, nodes, stated, batch);
	if (!steps.ok) {
		return steps;
	}
	return {
		ok: true,
		flow: {
			id: chosen.id,
			name: stated.name,
			participants: participants.ids,
			steps: steps.steps,
			...named(stated),
		},
	};
}

/**
 * Resolve a list of node references, all of them or none.
 * @param nodes The nodes to resolve against.
 * @param references What the agent wrote.
 * @param what What the caller was doing, for the refusal to quote.
 * @param batch The batch, for the handles it has given out.
 * @returns The ids in the order they were written, or the first refusal.
 */
function resolveAll(
	nodes: readonly SemanticNode[],
	references: readonly string[],
	what: string,
	batch: Batch,
): { readonly ok: true; readonly ids: string[] } | SemanticRefusal {
	const ids: string[] = [];
	for (const reference of references) {
		const found = resolveNode(nodes, reference, what, batch);
		if (!found.ok) {
			return found;
		}
		ids.push(found.node.id);
	}
	return { ok: true, ids };
}

/**
 * Build the steps of one stated flow.
 *
 * A step keeps the id it already had when the stated step names one, so
 * rewriting or reordering a flow does not make every step a new subject. What
 * a stated id may not do is invent one: a typo would otherwise leave the step
 * it meant to change in place and add a second beside it, and a later
 * comparison would read that as a deletion and an addition rather than as the
 * mistake it is.
 * @param had The steps the flow being replaced already had.
 * @param nodes The nodes the endpoints must name.
 * @param stated The flow as the agent wrote it.
 * @param batch The batch; its ids and handles are extended.
 * @returns The steps in order, or the first refusal.
 */
function buildSteps(
	had: readonly FlowStep[],
	nodes: readonly SemanticNode[],
	stated: SemanticFlowInput,
	batch: Batch,
): { readonly ok: true; readonly steps: SemanticFlow["steps"] } | SemanticRefusal {
	const steps: SemanticFlow["steps"] = [];
	for (const stepInput of stated.steps) {
		const built = buildStep(had, nodes, stepInput, batch);
		if (!built.ok) {
			return built;
		}
		steps.push(built.step);
	}
	return { ok: true, steps };
}

/**
 * Build one step of a flow.
 *
 * A step that begins and ends at the same node is a `self` step whether or not
 * the agent said so, because the two statements cannot disagree: the contract
 * refuses a document where they do.
 * @param had The steps the flow being replaced already had.
 * @param nodes The nodes the endpoints must name.
 * @param stated The step as the agent wrote it.
 * @param batch The batch; its ids and handles are extended.
 * @returns The step, or why its endpoints could not be resolved.
 */
function buildStep(
	had: readonly FlowStep[],
	nodes: readonly SemanticNode[],
	stated: FlowStepInput,
	batch: Batch,
): { readonly ok: true; readonly step: FlowStep } | SemanticRefusal {
	const id = stepId(had, stated, batch);
	if (!id.ok) {
		return id;
	}
	const from = resolveNode(nodes, stated.from, "send a step", batch);
	if (!from.ok) {
		return from;
	}
	const to = resolveNode(nodes, stated.to, "receive a step", batch);
	if (!to.ok) {
		return to;
	}
	return {
		ok: true,
		step: {
			id: id.id,
			from: from.node.id,
			to: to.node.id,
			label: stated.label,
			kind: from.node.id === to.node.id ? "self" : (stated.kind ?? "sync"),
			...stepProse(stated),
		},
	};
}

/**
 * The id a stated step should carry: the one it names, which must be a step
 * this flow already had, or a fresh one.
 * @param had The steps the flow being replaced already had.
 * @param stated The step as the agent wrote it.
 * @param batch The batch; its ids and handles are extended.
 * @returns The id, or why the stated one names nothing.
 */
function stepId(had: readonly FlowStep[], stated: FlowStepInput, batch: Batch): MintedId {
	if (stated.id === undefined) {
		return held(batch, stated.as, mintInto(batch));
	}
	return had.some((step) => step.id === stated.id)
		? held(batch, stated.as, stated.id)
		: refuse(
				"UNKNOWN_STEP",
				`there is no step "${stated.id}" in this flow to replace. Leave the id out to add ` +
					`"${stated.label}" as a new one`,
			);
}

/**
 * The optional prose a step carries, present only where the agent wrote it.
 * @param stated The step as the agent wrote it.
 * @returns The note and repeat fields it actually has.
 */
function stepProse(stated: FlowStepInput): Pick<FlowStep, "note" | "repeat"> {
	return {
		...(stated.note === undefined ? {} : { note: stated.note }),
		...(stated.repeat === undefined ? {} : { repeat: stated.repeat }),
	};
}

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
 * @param nodes The nodes the batch leaves behind.
 * @param edges The relationships the batch leaves behind, for a scope to name.
 * @param batch The batch; its ids and handles are extended.
 * @param relatives Other variants of the board.
 * @returns The flows and views, or why the batch was refused.
 */
function editViews(
	before: VariantContent,
	viewsBefore: readonly SemanticView[],
	edit: VariantEditInput,
	nodes: readonly SemanticNode[],
	edges: readonly SemanticEdge[],
	batch: Batch,
	relatives: readonly VariantContent[],
): ViewEdit {
	const removed = plannedRemovals(before, viewsBefore, edit);
	if (!removed.ok) {
		return removed;
	}
	let flows = before.flows.filter((flow) => !removed.flows.has(flow.id));
	for (const stated of edit.flows) {
		const built = buildFlow(flows, nodes, stated, batch);
		if (!built.ok) {
			return built;
		}
		flows = place(flows, built.flow);
	}
	const holds = familyHoldings({ nodes, edges, flows }, relatives);
	let views = viewsBefore.filter((view) => !removed.views.has(view.id));
	for (const stated of edit.views) {
		const built = buildView(views, stated, holds, batch);
		if (!built.ok) {
			return built;
		}
		views = place(views, built.view);
	}
	return settled(flows, views, nodes);
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
function settled(
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
