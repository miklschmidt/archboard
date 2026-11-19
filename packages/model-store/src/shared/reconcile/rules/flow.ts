// A flow's merged steps built back into a tree, or the reason they cannot be.
//
// Reconciliation merges a flow on its flat reading (ADR 0053): each step alone,
// with `within` naming the decision alternative or loop that holds it. The
// merged list then has to be a tree again, and not every list is one. A step
// one side put between two steps the other side moved into a loop either runs
// on every pass or once after it, and the flat list does not say which. Built
// anyway, the tree would tell the flow in an order nobody wrote. So a list
// whose tree reads back differently is held as a competing order of the whole
// flow, and the proposal keeps the steps it told.

import {
	type FlatStep,
	type FlowDecision,
	type FlowLoop,
	type FlowStep,
	nestedSteps,
	readFlow,
	type SemanticFlow,
} from "@archboard/model-contract";
import type { OrderedIssue } from "#shared/reconcile/rules/told-order.ts";

/** One flow's merge on its flat reading, and the states it was merged from. */
interface FlowMerge {
	/** The flow as it merged by identity. */
	readonly flow: SemanticFlow;
	/** The merged flat steps, in the order the merge decided. */
	readonly entries: readonly FlatStep[];
	/** What the flat merge left to settle. */
	readonly issues: readonly OrderedIssue[];
	/** The flow's flat steps when the two sides last agreed. */
	readonly base: readonly FlatStep[];
	/** The flow's steps as this proposal tells them. */
	readonly mine: readonly FlowStep[];
	/** The flow's steps as the predecessor tells them now. */
	readonly theirs: readonly FlowStep[];
}

/**
 * A flow's merged steps as a tree, or this proposal's own steps and the issue
 * that keeps the merge from being written.
 * @param merge The flow's flat merge and its three states.
 * @returns The steps to keep, and every issue about them.
 */
function toldFlow(merge: FlowMerge): { steps: FlowStep[]; issues: OrderedIssue[] } {
	const { flow, issues, mine } = merge;
	const flat = holdersFirst(merge.entries, new Set(merge.base.map((step) => step.id)));
	const steps = nestedSteps(flat);
	const emptied = emptiedHolder(steps);
	if (flat.length === 0 || emptied !== undefined) {
		// Each side removed what the other kept, and between them they have emptied
		// the exchange, or a decision or loop inside it. Neither removal is a
		// conflict on its own and no third state is implied, so this proposal
		// keeps what it told and the incoherence is said out loud — a flow with
		// nothing in it is not a document anybody can write, let alone read.
		const empty =
			emptied === undefined
				? leftEmpty(flow.id, "flow", flow.name)
				: leftEmpty(emptied.id, emptied.kind, holderWords(emptied));
		return { steps: [...mine], issues: [...issues, empty] };
	}
	if (placesOf(readFlow(steps).flat) !== placesOf(flat)) {
		// The order the merge decided is a list no tree reads back as. Whichever
		// tree was written would place a step somewhere neither side put it, so
		// the whole flow's order is the one disagreement, and it replaces any
		// about single steps of it.
		const others = issues.filter((issue) => issue.kind !== "competing-order");
		return { steps: [...mine], issues: [...others, competingOrder(merge)] };
	}
	return { steps, issues: [...issues] };
}

/**
 * Where every step of a flat reading stands, in order, as one comparable value.
 * @param flat The flat steps.
 * @returns Each step's id and holder, in order.
 */
function placesOf(flat: readonly FlatStep[]): string {
	return JSON.stringify(
		flat.map((step) => [step.id, step.within?.step ?? null, step.within?.alternative ?? null]),
	);
}

/**
 * The words a decision or loop is known by.
 * @param holder The decision or loop.
 * @returns Its question or condition.
 */
function holderWords(holder: Extract<FlowStep, { kind: "decision" | "loop" }>): string {
	return holder.kind === "loop" ? holder.condition : holder.question;
}

/** A flow's steps by id alone: a holder as an object naming what it holds. */
type StepOutline =
	| string
	| { readonly loop: string; readonly steps: StepOutline[] }
	| { readonly decision: string; readonly alternatives: Record<string, StepOutline[]> };

/**
 * A flow's steps by id, nesting and all: what one side of an order disagreement
 * tells, short enough to read.
 * @param steps The steps.
 * @returns The outline.
 */
function outlineOf(steps: readonly FlowStep[]): StepOutline[] {
	return steps.map((step) => {
		if (step.kind === "decision") {
			const alternatives = step.alternatives.map((one) => [one.label, outlineOf(one.steps)]);
			return { decision: step.id, alternatives: Object.fromEntries(alternatives) };
		}
		return step.kind === "loop" ? { loop: step.id, steps: outlineOf(step.steps) } : step.id;
	});
}

/**
 * The disagreement about the order of a whole flow.
 * @param merge The flow's merge and its states.
 * @returns The issue.
 */
function competingOrder(merge: FlowMerge): OrderedIssue {
	return {
		subject: merge.flow.id,
		what: "flow",
		kind: "competing-order",
		field: "steps",
		mine: outlineOf(merge.mine),
		theirs: outlineOf(merge.theirs),
		repair:
			`This proposal and the variant it came from both changed where the steps of ` +
			`"${merge.flow.name}" go, and together they leave a step whose place neither side ` +
			"chose. Keep this proposal's order, or tell the flow again in the order it means.",
	};
}

/**
 * What to say when a merge would leave something with nothing to tell.
 * @param subject The flow or walkthrough.
 * @param what Which of those it is.
 * @param name What it is called.
 * @returns The issue.
 */
function leftEmpty(subject: string, what: string, name: string): OrderedIssue {
	return {
		subject,
		what,
		kind: "left-empty",
		mine: "kept what it told",
		theirs: "removed the rest",
		repair:
			`This proposal and the variant it came from removed different parts of "${name}", and ` +
			`between them they leave the ${what} with nothing in it. Say what it should tell now, or ` +
			`remove the ${what} here.`,
	};
}

/**
 * A flat reading with each new decision or loop put immediately before the
 * first step it holds.
 *
 * A merge places the steps a decision or loop holds by the order the two sides
 * tell them in, and nothing places the holder itself: where it was added it
 * only followed something. Put anywhere else, building the tree pulls its steps
 * up to it and pushes whatever stood between them after it, which is an order
 * nobody wrote. A holder the base already had keeps its place, because where
 * it stands is part of the order the merge decided.
 * @param flat The flat steps, as a merge ordered them.
 * @param placed The steps whose place the merge decided: the base's.
 * @returns The same steps, the new holders moved.
 */
function holdersFirst(flat: readonly FlatStep[], placed: ReadonlySet<string>): FlatStep[] {
	const holderOf = new Map(flat.map((one) => [one.id, one.within?.step]));
	const moving = new Map(
		flat
			.filter((one) => (one.kind === "decision" || one.kind === "loop") && !placed.has(one.id))
			.map((one) => [one.id, one]),
	);
	const holding = new Set(flat.flatMap((one) => holdersOf(one.id, holderOf)));
	const out: FlatStep[] = [];
	for (const one of flat) {
		if (!(moving.has(one.id) && holding.has(one.id))) {
			out.push(...unplacedHolders(one.id, { holderOf, moving, out }), one);
		}
	}
	return out;
}

/**
 * Every decision or loop that holds a step, nearest first.
 * @param id The step.
 * @param holderOf What holds each step.
 * @returns Its holders, out to the top of the flow.
 */
function holdersOf(id: string, holderOf: ReadonlyMap<string, string | undefined>): string[] {
	const chain: string[] = [];
	for (let up = holderOf.get(id); up !== undefined && !chain.includes(up); up = holderOf.get(up)) {
		chain.push(up);
	}
	return chain;
}

/**
 * The new holders a step needs in front of it that are not yet placed,
 * outermost first.
 * @param id The step.
 * @param placing What is being placed.
 * @param placing.holderOf What holds each step.
 * @param placing.moving The new holders, by id.
 * @param placing.out The steps placed so far.
 * @returns The holders to place before it.
 */
function unplacedHolders(
	id: string,
	placing: {
		readonly holderOf: ReadonlyMap<string, string | undefined>;
		readonly moving: ReadonlyMap<string, FlatStep>;
		readonly out: readonly FlatStep[];
	},
): FlatStep[] {
	return holdersOf(id, placing.holderOf)
		.toReversed()
		.flatMap((up) => {
			const holder = placing.moving.get(up);
			return holder === undefined || placing.out.includes(holder) ? [] : [holder];
		});
}

/**
 * The first decision or loop in a tree that holds no message any more: a loop
 * with nothing to repeat, or a decision whose every alternative is empty. A
 * merge or a restore can leave one, and no document can hold one.
 * @param steps The steps of a flow.
 * @returns The emptied step, or undefined when every holder still holds a step.
 */
function emptiedHolder(steps: readonly FlowStep[]): FlowDecision | FlowLoop | undefined {
	for (const step of readFlow(steps).every) {
		if (step.kind === "loop" && step.steps.length === 0) return step;
		if (step.kind === "decision" && step.alternatives.every((one) => one.steps.length === 0)) {
			return step;
		}
	}
	return undefined;
}

export { emptiedHolder, holdersFirst, leftEmpty, toldFlow };
