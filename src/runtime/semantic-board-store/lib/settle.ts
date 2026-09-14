// Settling a disagreement.
//
// A command that changes what a board says about itself rather than what it
// draws, and one that goes through the one write boundary every other change
// does: the same board-global lease, the same expected version, one atomic
// write, one version advance (ADR 0016, ADR 0023).
//
// Settling answers disagreements a proposal is holding, one at a time or all at
// once, and then carries the answer down: a draft that was waiting on this one
// stops waiting, is merged, and reports whatever it finds — which may be a new
// disagreement of its own, discovered only now that its parent has decided.
// The two ways an answer is given — a `resolve` choosing a side, and an
// ordinary edit restoring what the proposal removed (`restore.ts`) — share
// one catch-up, `caughtUp`. Adoption lives in `adopt.ts`.

import {
	halfOrdered,
	isOrder,
	reorderedInto,
} from "@/runtime/semantic-board-store/lib/settle-order";
import {
	reconcileVariant,
	type Choice,
	type ReconciliationIssue,
	type ResolutionInput,
	type SemanticBoard,
	type SemanticVariant,
	type VariantStanding,
} from "@/shared/semantic-board/index";
import {
	propagateEdit,
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
	return caughtUp(board, { draft, parent, standing, atVersion }, content.content, { taken, kept });
}

/** What one answer to a proposal's standing works from. */
interface Answering {
	readonly draft: SemanticVariant;
	readonly parent: SemanticVariant;
	readonly standing: VariantStanding;
	readonly atVersion: number;
}

/**
 * The proposal after an answer: caught up with its predecessor, holding what
 * is still open, and carried down when nothing is.
 *
 * Answering the disagreements is half of it. The other half is everything the
 * predecessor decided while this proposal was unsettled: measured from the
 * state it last agreed with, which is what the standing has been keeping for
 * exactly this moment, so nothing that happened in between is skipped.
 * A decision is durable. The base moves for exactly what was answered — to
 * what the predecessor says about it — so the next merge sees something the
 * two have settled rather than recomputing the same argument and reopening it.
 * Everything else stays where it was, still holding whatever the predecessor
 * has done since.
 *
 * Shared by the two ways an answer is given: a `resolve` choosing a side, and
 * an ordinary edit giving the third answer the documented contract promises,
 * a removed subject restored under its original id (TASK-213).
 * @param board The board as it stands.
 * @param answering The proposal, its predecessor, what it holds and the version in flight.
 * @param content The proposal's content once the answer is applied.
 * @param issues What this answer decided and what it left alone.
 * @param issues.taken The issues answered.
 * @param issues.kept The issues nobody answered.
 * @returns The family afterwards.
 */
function caughtUp(
	board: SemanticBoard,
	answering: Answering,
	content: SemanticVariant["content"],
	issues: {
		readonly taken: readonly ReconciliationIssue[];
		readonly kept: readonly ReconciliationIssue[];
	},
): Settlement {
	const { draft, parent, standing, atVersion } = answering;
	const base = settledInto(standing.base, parent.content, issues.taken);
	const caught = reconcileVariant({ base, mine: content, theirs: parent.content });
	const open = stillOpen(issues.kept, caught.issues, issues.taken);
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
	const whole = taken.filter((issue) => issue.kind === "deleted-and-changed");
	const settled = fields.length === 0 ? base : taking(base, fields);
	const agreed = whole.length === 0 ? settled : subjectsFrom(settled, theirs, whole);
	return moved.length === 0 ? agreed : reorderedInto(agreed, theirs, moved);
}

/**
 * The base with whole subjects moved to what the predecessor holds.
 *
 * A disagreement about a subject's existence has no field to move: the whole
 * subject is the answer. Whichever way it was answered — the removal kept, the
 * change taken, or the subject restored with a third wording — the base takes
 * the predecessor's subject, present or absent, so the next merge reads this
 * proposal's state as this proposal's own decision instead of finding the
 * same removal-against-change again.
 * @param base The state this proposal last agreed with.
 * @param theirs The predecessor's content.
 * @param answered The existence disagreements this command answered.
 * @returns The base to keep.
 */
function subjectsFrom(
	base: SemanticVariant["content"],
	theirs: SemanticVariant["content"],
	answered: readonly ReconciliationIssue[],
): SemanticVariant["content"] {
	const subjects = new Set(answered.map((issue) => issue.subject));
	/**
	 * One collection with the answered subjects as the predecessor holds them.
	 * @param mine The base's collection.
	 * @param yours The predecessor's collection.
	 * @returns The collection to keep.
	 */
	const moved = <Entity extends { readonly id: string }>(
		mine: readonly Entity[],
		yours: readonly Entity[],
	): Entity[] => {
		const held = new Map(yours.map((entity) => [entity.id, entity]));
		const kept = mine.flatMap((entity) => {
			if (!subjects.has(entity.id)) {
				return [entity];
			}
			const now = held.get(entity.id);
			return now === undefined ? [] : [now];
		});
		const present = new Set(kept.map((entity) => entity.id));
		return [
			...kept,
			...yours.filter((entity) => subjects.has(entity.id) && !present.has(entity.id)),
		];
	};
	return {
		nodes: moved(base.nodes, theirs.nodes),
		edges: moved(base.edges, theirs.edges),
		flows: moved(base.flows, theirs.flows),
		walkthroughs: moved(base.walkthroughs, theirs.walkthroughs),
	};
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

export { caughtUp, settleVariant, type Settlement };
