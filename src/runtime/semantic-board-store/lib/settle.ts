// Settling a disagreement, and adopting an architecture.
//
// Both are commands that change what a board says about itself rather than what
// it draws, and both go through the one write boundary every other change does:
// the same board-global lease, the same expected version, one atomic write, one
// version advance (ADR 0016, ADR 0023).
//
// Settling answers disagreements a proposal is holding, one at a time or all at
// once, and then carries the answer down: a draft that was waiting on this one
// stops waiting, is merged, and reports whatever it finds — which may be a new
// disagreement of its own, discovered only now that its parent has decided.
//
// Adopting moves the `current` designation. It renames nothing, reparents
// nothing, and rewrites no history: the variant that was current becomes a
// historical state under its own name, the adopted one becomes current under
// its own name, and the move itself is written down. A proposal that was
// derived from either of them still says so, because ancestry is a record of
// where a state came from and adoption does not change where anything came
// from.

import {
	halfOrdered,
	isOrder,
	reorderedInto,
} from "@/runtime/semantic-board-store/lib/settle-order";
import {
	reconcileVariant,
	type Adoption,
	type Choice,
	type ReconciliationIssue,
	type ResolutionInput,
	type SemanticBoard,
	type SemanticVariant,
	type VariantStanding,
} from "@/shared/semantic-board/index";
import {
	propagateEdit,
	unsettledAncestor,
	withoutStanding,
	type DescendantOutcome,
} from "@/runtime/semantic-board-store/lib/propagate";
import { refuse, type SemanticRefusal } from "@/runtime/semantic-board-store/lib/outcome";

/** A settled proposal, or why it cannot be settled. */
type Settlement =
	| {
			readonly ok: true;
			readonly variants: readonly SemanticVariant[];
			/** What the drafts under it did once it stopped waiting. */
			readonly descendants: readonly DescendantOutcome[];
	  }
	| SemanticRefusal;

/**
 * Whether one choice answers one issue: the same subject, and the same field
 * when the issue is about a field.
 * @param choice What the caller decided.
 * @param issue What is standing.
 * @returns True when the choice is an answer to it.
 */
function answers(choice: Choice, issue: ReconciliationIssue): boolean {
	return choice.subject === issue.subject && (choice.field ?? issue.field) === issue.field;
}

/**
 * Settle a proposal's disagreements and carry the answer down its own
 * descendants.
 * @param board The board as it stands.
 * @param draft The proposal being settled.
 * @param input What it decides.
 * @param atVersion The version the board will carry once this write lands.
 * @returns The family afterwards, or the refusal.
 */
function settleVariant(
	board: SemanticBoard,
	draft: SemanticVariant,
	input: ResolutionInput,
	atVersion: number,
): Settlement {
	const standing = draft.reconciliation;
	if (standing === undefined) {
		return refuse(
			"NOTHING_TO_SETTLE",
			`"${draft.name}" is not waiting on anything, so there is nothing here to decide`,
		);
	}
	const unanswered = input.choices.filter(
		(choice) => !standing.issues.some((issue) => answers(choice, issue)),
	);
	if (unanswered.length > 0) {
		return refuse(
			"UNKNOWN_ISSUE",
			`"${draft.name}" is not holding a disagreement about ${describe(unanswered)}; read the ` +
				"board again — what it is waiting on has moved since this answer was written",
		);
	}
	const waiting = waitingAbove(board, draft, standing);
	if (waiting !== null) {
		return waiting;
	}
	const parent = board.variants.find((one) => one.id === standing.against);
	if (parent === undefined) {
		return refuse(
			"UNKNOWN_VARIANT",
			`"${draft.name}" is waiting on a variant this board no longer has`,
		);
	}
	return applyChoices(board, { draft, parent, standing, input, atVersion });
}

/**
 * Whether this draft is waiting on an ancestor rather than on itself.
 *
 * A draft that has not been merged has nothing here to answer: what it should
 * say depends on what the argument above it settles on, and answering now would
 * be deciding that argument twice, once in the wrong place.
 * @param board The board as it stands.
 * @param draft The proposal being settled.
 * @param standing What it is waiting on.
 * @returns The refusal, or null when it is free to settle its own.
 */
function waitingAbove(
	board: SemanticBoard,
	draft: SemanticVariant,
	standing: VariantStanding,
): SemanticRefusal | null {
	if (standing.blockedBy === undefined) {
		return null;
	}
	const ancestor = board.variants.find((one) => one.id === standing.blockedBy);
	return refuse(
		"VARIANT_BLOCKED",
		`"${draft.name}" is waiting on "${ancestor?.name ?? standing.blockedBy}", which is itself ` +
			"unsettled. Settle that first: what this proposal should say depends on what that one " +
			"decides, and answering here would be deciding it twice.",
	);
}

/**
 * What a refusal calls the choices that answered nothing.
 * @param choices The choices.
 * @returns A phrase naming them.
 */
function describe(choices: readonly Choice[]): string {
	return choices
		.map((choice) =>
			choice.field === undefined ? choice.subject : `${choice.subject}.${choice.field}`,
		)
		.join(", ");
}

/** Everything one settlement works from. */
interface Settling {
	readonly draft: SemanticVariant;
	readonly parent: SemanticVariant;
	readonly standing: VariantStanding;
	readonly input: ResolutionInput;
	readonly atVersion: number;
}

/**
 * Apply the answers, keep what is still open, and carry the result down.
 * @param board The board as it stands.
 * @param settling The proposal, its predecessor, what it holds and what it decides.
 * @returns The family afterwards, or the refusal.
 */
function applyChoices(board: SemanticBoard, settling: Settling): Settlement {
	const { draft, parent, standing, input, atVersion } = settling;
	const taken = standing.issues.filter((issue) =>
		input.choices.some((choice) => answers(choice, issue)),
	);
	const kept = standing.issues.filter((issue) => !taken.includes(issue));
	// Order is answered for a whole exchange at once. Where a step sits is
	// relative to the others, so answering some of them would place the rest
	// without anybody having said so.
	const half = halfOrdered(draft.content, standing.issues, taken);
	if (half !== null) {
		return refuse(
			"ORDER_SETTLED_WHOLE",
			`the order of "${half.name}" is settled for the whole of it at once: answer every ` +
				"step of it that is in dispute, or say the order you mean as an ordinary edit",
		);
	}
	const content = decided(draft, taken, input);
	if (!content.ok) {
		return content;
	}
	// Answering the disagreements is half of it. The other half is everything the
	// predecessor decided while this proposal was unsettled: measured from the
	// state it last agreed with, which is what the standing has been keeping for
	// exactly this moment, so nothing that happened in between is skipped.
	// A decision is durable. The base moves for exactly the fields that were
	// answered — to what the predecessor says about them — so the next merge sees
	// a field the two have settled rather than recomputing the same argument and
	// reopening it. Everything else stays where it was, still holding whatever
	// the predecessor has done since.
	const base = settledInto(standing.base, parent.content, taken);
	const caught = reconcileVariant({ base, mine: content.content, theirs: parent.content });
	const open = stillOpen(kept, caught.issues, taken);
	const settled = withoutStanding(draft, caught.content);
	if (open.length > 0) {
		return {
			ok: true,
			variants: board.variants.map((one) =>
				one.id === draft.id
					? {
							...settled,
							reconciliation: { against: standing.against, atVersion, base, issues: open },
						}
					: one,
			),
			// This proposal still holds something, so nothing under it moves — and
			// what it still holds is the first thing the answer has to say.
			descendants: [
				{
					variant: draft.id,
					name: draft.name,
					outcome: "conflicted" as const,
					issues: open,
				},
			],
		};
	}
	// Nothing is open here any more. The board handed over still holds this
	// proposal as it was, because that is the state its own drafts were derived
	// from and so the state their merge has to be measured against.
	const carried = propagateEdit(board, settled, atVersion);
	return { ok: true, variants: carried.variants, descendants: carried.descendants };
}

/**
 * What is left to settle after this command.
 *
 * The disagreements nobody answered, and whatever the catch-up found — as one
 * list rather than two. A disagreement that was standing before and is still
 * standing now is one disagreement: reporting it twice would have somebody
 * answer it twice, and the second answer would have nothing to settle.
 * @param kept The issues nobody answered.
 * @param found What the catch-up against the predecessor found.
 * @param taken The issues this command answered.
 * @returns What is still open, each of them once.
 */
function stillOpen(
	kept: readonly ReconciliationIssue[],
	found: readonly ReconciliationIssue[],
	taken: readonly ReconciliationIssue[],
): ReconciliationIssue[] {
	const held = new Map<string, ReconciliationIssue>();
	for (const issue of [...kept, ...found.filter((one) => !answeredBy(one, taken))]) {
		// The later account of one disagreement wins: the catch-up has just read
		// both states, and the kept one was written before this command ran.
		held.set(`${issue.subject}|${issue.field ?? ""}|${issue.kind}`, issue);
	}
	return [...held.values()];
}

/**
 * The base with the answered fields moved to what the predecessor says.
 *
 * Answering a field is agreeing about it: whichever side was taken, the two
 * states have now been compared and a person has decided. Leaving the base where
 * it was would make the next merge find the same disagreement and report it
 * again, which is the same as not having settled it.
 * @param base The state this proposal last agreed with.
 * @param theirs The predecessor's content, whose order the base takes.
 * @param taken The issues this command answered.
 * @returns The base to keep.
 */
function settledInto(
	base: SemanticVariant["content"],
	theirs: SemanticVariant["content"],
	taken: readonly ReconciliationIssue[],
): SemanticVariant["content"] {
	// `position` is not a field a step holds: the merge invents it to say where
	// the two sides put something. Setting it here would write a step no board
	// may hold, so an answered order moves the base by reordering it instead.
	//
	// Into the predecessor's order, for the same reason an answered field moves
	// to the predecessor's value: what makes the decision durable is that the
	// base stops disagreeing with the predecessor, so the next merge sees this
	// proposal's own order as this proposal's own change and leaves it alone.
	const fields = taken.filter((issue) => issue.field !== undefined && !isOrder(issue));
	const moved = taken.filter(isOrder);
	const settled = fields.length === 0 ? base : taking(base, fields);
	return moved.length === 0 ? settled : reorderedInto(settled, theirs, moved);
}

/**
 * Whether a disagreement the catch-up found is one this command just answered.
 *
 * Answering a field settles it: the same field turning up again is the merge
 * re-reading the same two states, not a new decision for somebody to make.
 * @param issue What the catch-up found.
 * @param taken What this command answered.
 * @returns True when it has already been decided here.
 */
function answeredBy(issue: ReconciliationIssue, taken: readonly ReconciliationIssue[]): boolean {
	return taken.some((one) => one.subject === issue.subject && one.field === issue.field);
}

/** The content a settlement produces, or why it cannot. */
type DecidedContent =
	| { readonly ok: true; readonly content: SemanticVariant["content"] }
	| SemanticRefusal;

/**
 * The proposal's content once the answered disagreements are answered.
 *
 * Taking this proposal's side changes nothing: what it already says is what it
 * keeps, and the disagreement goes. Taking the predecessor's side sets exactly
 * the field that was in dispute and touches nothing else — a choice about a
 * name is not permission to take everything else the predecessor has since
 * decided, and merging wholesale here would quietly overwrite work nobody
 * asked about.
 *
 * Catching up with the rest of the predecessor is a separate thing, and it
 * happens afterwards, through the same merge every propagation uses.
 * @param draft The proposal.
 * @param taken The issues being answered.
 * @param input What the caller decided.
 * @returns The content, or the refusal.
 */
function decided(
	draft: SemanticVariant,
	taken: readonly ReconciliationIssue[],
	input: ResolutionInput,
): DecidedContent {
	const theirs = taken.filter((issue) =>
		input.choices.some((choice) => answers(choice, issue) && choice.side === "theirs"),
	);
	if (theirs.length === 0) {
		return { ok: true, content: draft.content };
	}
	const structural = theirs.filter((issue) => issue.field === undefined);
	if (structural.length > 0) {
		return refuse(
			"CHOICE_NOT_A_FIELD",
			`taking the other side of ${describe(input.choices)} means adding or removing something, ` +
				"which is an ordinary edit to this proposal rather than a choice between two values",
		);
	}
	const ordering = theirs.filter((issue) => issue.kind === "competing-order");
	if (ordering.length > 0) {
		return refuse(
			"CHOICE_NOT_A_FIELD",
			`taking the other side of ${describe(input.choices)} means telling the exchange in a ` +
				"different order, which is an ordinary edit to this proposal — say the order you mean",
		);
	}
	return { ok: true, content: taking(draft.content, theirs) };
}

/**
 * This proposal's content with exactly the fields in dispute set to what the
 * predecessor says.
 * @param content The proposal's content.
 * @param theirs The issues whose other side is being taken.
 * @returns The content.
 */
function taking(
	content: SemanticVariant["content"],
	theirs: readonly ReconciliationIssue[],
): SemanticVariant["content"] {
	const wanted = new Map(theirs.map((issue) => [`${issue.subject}|${issue.field ?? ""}`, issue]));
	/**
	 * One subject with any answered field set to the predecessor's value.
	 * @param subject The subject.
	 * @returns The subject as it should now be.
	 */
	const settle = <Entity extends { readonly id: string }>(subject: Entity): Entity => {
		let next = subject;
		for (const [key, issue] of wanted) {
			if (key.startsWith(`${subject.id}|`) && issue.field !== undefined) {
				next = withField(next, issue.field, issue.theirs);
			}
		}
		return next;
	};
	return {
		...content,
		nodes: content.nodes.map(settle),
		edges: content.edges.map(settle),
		flows: content.flows.map((flow) => ({ ...settle(flow), steps: flow.steps.map(settle) })),
		views: content.views.map(settle),
		walkthroughs: content.walkthroughs.map((walkthrough) => ({
			...settle(walkthrough),
			beats: walkthrough.beats.map(settle),
		})),
	};
}

/**
 * One subject with one field set to what the other side says.
 *
 * A side that says nothing is an unwritten field, not a written null: the
 * contract has no field that may be null, so copying the "nothing" across
 * literally would produce a document it refuses. Taking a value nobody wrote
 * means not writing one either.
 * @param subject The subject.
 * @param field The field being taken.
 * @param value What the other side says, with null for nothing written.
 * @returns The subject as it should now be.
 */
function withField<Entity extends { readonly id: string }>(
	subject: Entity,
	field: string,
	value: unknown,
): Entity {
	if (value !== null && value !== undefined) {
		return { ...subject, [field]: value };
	}
	const next = { ...subject };
	delete (next as Record<string, unknown>)[field];
	return next;
}

/** A board with the designation moved, or why it cannot move. */
type AdoptionResult = { readonly ok: true; readonly board: SemanticBoard } | SemanticRefusal;

/**
 * Move the designation to a variant that is coherent and settled.
 * @param board The board as it stands.
 * @param adopting The variant to adopt.
 * @param at The timestamp the write is being made at.
 * @param reason Why, when whoever adopted it said so.
 * @returns The board afterwards, or the refusal.
 */
function adoptVariant(
	board: SemanticBoard,
	adopting: SemanticVariant,
	at: string,
	reason?: string,
): AdoptionResult {
	const refused = adoptable(board, adopting);
	if (refused !== null) {
		return refused;
	}
	const entry: Adoption = {
		variant: adopting.id,
		from: board.current,
		at,
		...(reason === undefined ? {} : { reason }),
	};
	return {
		ok: true,
		board: {
			...board,
			current: adopting.id,
			variants: board.variants.map((one) => designated(one, adopting.id, board.current)),
			adoptions: [...(board.adoptions ?? []), entry],
		},
	};
}

/**
 * Whether this variant may become the architecture of record, and why not.
 * @param board The board as it stands.
 * @param adopting The variant to adopt.
 * @returns The refusal, or null when it may be adopted.
 */
function adoptable(board: SemanticBoard, adopting: SemanticVariant): SemanticRefusal | null {
	if (adopting.id === board.current) {
		return refuse(
			"ALREADY_CURRENT",
			`"${adopting.name}" is already the architecture this board says is implemented`,
		);
	}
	if (adopting.lifecycle === "historical") {
		return refuse(
			"VARIANT_HISTORICAL",
			`"${adopting.name}" is an architecture that was implemented and has since been superseded. ` +
				"What was true then does not change, and making it current again would rewrite that " +
				"record rather than add to it. Branch a proposal from it and adopt that.",
		);
	}
	if (adopting.reconciliation !== undefined) {
		return refuse(
			"VARIANT_UNSETTLED",
			`"${adopting.name}" is still waiting on the variant it came from, so adopting it would ` +
				"make an unsettled proposal the implemented architecture; settle it first",
		);
	}
	return unsettledAbove(board, adopting);
}

/**
 * Whether something this variant was built on is itself still in dispute.
 *
 * An ancestor nobody has agreed to is a state this proposal is standing on, and
 * adopting on top of it would make an argument nobody finished into the
 * architecture of record.
 * @param board The board as it stands.
 * @param adopting The variant to adopt.
 * @returns The refusal, or null when the line above it is settled.
 */
function unsettledAbove(board: SemanticBoard, adopting: SemanticVariant): SemanticRefusal | null {
	const above = unsettledAncestor(board.variants, adopting);
	if (above === undefined) {
		return null;
	}
	const named = board.variants.find((one) => one.id === above);
	return refuse(
		"VARIANT_UNSETTLED",
		`"${adopting.name}" is derived from "${named?.name ?? above}", which is still waiting on the ` +
			"variant it came from. Settle that first: adopting this would make an unfinished argument " +
			"the implemented architecture.",
	);
}

/**
 * One variant's lifecycle after the designation moved.
 *
 * The variant that was current becomes historical: it is the architecture that
 * was implemented until now, and saying so is the whole point of keeping it.
 * The adopted one becomes current. Every other variant is untouched — a draft
 * derived from either of them is still a draft derived from where it came from,
 * because adoption moves a designation and not a lineage.
 * @param variant The variant.
 * @param becoming Which variant is taking the designation.
 * @param was Which variant was current.
 * @returns The variant as it should now be.
 */
function designated(variant: SemanticVariant, becoming: string, was: string): SemanticVariant {
	if (variant.id === becoming) {
		return { ...variant, lifecycle: "current" };
	}
	return variant.id === was ? { ...variant, lifecycle: "historical" } : variant;
}

export { adoptVariant, settleVariant, type AdoptionResult, type Settlement };
