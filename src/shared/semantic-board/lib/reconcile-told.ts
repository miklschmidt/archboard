// Reconciling the parts of a variant that are told in an order.
//
// A sequence's steps and a walkthrough's beats are not a set: "the reply comes
// back before the ledger is written" and "explain the queue before the store"
// are claims, and two people ordering them differently disagree about something
// real. So order is merged rather than overwritten, and where the two orderings
// genuinely differ it is held as a conflict — an index is never picked because
// it is smaller.
//
// Order is compared over the entries both sides still hold. Anything one side
// added or removed shifts every index after it, and comparing raw positions
// would report a conflict every time somebody inserted a step at the top. What
// is compared is the relative order of the entries in common, which is the only
// thing two sides can actually disagree about.
//
// When only the predecessor reordered, its order is taken — in place. The slots
// this proposal's own entries occupy are left exactly where they are and the
// shared entries are dealt back into the slots they were in, so a step this
// proposal inserted in the middle stays in the middle instead of being swept to
// the end by somebody else's reordering.

import type { VariantContent } from "@/shared/semantic-board/lib/content";
import type { ChangedField } from "@/shared/semantic-board/lib/reconcile-standing";
import type { FlowStep, SemanticFlow } from "@/shared/semantic-board/lib/views";
import type { SemanticWalkthrough, WalkthroughBeat } from "@/shared/semantic-board/lib/walkthrough";

/** One disagreement about something told in an order. */
interface OrderedIssue {
	readonly subject: string;
	readonly what: string;
	readonly kind: "competing-field" | "competing-order" | "deleted-and-changed" | "left-empty";
	readonly field?: string;
	readonly mine: unknown;
	readonly theirs: unknown;
	/** For a removal against a change: what the changing side changed, and to what. */
	readonly changed?: readonly ChangedField[];
	readonly repair: string;
}

/** The fields that say what a step and a beat are. */
const TOLD_FIELDS = {
	step: ["from", "to", "label", "kind", "note", "repeat"],
	beat: ["heading", "body", "subjects", "view"],
} as const;

/**
 * One side of a disagreement, in a shape a document can hold: an unwritten
 * field is absent once the board is JSON, and an issue that lost the very field
 * it is about would be refused when it was read back.
 * @param value What that side says, or nothing when it says nothing.
 * @returns The value, or null for nothing written.
 */
function stated(value: unknown): unknown {
	return value === undefined ? null : value;
}

/**
 * Whether two values say the same thing.
 * @param one A value.
 * @param other The other.
 * @returns True when nothing is between them.
 */
function same(one: unknown, other: unknown): boolean {
	return one === other || JSON.stringify(one) === JSON.stringify(other);
}

/** One entry's three states. */
interface EntrySides<Entry> {
	readonly base: readonly Entry[];
	readonly mine: readonly Entry[];
	readonly theirs: readonly Entry[];
}

/**
 * Merge one ordered list by identity, then by order.
 * @param sides The three states of the list.
 * @param fields The fields that say what an entry is.
 * @param what The word for one entry in an issue.
 * @returns The merged list and what is left to settle.
 */
function mergeTold<Entry extends { readonly id: string }>(
	sides: EntrySides<Entry>,
	fields: readonly string[],
	what: string,
): { entries: Entry[]; issues: OrderedIssue[] } {
	const settled = settledEntries(sides, fields, what);
	const ordered = orderOf(
		{
			base: sides.base.map((entry) => entry.id),
			mine: settled.entries.map((entry) => entry.id),
			theirs: sides.theirs.map((entry) => entry.id),
		},
		what,
	);
	const held = new Map(settled.entries.map((entry) => [entry.id, entry]));
	return {
		entries: ordered.ids.flatMap((id) => {
			const entry = held.get(id);
			return entry === undefined ? [] : [entry];
		}),
		issues: [...settled.issues, ...ordered.issues],
	};
}

/**
 * Every entry the merged list holds, field-merged, in this proposal's order
 * with the predecessor's additions put where it put them.
 * @param sides The three states of the list.
 * @param fields The fields that say what an entry is.
 * @param what The word for one entry in an issue.
 * @returns The entries and their issues.
 */
function settledEntries<Entry extends { readonly id: string }>(
	sides: EntrySides<Entry>,
	fields: readonly string[],
	what: string,
): { entries: Entry[]; issues: OrderedIssue[] } {
	const base = new Map(sides.base.map((entry) => [entry.id, entry]));
	const theirs = new Map(sides.theirs.map((entry) => [entry.id, entry]));
	const mineById = new Set(sides.mine.map((entry) => entry.id));
	const entries: Entry[] = [];
	const issues: OrderedIssue[] = [];
	for (const mine of sides.mine) {
		const settled = settleEntry({ mine, base: base.get(mine.id), theirs, fields, what });
		entries.push(...settled.entries);
		issues.push(...settled.issues);
	}
	issues.push(...removedHereIssues({ base, theirs, mineById }, fields, what));
	for (const [index, entry] of sides.theirs.entries()) {
		if (!base.has(entry.id) && !sides.mine.some((one) => one.id === entry.id)) {
			entries.splice(afterAnchor(sides.theirs, index, entries), 0, entry);
		}
	}
	return { entries, issues };
}

/**
 * Where an entry the predecessor added belongs in the merged list.
 *
 * After whatever it followed there — the nearest entry before it that the
 * merged list also holds — rather than at the index it happened to occupy. Two
 * sides inserting independently both shift each other's indices, and going by
 * the number would interleave them wrongly: a step the predecessor put last can
 * land in the middle of this proposal's own additions.
 * @param theirs The predecessor's list.
 * @param index Where the added entry sits in it.
 * @param entries The merged list so far.
 * @returns The slot to insert at.
 */
function afterAnchor<Entry extends { readonly id: string }>(
	theirs: readonly Entry[],
	index: number,
	entries: readonly Entry[],
): number {
	const held = entries.map((entry) => entry.id);
	for (const before of theirs.slice(0, index).toReversed()) {
		const at = held.indexOf(before.id);
		if (at >= 0) {
			return at + 1;
		}
	}
	// Nothing it followed is here, so it opens the list, as it does there.
	return 0;
}

/** One list's three states, as ids. */
interface Removed<Entry> {
	readonly base: ReadonlyMap<string, Entry>;
	readonly theirs: ReadonlyMap<string, Entry>;
	readonly mineById: ReadonlySet<string>;
}

/**
 * Everything this proposal removed that the predecessor went on to change.
 *
 * The removal stands — this proposal meant it — and the disagreement is said
 * out loud rather than swallowed by the side that deleted first.
 * @param states The three states of the list.
 * @param fields The fields that say what an entry is.
 * @param what The word for one entry.
 * @returns The issues.
 */
function removedHereIssues<Entry extends object>(
	states: Removed<Entry>,
	fields: readonly string[],
	what: string,
): OrderedIssue[] {
	const issues: OrderedIssue[] = [];
	for (const [id, was] of states.base) {
		const now = states.theirs.get(id);
		if (!states.mineById.has(id) && now !== undefined) {
			issues.push(...removedHere(id, was, now, fields, what));
		}
	}
	return issues;
}

/**
 * What to say about an entry this proposal removed and the predecessor changed.
 * @param id The entry.
 * @param was It as it was when the two agreed.
 * @param now It as the predecessor has it.
 * @param fields The fields that say what it is.
 * @param what The word for one entry.
 * @returns The issue, or none when the predecessor left it alone.
 */
function removedHere<Entry extends object>(
	id: string,
	was: Entry,
	now: Entry,
	fields: readonly string[],
	what: string,
): OrderedIssue[] {
	const changed = changedFields(was, now, fields);
	if (changed.length === 0) {
		return [];
	}
	return [
		{
			subject: id,
			what,
			kind: "deleted-and-changed",
			mine: "removed it",
			theirs: `changed ${changed.map((field) => field.field).join(", ")}`,
			changed,
			repair:
				`This proposal removed this ${what}, and the variant it came from changed it. Keep the ` +
				`removal and say so, or take the change by stating the ${what} again under this id, ` +
				"with the values this disagreement carries for each field it changed.",
		},
	];
}

/** One entry being settled. */
interface EntrySettling<Entry> {
	readonly mine: Entry;
	readonly base: Entry | undefined;
	readonly theirs: ReadonlyMap<string, Entry>;
	readonly fields: readonly string[];
	readonly what: string;
}

/**
 * Settle one entry this proposal holds against the predecessor.
 * @param settling The entry and its states.
 * @returns The entry to keep, if any, and what is left to settle.
 */
function settleEntry<Entry extends { readonly id: string }>(
	settling: EntrySettling<Entry>,
): { entries: Entry[]; issues: OrderedIssue[] } {
	const { mine, base, fields, what } = settling;
	const theirs = settling.theirs.get(mine.id);
	if (base === undefined) {
		return { entries: [mine], issues: [] };
	}
	if (theirs === undefined) {
		return removedUnderMe(mine, base, fields, what);
	}
	const merged = mergeEntryFields(mine, base, theirs, fields, what);
	return { entries: [merged.entry], issues: merged.issues };
}

/**
 * An entry the predecessor removed: gone when nothing here touched it, held
 * with its disagreement when something did.
 * @param mine The entry as this proposal has it.
 * @param base The entry as it was when the two agreed.
 * @param fields The fields that say what it is.
 * @param what The word for one entry in an issue.
 * @returns The entry to keep, if any, and what is left to settle.
 */
function removedUnderMe<Entry extends { readonly id: string }>(
	mine: Entry,
	base: Entry,
	fields: readonly string[],
	what: string,
): { entries: Entry[]; issues: OrderedIssue[] } {
	const changed = changedFields(base, mine, fields);
	if (changed.length === 0) {
		return { entries: [], issues: [] };
	}
	return {
		entries: [mine],
		issues: [
			{
				subject: mine.id,
				what,
				kind: "deleted-and-changed",
				mine: `changed ${changed.map((field) => field.field).join(", ")}`,
				theirs: "removed it",
				changed,
				repair:
					`The variant this proposal came from removed this ${what}, and this proposal changed ` +
					"it. Keep the change and drop the removal, or remove it here too.",
			},
		],
	};
}

/**
 * One field of one entry.
 * @param entry The entry.
 * @param field The field's name.
 * @returns Its value.
 */
function valueOf(entry: object, field: string): unknown {
	return Object.entries(entry).find(([name]) => name === field)?.[1];
}

/**
 * The fields one side moved, with the values to settle them out of: a removal
 * against a change is settled by stating the entry again, and that is written
 * out of values rather than field names (TASK-256.09).
 * @param was The entry as the two sides had it when they last agreed.
 * @param now The entry as the side that changed it has it.
 * @param fields The fields that say what it is.
 * @returns One entry per field that moved.
 */
function changedFields<Entry extends object>(
	was: Entry,
	now: Entry,
	fields: readonly string[],
): ChangedField[] {
	return fields
		.filter((field) => !same(valueOf(now, field), valueOf(was, field)))
		.map((field) => ({
			field,
			before: stated(valueOf(was, field)),
			after: stated(valueOf(now, field)),
		}));
}

/**
 * Merge one entry the predecessor still holds, field by field.
 * @param mine The entry as this proposal has it.
 * @param base The entry as it was when the two agreed.
 * @param theirs The entry as the predecessor has it now.
 * @param fields The fields that say what it is.
 * @param what The word for one entry in an issue.
 * @returns The settled entry and what is left to settle.
 */
function mergeEntryFields<Entry extends { readonly id: string }>(
	mine: Entry,
	base: Entry,
	theirs: Entry,
	fields: readonly string[],
	what: string,
): { entry: Entry; issues: OrderedIssue[] } {
	let settled = mine;
	const issues: OrderedIssue[] = [];
	for (const field of fields) {
		const ours = valueOf(mine, field);
		const was = valueOf(base, field);
		const yours = valueOf(theirs, field);
		if (same(ours, yours) || same(yours, was)) {
			continue;
		}
		if (same(ours, was)) {
			settled = { ...settled, [field]: yours };
			continue;
		}
		issues.push({
			subject: mine.id,
			what,
			kind: "competing-field",
			field,
			mine: stated(ours),
			theirs: stated(yours),
			repair:
				`This proposal and the variant it came from both changed \`${field}\` of this ${what}. ` +
				"Say which one this proposal means, or write a third answer.",
		});
	}
	return { entry: settled, issues };
}

/** The three orderings of one list, by id. */
interface Orders {
	readonly base: readonly string[];
	readonly mine: readonly string[];
	readonly theirs: readonly string[];
}

/**
 * The order the merged list is told in, and any disagreement about it.
 *
 * Only the entries all three hold are compared: an insertion moves everything
 * after it, and reporting that as a reordering would make every addition a
 * conflict.
 * @param orders The three orderings.
 * @param what The word for one entry in an issue.
 * @returns The merged order and what is left to settle.
 */
function orderOf(orders: Orders, what: string): { ids: readonly string[]; issues: OrderedIssue[] } {
	const shared = orders.base.filter((id) => orders.mine.includes(id) && orders.theirs.includes(id));
	const mine = orders.mine.filter((id) => shared.includes(id));
	const theirs = orders.theirs.filter((id) => shared.includes(id));
	const was = shared;
	if (same(mine, theirs) || same(theirs, was)) {
		// They agree, or only this proposal moved anything.
		return { ids: orders.mine, issues: [] };
	}
	if (same(mine, was)) {
		return { ids: dealtInto(orders.mine, theirs), issues: [] };
	}
	return { ids: orders.mine, issues: movedApart(mine, theirs, what) };
}

/**
 * This proposal's list with the shared entries dealt back into the slots they
 * already occupied, in the predecessor's order.
 * @param mine This proposal's order, additions and all.
 * @param theirs The predecessor's order of the shared entries.
 * @returns The order to tell it in.
 */
function dealtInto(mine: readonly string[], theirs: readonly string[]): string[] {
	const shared = new Set(theirs);
	const coming = [...theirs];
	return mine.map((id) => (shared.has(id) ? (coming.shift() ?? id) : id));
}

/**
 * One issue for each shared entry the two sides put in a different place.
 * @param mine This proposal's order of the shared entries.
 * @param theirs The predecessor's order of them.
 * @param what The word for one entry in an issue.
 * @returns The issues.
 */
function movedApart(
	mine: readonly string[],
	theirs: readonly string[],
	what: string,
): OrderedIssue[] {
	return mine.flatMap((id, index) =>
		theirs.indexOf(id) === index
			? []
			: [
					{
						subject: id,
						what,
						kind: "competing-order" as const,
						field: "position",
						mine: index + 1,
						theirs: theirs.indexOf(id) + 1,
						repair:
							`This proposal and the variant it came from both moved this ${what}, to different ` +
							"places. Say which order this proposal means; nothing here picks one.",
					},
				],
	);
}

/** The containers whose ordered contents are being merged. */
interface Containers {
	readonly flows: readonly SemanticFlow[];
	readonly walkthroughs: readonly SemanticWalkthrough[];
}

/** The three states a merge is decided from. */
interface States {
	readonly base: VariantContent;
	readonly mine: VariantContent;
	readonly theirs: VariantContent;
}

/**
 * Merge what every flow and every walkthrough tells, in order.
 * @param states The base, this proposal, and the predecessor as it stands.
 * @param settled The flows and walkthroughs as they merged by identity.
 * @returns The containers with their ordered contents merged, and the issues.
 */
function reconcileTold(
	states: States,
	settled: Containers,
): { flows: SemanticFlow[]; walkthroughs: SemanticWalkthrough[]; issues: OrderedIssue[] } {
	const issues: OrderedIssue[] = [];
	const flows = settled.flows.map((flow) => {
		const merged = mergeTold<FlowStep>(
			{
				base: stepsIn(states.base.flows, flow.id),
				mine: stepsIn(states.mine.flows, flow.id),
				theirs: stepsIn(states.theirs.flows, flow.id),
			},
			TOLD_FIELDS.step,
			"step",
		);
		issues.push(...merged.issues);
		if (merged.entries.length > 0) {
			return { ...flow, steps: merged.entries };
		}
		// Each side removed what the other kept, and between them they have emptied
		// the exchange. Neither removal is a conflict on its own and no third state
		// is implied, so this proposal keeps what it told and the incoherence is
		// said out loud — a flow with nothing in it is not a document anybody can
		// write, let alone read.
		issues.push(leftEmpty(flow.id, "flow", flow.name));
		return { ...flow, steps: [...stepsIn(states.mine.flows, flow.id)] };
	});
	const walkthroughs = settled.walkthroughs.map((walkthrough) => {
		const merged = mergeTold<WalkthroughBeat>(
			{
				base: beatsIn(states.base.walkthroughs, walkthrough.id),
				mine: beatsIn(states.mine.walkthroughs, walkthrough.id),
				theirs: beatsIn(states.theirs.walkthroughs, walkthrough.id),
			},
			TOLD_FIELDS.beat,
			"beat",
		);
		issues.push(...merged.issues);
		if (merged.entries.length > 0) {
			return { ...walkthrough, beats: merged.entries };
		}
		issues.push(leftEmpty(walkthrough.id, "walkthrough", walkthrough.name));
		return { ...walkthrough, beats: [...beatsIn(states.mine.walkthroughs, walkthrough.id)] };
	});
	return { flows, walkthroughs, issues };
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
 * One flow's steps in one state.
 * @param flows That state's flows.
 * @param id The flow.
 * @returns Its steps, or none when that state has no such flow.
 */
function stepsIn(flows: readonly SemanticFlow[], id: string): readonly FlowStep[] {
	return flows.find((flow) => flow.id === id)?.steps ?? [];
}

/**
 * One walkthrough's beats in one state.
 * @param walkthroughs That state's walkthroughs.
 * @param id The walkthrough.
 * @returns Its beats, or none when that state has no such walkthrough.
 */
function beatsIn(
	walkthroughs: readonly SemanticWalkthrough[],
	id: string,
): readonly WalkthroughBeat[] {
	return walkthroughs.find((walkthrough) => walkthrough.id === id)?.beats ?? [];
}

export { reconcileTold, type OrderedIssue };
