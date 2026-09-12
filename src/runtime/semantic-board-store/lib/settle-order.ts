// Settling a disagreement about order, as opposed to one about a field.
//
// A field is a property of one subject: two states say a node is called
// different things, somebody picks one, and the base moves to what was picked
// so the next merge sees a settled field rather than the same argument again.
//
// Order is not like that. Where a step sits is a fact about the exchange it is
// part of, and `position` is not something a step holds — the merge invents it
// to describe the disagreement, and writing it back into a board would produce
// a document no board may hold. So the durable answer to "this proposal's order
// is the one I mean" is an order rather than a value: the base's exchange is
// dealt into the predecessor's order, which is what an answered field does too
// — once the base agrees with the predecessor, this proposal's own order reads
// as this proposal's own change and nothing synthetic is ever persisted.
//
// It follows that order is answered for a whole exchange at once. Positions are
// relative: settling where one step sits without settling the others would be
// deciding their places too, quietly, on somebody's behalf.

import type { ReconciliationIssue, VariantContent } from "@/shared/semantic-board/index";

/** Where an ordered entry lives: which container holds it, and of what kind. */
interface Ordered {
	/** Whether the container is an exchange or an explanation. */
	readonly kind: "flow" | "walkthrough";
	/** The container's id. */
	readonly container: string;
	/** What the container is called, for a refusal to quote. */
	readonly name: string;
}

/**
 * Which ordered container one entry belongs to.
 * @param content The content to look in.
 * @param subject The entry's id.
 * @returns Where it lives, or undefined when this content has no such entry.
 */
function orderedIn(content: VariantContent, subject: string): Ordered | undefined {
	const flow = content.flows.find((one) => one.steps.some((step) => step.id === subject));
	if (flow !== undefined) {
		return { kind: "flow", container: flow.id, name: flow.name };
	}
	const walkthrough = content.walkthroughs.find((one) =>
		one.beats.some((beat) => beat.id === subject),
	);
	return walkthrough === undefined
		? undefined
		: { kind: "walkthrough", container: walkthrough.id, name: walkthrough.name };
}

/**
 * The container whose order was answered for some of its entries and not the
 * rest, when there is one.
 *
 * Answering half of an order is not half a decision: the entries left out are
 * placed by the ones that were answered, so a settlement that took only some of
 * them would decide the rest without being asked.
 * @param content This proposal's content, which is where the entries live.
 * @param standing Every issue this proposal is holding.
 * @param taken The issues this command answered.
 * @returns The container left half-answered, or null when none is.
 */
function halfOrdered(
	content: VariantContent,
	standing: readonly ReconciliationIssue[],
	taken: readonly ReconciliationIssue[],
): Ordered | null {
	const answered = new Set(taken.filter(isOrder).map((issue) => issue.subject));
	if (answered.size === 0) {
		return null;
	}
	for (const issue of standing.filter(isOrder)) {
		const where = orderedIn(content, issue.subject);
		if (where === undefined || answered.has(issue.subject)) {
			continue;
		}
		if (sameContainer(content, where, answered)) {
			return where;
		}
	}
	return null;
}

/**
 * Whether any answered entry is in this container.
 * @param content This proposal's content.
 * @param where The container an unanswered entry is in.
 * @param answered The entries this command answered.
 * @returns True when this container was partly answered.
 */
function sameContainer(
	content: VariantContent,
	where: Ordered,
	answered: ReadonlySet<string>,
): boolean {
	for (const subject of answered) {
		const at = orderedIn(content, subject);
		if (at?.container === where.container) {
			return true;
		}
	}
	return false;
}

/**
 * Whether an issue is about where something sits rather than what it says.
 * @param issue The issue.
 * @returns True for an order disagreement.
 */
function isOrder(issue: ReconciliationIssue): boolean {
	return issue.kind === "competing-order";
}

/**
 * The base with every answered exchange dealt into the predecessor's order.
 *
 * The base is what the next merge is measured from, and what makes a decision
 * durable is that it stops disagreeing with the predecessor: with the base
 * telling the exchange the predecessor's way, this proposal's own order reads
 * as this proposal's own change and is left alone, exactly as an answered field
 * does. Leaving the base where it was would find the same argument again and
 * report it as though nobody had decided it.
 * @param base The state this proposal last agreed with.
 * @param theirs The predecessor's content, whose order the base takes.
 * @param moved The order issues this command answered.
 * @returns The base to keep, with nothing synthetic written into it.
 */
function reorderedInto(
	base: VariantContent,
	theirs: VariantContent,
	moved: readonly ReconciliationIssue[],
): VariantContent {
	const flows = new Set<string>();
	const walkthroughs = new Set<string>();
	for (const issue of moved) {
		const where = orderedIn(theirs, issue.subject);
		if (where !== undefined) {
			(where.kind === "flow" ? flows : walkthroughs).add(where.container);
		}
	}
	return {
		...base,
		flows: base.flows.map((flow) =>
			flows.has(flow.id) ? { ...flow, steps: told(flow.steps, stepsOf(theirs, flow.id)) } : flow,
		),
		walkthroughs: base.walkthroughs.map((one) =>
			walkthroughs.has(one.id) ? { ...one, beats: told(one.beats, beatsOf(theirs, one.id)) } : one,
		),
	};
}

/**
 * The order one content tells an exchange in.
 * @param content The content to read the order from.
 * @param flow The exchange's id.
 * @returns Its steps' ids, in order.
 */
function stepsOf(content: VariantContent, flow: string): readonly string[] {
	return content.flows.find((one) => one.id === flow)?.steps.map((step) => step.id) ?? [];
}

/**
 * The order one content tells an explanation in.
 * @param content The content to read the order from.
 * @param walkthrough The explanation's id.
 * @returns Its beats' ids, in order.
 */
function beatsOf(content: VariantContent, walkthrough: string): readonly string[] {
	return (
		content.walkthroughs.find((one) => one.id === walkthrough)?.beats.map((beat) => beat.id) ?? []
	);
}

/**
 * Entries dealt into another list's order, keeping what that list does not hold
 * exactly where it already was.
 *
 * The same rule the merge itself uses: the slots the shared entries occupy stay
 * theirs, and what goes in them is decided by the order being taken. Anything
 * only this list has is untouched, because nobody has said anything about it.
 * @param entries The entries to reorder.
 * @param wanted The order to tell them in, by id.
 * @returns The entries, reordered.
 */
function told<Entry extends { readonly id: string }>(
	entries: readonly Entry[],
	wanted: readonly string[],
): Entry[] {
	const held = new Map(entries.map((entry) => [entry.id, entry]));
	const shared = wanted.filter((id) => held.has(id));
	const taking = [...shared];
	return entries.map((entry) => {
		if (!shared.includes(entry.id)) {
			return entry;
		}
		const next = taking.shift();
		return next === undefined ? entry : (held.get(next) ?? entry);
	});
}

export { halfOrdered, isOrder, reorderedInto, type Ordered };
