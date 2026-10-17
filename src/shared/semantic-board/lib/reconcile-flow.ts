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
	emptiedHolder,
	flatSteps,
	holdersFirst,
	nestedSteps,
	type FlatStep,
} from "@/shared/semantic-board/lib/flow-steps";
import type { OrderedIssue } from "@/shared/semantic-board/lib/reconcile-told";
import type { FlowStep, SemanticFlow } from "@/shared/semantic-board/lib/views";

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
	if (placesOf(flatSteps(steps)) !== placesOf(flat)) {
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

export { leftEmpty, toldFlow };
