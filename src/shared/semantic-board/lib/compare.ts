// What one variant changed about the one it came from.
//
// Nothing here is authored. A proposal says what its architecture is; the fact
// that it added a queue and moved a responsibility is derived by reading it
// against its predecessor, every time, from the identities the two share. That
// is the whole reason identities are minted once and never rewritten: a node
// that kept its id through a rename is a rename, and the same node with a fresh
// id would be a deletion and an addition standing next to each other (ADR 0023).
//
// Three rules decide what counts as a change, and each of them is a thing the
// product would get wrong without saying so:
//
//   Comparison reads the whole variant, before any view filtering. A view that
//   hides a node is a narrower reading, not a variant that lost one.
//
//   Only the entity whose own fields moved is labelled. Rerouting a
//   relationship does not make its endpoints changed, and putting a new module
//   inside a service does not make the service changed. A badge that spread to
//   its neighbours would make every proposal look like a rewrite.
//
//   Presentation intent is not architecture. A relationship asking for more
//   attention is not a redesign, and labelling it as one would mean tidying up
//   a diagram reads as changing the system.
//
// Walkthroughs and their beats *are* compared. A beat makes a claim: its prose
// says something about the architecture, its subjects say what that something
// is about, and where it comes in the
// walkthrough is a claim too, in exactly the way a step's place in a flow is:
// explaining the queue before the worker and after it are two different
// explanations. So a beat carries its walkthrough and its position the way a
// `PlacedStep` carries its flow and position, and a beat that moved is reported
// as changed. That is what a later reconciliation reads when it has to decide
// whether two descendants reordered one explanation compatibly, and what tells
// an agent that the paragraph about a node it just deleted needs rewriting.
//
// None of that badges architecture. The subjects a beat names are compared as
// the beat's own field; the nodes themselves are compared separately and come
// back unchanged, because rewriting an explanation of a service does not change
// the service.

import type {
	SemanticEdge,
	SemanticNode,
	VariantContent,
} from "@/shared/semantic-board/lib/content";
import type { FlowStep, SemanticFlow } from "@/shared/semantic-board/lib/views";
import type { SemanticWalkthrough, WalkthroughBeat } from "@/shared/semantic-board/lib/walkthrough";

/**
 * One step, with where it stands: which flow tells it and how far into that
 * flow it comes.
 *
 * Both of those are the step's own meaning rather than the picture's. A
 * sequence is an ordered exchange — "the reply comes back before the queue is
 * written" is a claim about the system, and swapping two steps changes what the
 * flow says happens. So is which conversation a step belongs to. Neither is
 * carried on the step itself, because a step's place is where it is written;
 * this is where that place is read.
 */
interface PlacedStep extends FlowStep {
	/** The flow this step is told in. */
	readonly flow: string;
	/** How far into that flow it comes, counting from one. */
	readonly position: number;
}

/**
 * One beat, with where it stands: which explanation tells it and how far into
 * that explanation it comes. Both are the beat's own meaning, for the reason
 * set out at the top of this file, and neither is carried on the beat itself
 * because a beat's place is where it is written.
 */
interface PlacedBeat extends WalkthroughBeat {
	/** The walkthrough this beat is told in. */
	readonly walkthrough: string;
	/** How far into that walkthrough it comes, counting from one. */
	readonly position: number;
}

/** How one subject stands relative to the variant this one came from. */
type ChangeKind = "added" | "removed" | "changed" | "unchanged";

/** One field that moved, and what it moved between. */
interface FieldChange {
	/** The field's name, as the contract spells it. */
	readonly field: string;
	/** What the predecessor said, or undefined when it said nothing. */
	readonly before: unknown;
	/** What this variant says, or undefined when it says nothing. */
	readonly after: unknown;
}

/** One subject, how it stands, and what moved. */
interface SubjectChange<Entity> {
	readonly kind: ChangeKind;
	/**
	 * The entity as it stands: this variant's, or — for something removed — the
	 * predecessor's, which is the only place a removed subject exists.
	 */
	readonly entity: Entity;
	/** The fields that moved; empty for anything but a change. */
	readonly fields: readonly FieldChange[];
}

/**
 * What a variant changed, by subject identity.
 *
 * Steps are keyed by their own id rather than nested inside their flow, because
 * a step is a subject a reader selects and a label is drawn on, and the one
 * thing every consumer has is an id.
 */
interface VariantComparison {
	readonly nodes: ReadonlyMap<string, SubjectChange<SemanticNode>>;
	readonly edges: ReadonlyMap<string, SubjectChange<SemanticEdge>>;
	readonly flows: ReadonlyMap<string, SubjectChange<SemanticFlow>>;
	readonly steps: ReadonlyMap<string, SubjectChange<PlacedStep>>;
	readonly walkthroughs: ReadonlyMap<string, SubjectChange<SemanticWalkthrough>>;
	readonly beats: ReadonlyMap<string, SubjectChange<PlacedBeat>>;
}

/**
 * The fields of each kind that say what a thing *is*, as opposed to how much
 * attention it is asking for or how it is being read.
 *
 * `group` is in the node list, and belongs there: moving a part from one
 * effort to another is a statement about the architecture, not about how it is
 * drawn. The colour the group ends up wearing is not compared, because the
 * colour is not on the board — it is derived from the label, so retuning the
 * palette can never make a variant read as changed.
 *
 * `emphasis` is deliberately absent from the relationship list. It is authored
 * presentation intent — how loudly to draw a connection — and a proposal whose
 * only difference is that one arrow got louder has changed nothing about the
 * architecture. Views are absent from the comparison entirely, for the same
 * reason: naming a second way to read a board is not a redesign of it.
 *
 * A walkthrough does not compare its `beats`, and a flow does not compare its
 * `steps`, for one reason: each of those is a subject with an identity of its
 * own and is compared as one. A container that also compared its contents would
 * report every reworded beat twice, once where it happened and once as the
 * whole explanation having changed.
 */
const COMPARED = {
	node: [
		"name",
		"kind",
		"responsibility",
		"description",
		"parent",
		"group",
		"binding",
		"drillDown",
	],
	edge: ["from", "to", "kind", "label", "description"],
	flow: ["name", "summary", "participants"],
	step: ["from", "to", "label", "kind", "note", "repeat", "flow", "position"],
	walkthrough: ["name", "summary"],
	beat: ["heading", "body", "subjects", "view", "walkthrough", "position"],
} as const;

/**
 * Fields that are a set written in some order, where the order is the
 * renderer's business.
 *
 * A flow's participants are its cast. Which columns a sequence has is the
 * flow's meaning; which order they sit in is how it is drawn — the contract
 * says so where the field is defined — so a proposal that only moved a column
 * has changed nothing about the architecture and must not be badged as if it
 * had. Adding or dropping a participant is a different matter and is a change.
 *
 * A beat's subjects are the same kind of thing: they are what the beat is
 * about, all at once, and the viewer decides what highlighting them looks like.
 * A beat's own place in its walkthrough is emphatically not in here — that one
 * is order that means something, and it is compared.
 */
const UNORDERED: ReadonlySet<string> = new Set(["participants", "subjects"]);

/**
 * One field's value as it is compared, which is not always as it is written.
 * @param field The field's name.
 * @param value What is written there.
 * @returns The value to compare by.
 */
function comparable(field: string, value: unknown): unknown {
	if (!UNORDERED.has(field) || !Array.isArray(value)) {
		return value;
	}
	const written: readonly unknown[] = value;
	return written.map((one) => JSON.stringify(one)).toSorted();
}

/**
 * Whether two values of a compared field say the same thing.
 *
 * Deep by value, because the fields that are not scalars — a code binding, a
 * drill-down target, a flow's ordered participants — are small closed records
 * the contract owns, and two of them mean the same thing exactly when they read
 * the same.
 * @param before What the predecessor said.
 * @param after What this variant says.
 * @returns True when nothing moved.
 */
function same(before: unknown, after: unknown): boolean {
	if (before === after) {
		return true;
	}
	if (before === undefined || after === undefined) {
		return false;
	}
	return JSON.stringify(before) === JSON.stringify(after);
}

/**
 * The fields that moved between two versions of one subject.
 * @param before The subject as the predecessor had it.
 * @param after The subject as this variant has it.
 * @param fields Which fields say what the subject is.
 * @returns The fields that moved, in the order they are compared.
 */
function moved(
	before: Readonly<Record<string, unknown>>,
	after: Readonly<Record<string, unknown>>,
	fields: readonly string[],
): FieldChange[] {
	const changes: FieldChange[] = [];
	for (const field of fields) {
		if (!same(comparable(field, before[field]), comparable(field, after[field]))) {
			// What is reported is what is written, not what was compared: a reader
			// asking what moved wants the flow's own order back, not a sorted copy.
			changes.push({ field, before: before[field], after: after[field] });
		}
	}
	return changes;
}

/**
 * Compare one kind of subject by identity.
 * @param before The predecessor's subjects.
 * @param after This variant's subjects.
 * @param fields Which fields say what the subject is.
 * @returns Every subject either variant has, and how it stands.
 */
function compareSubjects<Entity extends { readonly id: string }>(
	before: readonly Entity[],
	after: readonly Entity[],
	fields: readonly string[],
): Map<string, SubjectChange<Entity>> {
	const had = new Map(before.map((entity) => [entity.id, entity]));
	const changes = new Map<string, SubjectChange<Entity>>();
	for (const entity of after) {
		const was = had.get(entity.id);
		changes.set(entity.id, standing(entity, was, fields));
	}
	for (const entity of before) {
		if (!changes.has(entity.id)) {
			changes.set(entity.id, { kind: "removed", entity, fields: [] });
		}
	}
	return changes;
}

/**
 * How one subject stands: new, moved, or exactly as it was.
 * @param entity The subject as this variant has it.
 * @param was The subject as the predecessor had it, when it had it.
 * @param fields Which fields say what the subject is.
 * @returns Its standing.
 */
function standing<Entity extends { readonly id: string }>(
	entity: Entity,
	was: Entity | undefined,
	fields: readonly string[],
): SubjectChange<Entity> {
	if (was === undefined) {
		return { kind: "added", entity, fields: [] };
	}
	const changes = moved(was, entity, fields);
	return changes.length === 0
		? { kind: "unchanged", entity, fields: [] }
		: { kind: "changed", entity, fields: changes };
}

/**
 * Every step of every flow, flattened and carrying where it stands, so steps
 * compare by identity across a flow that was reordered or rewritten.
 * @param content A variant's content.
 * @param against The other state, so a place is counted over what both hold.
 * @returns The steps, each with its flow and its place in it.
 */
function stepsOf(content: VariantContent, against: VariantContent): PlacedStep[] {
	return content.flows.flatMap((flow) => {
		const ranks = rankedAgainst(
			flow.steps.map((step) => step.id),
			stepsHeld(against, flow.id),
		);
		return flow.steps.map((step, index) => ({
			...step,
			flow: flow.id,
			position: ranks.get(step.id) ?? index + 1,
		}));
	});
}

/**
 * The ids one flow holds in another state of the same variant family.
 * @param content The other state.
 * @param flow The flow.
 * @returns Its step ids there, or none when that state has no such flow.
 */
function stepsHeld(content: VariantContent, flow: string): string[] {
	return content.flows.find((one) => one.id === flow)?.steps.map((step) => step.id) ?? [];
}

/**
 * The ids one walkthrough holds in another state of the same variant family.
 * @param content The other state.
 * @param walkthrough The walkthrough.
 * @returns Its beat ids there, or none when that state has no such walkthrough.
 */
function beatsHeld(content: VariantContent, walkthrough: string): string[] {
	return (
		content.walkthroughs.find((one) => one.id === walkthrough)?.beats.map((beat) => beat.id) ?? []
	);
}

/**
 * Where each entry stands among the entries the other state also holds.
 *
 * Counted over what both hold, never over the whole list. An entry inserted at
 * the top shifts every absolute index after it, and comparing those would say
 * that adding one step changed every step that follows — which is the opposite
 * of what happened, and would badge most of a sequence for one addition.
 * @param ids The entries in this state, in order.
 * @param alsoIn The entries the other state holds.
 * @returns The rank of each shared entry, counting from one.
 */
function rankedAgainst(ids: readonly string[], alsoIn: readonly string[]): Map<string, number> {
	const shared = new Set(alsoIn);
	const ranks = new Map<string, number>();
	let rank = 0;
	for (const id of ids) {
		if (shared.has(id)) {
			rank += 1;
			ranks.set(id, rank);
		}
	}
	return ranks;
}

/**
 * Every beat of every walkthrough, flattened and carrying where it stands, so
 * beats compare by identity across an explanation that was reordered or
 * rewritten.
 * @param content A variant's content.
 * @param against The other state, so a place is counted over what both hold.
 * @returns The beats, each with its walkthrough and its place in it.
 */
function beatsOf(content: VariantContent, against: VariantContent): PlacedBeat[] {
	return content.walkthroughs.flatMap((walkthrough) => {
		const ranks = rankedAgainst(
			walkthrough.beats.map((beat) => beat.id),
			beatsHeld(against, walkthrough.id),
		);
		return walkthrough.beats.map((beat, index) => ({
			...beat,
			walkthrough: walkthrough.id,
			position: ranks.get(beat.id) ?? index + 1,
		}));
	});
}

/**
 * What one variant changed about the variant it came from.
 * @param before The predecessor's content.
 * @param after This variant's content.
 * @returns Every subject either of them has, and how it stands.
 */
function compareVariants(before: VariantContent, after: VariantContent): VariantComparison {
	return {
		nodes: compareSubjects(before.nodes, after.nodes, COMPARED.node),
		edges: compareSubjects(before.edges, after.edges, COMPARED.edge),
		flows: compareSubjects(before.flows, after.flows, COMPARED.flow),
		steps: compareSubjects(stepsOf(before, after), stepsOf(after, before), COMPARED.step),
		walkthroughs: compareSubjects(before.walkthroughs, after.walkthroughs, COMPARED.walkthrough),
		beats: compareSubjects(beatsOf(before, after), beatsOf(after, before), COMPARED.beat),
	};
}

/**
 * The content a proposal is drawn from, with what it removed put back in.
 *
 * This is the derived depiction and it exists only here: a removed subject is
 * never written into the proposal, so the proposal on disk keeps saying what
 * the architecture would be, and the picture keeps showing what the change
 * takes away. A removed node's container comes back with it when it too was
 * removed, so nothing is drawn floating outside the thing it was inside.
 * @param before The predecessor's content, including its original step order.
 * @param after This variant's content.
 *
 * Nothing narrative comes back. A removed beat is not drawn anywhere, so
 * restoring it would put a paragraph about a deleted service back into an
 * explanation its author took it out of, which is the one thing a derived
 * depiction must never do: it would be archboard authoring prose.
 * @param comparison What it changed.
 * @returns The content to draw, with removed subjects restored from the baseline.
 */
function withRemoved(
	before: VariantContent,
	after: VariantContent,
	comparison: VariantComparison,
): VariantContent {
	return {
		nodes: [...after.nodes, ...removedFrom(comparison.nodes)],
		edges: [...after.edges, ...removedFrom(comparison.edges)],
		flows: flowsWithRemoved(before.flows, after.flows, comparison),
		walkthroughs: after.walkthroughs,
	};
}

/**
 * The flows a proposal is drawn from, with what it took out put back.
 *
 * A step taken out of a flow goes back where it was, so the picture shows the
 * exchange as it was and where the proposal cut into it; a flow taken out
 * entirely comes back whole, steps and all. A removed step of a removed flow is
 * restored once, with its flow, rather than twice.
 * @param before The predecessor's flows in their original order.
 * @param flows The proposal's flows.
 * @param comparison What the proposal changed.
 * @returns The flows to draw.
 */
function flowsWithRemoved(
	before: readonly SemanticFlow[],
	flows: readonly SemanticFlow[],
	comparison: VariantComparison,
): SemanticFlow[] {
	const gone = new Set(removedFrom(comparison.steps).map((step) => step.id));
	const baseline = new Map(before.map((flow) => [flow.id, flow.steps]));
	const kept = flows.map((flow) => {
		const steps = replaced(baseline.get(flow.id) ?? [], flow.steps, gone);
		return {
			...flow,
			steps,
			// Restored steps need columns even when their nodes still exist but
			// no longer participate in the proposed exchange.
			participants: [
				...new Set([...flow.participants, ...steps.flatMap((step) => [step.from, step.to])]),
			],
		};
	});
	return [...kept, ...removedFrom(comparison.flows)];
}

/**
 * Restore deleted runs before their next surviving baseline step, preserving
 * the proposal's order. A run with no surviving successor comes at the end.
 * @param before The predecessor's steps in their original order.
 * @param steps The steps the proposal states.
 * @param gone The step ids removed from the architecture.
 * @returns The proposed exchange with its deleted runs anchored to continuations.
 */
function replaced(
	before: readonly FlowStep[],
	steps: readonly FlowStep[],
	gone: ReadonlySet<string>,
): FlowStep[] {
	const surviving = new Set(steps.map((step) => step.id));
	const preceding = new Map<string, FlowStep[]>();
	let pending: FlowStep[] = [];
	for (const step of before) {
		if (gone.has(step.id)) {
			pending.push(step);
		} else if (surviving.has(step.id)) {
			preceding.set(step.id, pending);
			pending = [];
		}
	}
	return [...steps.flatMap((step) => [...(preceding.get(step.id) ?? []), step]), ...pending];
}

/**
 * The subjects a comparison found removed, in the order the baseline had them.
 * @param changes One kind of subject's comparison.
 * @returns The removed entities.
 */
function removedFrom<Entity>(changes: ReadonlyMap<string, SubjectChange<Entity>>): Entity[] {
	const removed: Entity[] = [];
	for (const change of changes.values()) {
		if (change.kind === "removed") {
			removed.push(change.entity);
		}
	}
	return removed;
}

/**
 * How one subject stands, by id, whichever kind it is.
 * @param comparison What the variant changed.
 * @param id The subject's identity.
 * @returns Its standing, or "unchanged" for a subject the comparison never saw.
 */
function standingOf(comparison: VariantComparison, id: string): ChangeKind {
	for (const changes of [
		comparison.nodes,
		comparison.edges,
		comparison.flows,
		comparison.steps,
		comparison.walkthroughs,
		comparison.beats,
	]) {
		const change = changes.get(id);
		if (change !== undefined) {
			return change.kind;
		}
	}
	return "unchanged";
}

export {
	type ChangeKind,
	type PlacedStep,
	type PlacedBeat,
	type FieldChange,
	type SubjectChange,
	type VariantComparison,
	compareVariants,
	withRemoved,
	standingOf,
};
