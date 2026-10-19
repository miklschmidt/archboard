// The flows one batch states, against the nodes the batch leaves behind.
//
// A flow follows the same identity rules as every other subject: it is
// replaced whole, a stated id must name a flow that is already there or one the
// edit may restore (`restore.ts`), and a new one is minted against the whole
// family. Its steps belong to it: a stated step id must name a step that flow
// already had, or, for a restored flow, one its source holds.

import { everyStep } from "@archboard/board/flow-steps";
import {
	type FlowAlternative,
	type FlowMessage,
	type FlowStep,
	type SemanticFlow,
} from "@archboard/board/views";
import {
	type FlowMessageInput,
	type FlowStepInput,
	type SemanticFlowInput,
} from "@archboard/board/board-input";
import { type SemanticNode } from "@archboard/board/content";
import { refuse, type SemanticRefusal } from "@/runtime/semantic-board-store/lib/outcome";
import { idFor, named, resolveNode } from "@/runtime/semantic-board-store/lib/references";
import {
	held,
	mintInto,
	type Batch,
	type MintedId,
} from "@/runtime/semantic-board-store/lib/batch";

/** Each absent flow an edit may restore, with the step ids it may keep. */
type RestorableFlows = ReadonlyMap<string, ReadonlySet<string>>;

/**
 * Build one stated flow against the nodes as they now stand.
 * @param flows The flows as they stand.
 * @param nodes The nodes its participants must name.
 * @param stated The flow as the agent wrote it.
 * @param batch The batch; its ids and handles are extended.
 * @param restorable Absent flows this edit may restore.
 * @returns The flow, or why it could not be built.
 */
function buildFlow(
	flows: readonly SemanticFlow[],
	nodes: readonly SemanticNode[],
	stated: SemanticFlowInput,
	batch: Batch,
	restorable: RestorableFlows,
): { readonly ok: true; readonly flow: SemanticFlow } | SemanticRefusal {
	const chosen = idFor(flows, stated, batch, "flow", restorable);
	if (!chosen.ok) {
		return chosen;
	}
	const participants = resolveAll(nodes, stated.participants, "take part in a flow", batch);
	if (!participants.ok) {
		return participants;
	}
	const had = keepableSteps(flows, chosen.id, restorable);
	const steps = buildSteps(had, nodes, stated.steps, batch);
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
 * The step ids a stated flow's steps may keep: the ones the flow being replaced
 * already had, or, for a flow this edit restores, the ones its source holds. A
 * flow's steps belong to that flow, so an id from elsewhere names nothing here
 * even when it names something on the board.
 * @param flows The flows as they stand.
 * @param id The id the stated flow carries.
 * @param restorable Absent flows this edit may restore.
 * @returns The step ids.
 */
function keepableSteps(
	flows: readonly SemanticFlow[],
	id: string,
	restorable: RestorableFlows,
): ReadonlySet<string> {
	const restoring = restorable.get(id);
	if (restoring !== undefined) {
		return restoring;
	}
	const had = everyStep(flows.find((flow) => flow.id === id)?.steps ?? []);
	return new Set(had.map((step) => step.id));
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
 * A decision and a loop hold steps of their own, built the same way, and any
 * step anywhere in the flow may keep the id of any step the flow already had:
 * moving a step into an alternative does not make it a new subject.
 * @param had The id of every step the flow being replaced already had, at any depth.
 * @param nodes The nodes the endpoints must name.
 * @param stated The steps as the agent wrote them.
 * @param batch The batch; its ids and handles are extended.
 * @returns The steps in order, or the first refusal.
 */
function buildSteps(
	had: ReadonlySet<string>,
	nodes: readonly SemanticNode[],
	stated: readonly FlowStepInput[],
	batch: Batch,
): { readonly ok: true; readonly steps: FlowStep[] } | SemanticRefusal {
	const steps: FlowStep[] = [];
	for (const stepInput of stated) {
		const built = buildStep(had, nodes, stepInput, batch);
		if (!built.ok) {
			return built;
		}
		steps.push(built.step);
	}
	return { ok: true, steps };
}

/**
 * Build one step of a flow: a message, or a decision or loop with the steps
 * it holds.
 * @param had The id of every step the flow being replaced already had.
 * @param nodes The nodes the endpoints must name.
 * @param stated The step as the agent wrote it.
 * @param batch The batch; its ids and handles are extended.
 * @returns The step, or why it could not be built.
 */
function buildStep(
	had: ReadonlySet<string>,
	nodes: readonly SemanticNode[],
	stated: FlowStepInput,
	batch: Batch,
): { readonly ok: true; readonly step: FlowStep } | SemanticRefusal {
	const id = stepId(had, stated, batch);
	if (!id.ok) {
		return id;
	}
	if (stated.kind === "decision") {
		return buildDecision(id.id, had, nodes, stated, batch);
	}
	if (stated.kind === "loop") {
		const steps = buildSteps(had, nodes, stated.steps, batch);
		if (!steps.ok) {
			return steps;
		}
		return {
			ok: true,
			step: {
				id: id.id,
				kind: "loop",
				condition: stated.condition,
				steps: steps.steps,
				...noted(stated),
			},
		};
	}
	return buildMessage(id.id, nodes, stated, batch);
}

/**
 * Build one decision: its question, and each alternative's steps.
 * @param id The id the decision carries.
 * @param had The id of every step the flow being replaced already had.
 * @param nodes The nodes the endpoints must name.
 * @param stated The decision as the agent wrote it.
 * @param batch The batch; its ids and handles are extended.
 * @returns The decision, or why one of its steps could not be built.
 */
function buildDecision(
	id: string,
	had: ReadonlySet<string>,
	nodes: readonly SemanticNode[],
	stated: Extract<FlowStepInput, { kind: "decision" }>,
	batch: Batch,
): { readonly ok: true; readonly step: FlowStep } | SemanticRefusal {
	const alternatives: FlowAlternative[] = [];
	for (const alternative of stated.alternatives) {
		const steps = buildSteps(had, nodes, alternative.steps, batch);
		if (!steps.ok) {
			return steps;
		}
		alternatives.push({ label: alternative.label, steps: steps.steps });
	}
	return {
		ok: true,
		step: { id, kind: "decision", question: stated.question, alternatives, ...noted(stated) },
	};
}

/**
 * The note a decision or loop carries, present only where the agent wrote one.
 * @param stated The decision or loop as the agent wrote it.
 * @param stated.note Its note, if any.
 * @returns The note field it actually has.
 */
function noted(stated: { readonly note?: string | undefined }): { note?: string } {
	return stated.note === undefined ? {} : { note: stated.note };
}

/**
 * Build one message of a flow.
 *
 * A message that begins and ends at the same node is a `self` step whether or
 * not the agent said so, because the two statements cannot disagree: the
 * contract refuses a document where they do.
 * @param id The id the message carries.
 * @param nodes The nodes the endpoints must name.
 * @param stated The message as the agent wrote it.
 * @param batch The batch, for the handles it has given out.
 * @returns The message, or why its endpoints could not be resolved.
 */
function buildMessage(
	id: string,
	nodes: readonly SemanticNode[],
	stated: FlowMessageInput,
	batch: Batch,
): { readonly ok: true; readonly step: FlowMessage } | SemanticRefusal {
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
			id,
			from: from.node.id,
			to: to.node.id,
			label: stated.label,
			kind: from.node.id === to.node.id ? "self" : (stated.kind ?? "sync"),
			...optionalStepFields(stated),
		},
	};
}

/**
 * The id a stated step should carry: the one it names, which must be a step
 * this flow already had, or a fresh one.
 * @param had The ids of the steps the flow being replaced already had.
 * @param stated The step as the agent wrote it.
 * @param batch The batch; its ids and handles are extended.
 * @returns The id, or why the stated one names nothing.
 */
function stepId(had: ReadonlySet<string>, stated: FlowStepInput, batch: Batch): MintedId {
	if (stated.id === undefined) {
		return held(batch, stated.as, mintInto(batch));
	}
	return had.has(stated.id)
		? held(batch, stated.as, stated.id)
		: refuse(
				"UNKNOWN_STEP",
				`there is no step "${stated.id}" in this flow to replace. Leave the id out to add ` +
					`"${wordsOf(stated)}" as a new one`,
			);
}

/**
 * The words a stated step is known by: a message's label, a decision's
 * question, a loop's condition.
 * @param stated The step as the agent wrote it.
 * @returns Its words.
 */
function wordsOf(stated: FlowStepInput): string {
	if (stated.kind === "decision") return stated.question;
	if (stated.kind === "loop") return stated.condition;
	return stated.label;
}

/**
 * The optional fields a message carries, present only where the agent wrote them.
 * @param stated The message as the agent wrote it.
 * @returns The note, repeat and anchor fields it actually has.
 */
function optionalStepFields(
	stated: FlowMessageInput,
): Pick<FlowMessage, "note" | "repeat" | "anchor"> {
	return {
		...(stated.note === undefined ? {} : { note: stated.note }),
		...(stated.repeat === undefined ? {} : { repeat: stated.repeat }),
		...(stated.anchor === undefined ? {} : { anchor: stated.anchor }),
	};
}

export { type RestorableFlows, buildFlow, resolveAll };
