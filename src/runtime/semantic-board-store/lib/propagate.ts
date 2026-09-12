// Carrying an edit down the family it belongs to.
//
// A board holds every variant of an architecture, and a draft is derived from
// another variant rather than from a patch. So when somebody edits the state a
// draft came from, the draft has a question to answer: what does it say now?
// Answering it is part of the same write, which is why ADR 0023 puts the whole
// family in one document — one command, one version, one file.
//
// Three rules decide what the answer is.
//
//   Parent before child. A draft is merged against its own predecessor, and a
//   grandchild against its parent as that parent has just become. Reconciling a
//   grandchild against the top of the family would skip the very decisions the
//   middle draft exists to make.
//
//   A merge is measured from the state the draft last agreed with, and that
//   state is remembered rather than guessed. While a draft is unsettled its
//   predecessor goes on changing, and the obvious shortcut — "measure against
//   the predecessor as it was before this write" — quietly makes every one of
//   those changes invisible to the draft: it is neither inherited nor reported,
//   it is simply skipped. So an unsettled draft keeps the state it last agreed
//   with, and that base does not move until it agrees again.
//
//   A draft whose predecessor is unsettled is not merged at all. Merging it
//   would mean choosing, on its behalf, which side of an argument it is derived
//   from to build on — and a proposal built on a guess is worse than one that
//   waits. Its content is left exactly as it is, which is coherent, and it
//   records the ancestor whose decision it is waiting for.

import {
	reconcileVariant,
	type ReconciliationIssue,
	type SemanticBoard,
	type SemanticVariant,
	type VariantStanding,
} from "@/shared/semantic-board/index";

/** What one descendant did about an edit above it. */
interface DescendantOutcome {
	/** The variant. */
	readonly variant: string;
	/** What it is called, for a sentence somebody reads. */
	readonly name: string;
	/**
	 * What it did: took the change, held something it cannot decide, or was not
	 * merged at all because the state it is derived from is itself in dispute.
	 */
	readonly outcome: "merged" | "conflicted" | "blocked";
	/** The ancestor whose decision it is waiting for, when it is waiting. */
	readonly blockedBy?: string;
	/** What somebody has to settle here. */
	readonly issues: readonly ReconciliationIssue[];
}

/** A family after an edit, and what every descendant did about it. */
interface Propagation {
	readonly variants: readonly SemanticVariant[];
	readonly descendants: readonly DescendantOutcome[];
}

/**
 * The nearest ancestor a variant is still building on that is itself in dispute.
 *
 * The walk stops where inheritance stops. A variant that has been adopted, or
 * one that has been superseded, no longer follows what it came from — so an
 * argument above *it* is an argument about a state this one stopped tracking,
 * and treating that as a reason to refuse an adoption here would block a
 * decision on the strength of a disagreement nothing downstream can even see.
 * The same boundary decides both: what a change is carried into, and what a
 * draft is standing on.
 * @param variants Every variant of the board.
 * @param variant The variant to look above.
 * @returns The ancestor's id, or undefined when what it stands on is settled.
 */
function unsettledAncestor(
	variants: readonly SemanticVariant[],
	variant: SemanticVariant,
): string | undefined {
	const byId = new Map(variants.map((one) => [one.id, one]));
	const seen = new Set<string>([variant.id]);
	let at = above(variant, byId);
	while (at !== undefined && !seen.has(at.id)) {
		if (at.reconciliation !== undefined) {
			return at.id;
		}
		seen.add(at.id);
		at = above(at, byId);
	}
	return undefined;
}

/**
 * The variant one is still standing on, if it is still standing on anything.
 *
 * Only a draft is. An adopted or superseded state stopped following what it
 * came from, so there is nothing above it that it is building on.
 * @param variant The variant.
 * @param byId The board's variants, by id.
 * @returns The predecessor it still follows, or undefined.
 */
function above(
	variant: SemanticVariant,
	byId: ReadonlyMap<string, SemanticVariant>,
): SemanticVariant | undefined {
	if (variant.lifecycle !== "draft" || variant.parent === undefined) {
		return undefined;
	}
	return byId.get(variant.parent);
}

/** One variant being carried down, with the state its children were derived from. */
interface Carried {
	readonly variant: SemanticVariant;
	/** What this variant said before this command touched it. */
	readonly was: SemanticVariant;
	/** The ancestor everything under this one is waiting for, if any. */
	readonly blockedBy?: string;
}

/**
 * Carry one edit down every draft derived from the variant it changed.
 * @param board The board as it stood.
 * @param edited The variant as the command has just made it.
 * @param atVersion The version the board will carry once this write lands.
 * @returns Every variant afterwards, and what each descendant did.
 */
function propagateEdit(
	board: SemanticBoard,
	edited: SemanticVariant,
	atVersion: number,
): Propagation {
	const was = board.variants.find((variant) => variant.id === edited.id);
	if (was === undefined) {
		return { variants: board.variants, descendants: [] };
	}
	const answers = new Map<string, SemanticVariant>([[edited.id, edited]]);
	const outcomes: DescendantOutcome[] = [];
	const queue: Carried[] = [{ variant: edited, was }];
	while (queue.length > 0) {
		const carrying = queue.shift();
		if (carrying === undefined) {
			break;
		}
		for (const child of board.variants.filter((one) => inherits(one, carrying.variant.id))) {
			const answered = answerFor(child, carrying, atVersion);
			answers.set(child.id, answered.variant);
			outcomes.push(answered.outcome);
			queue.push({
				variant: answered.variant,
				was: child,
				// What blocks this draft blocks everything under it, and it is the
				// same ancestor: a grandchild is told where the decision actually has
				// to be made, not which link in the chain is nearest.
				...blockerUnder(answered.outcome, child.id),
			});
		}
	}
	return {
		variants: board.variants.map((variant) => answers.get(variant.id) ?? variant),
		descendants: outcomes,
	};
}

/**
 * What blocks the drafts under one draft.
 * @param outcome What that draft did.
 * @param id That draft.
 * @returns The blocker to carry down, or nothing when it merged cleanly.
 */
function blockerUnder(outcome: DescendantOutcome, id: string): { blockedBy?: string } {
	if (outcome.outcome === "merged") {
		return {};
	}
	return { blockedBy: outcome.blockedBy ?? id };
}

/**
 * Whether one variant still follows another.
 *
 * Only a draft does. A variant that has been adopted is the architecture that
 * is implemented and a variant that has been superseded is the record of one
 * that was — neither is a proposal about where its predecessor is going, and
 * rewriting either because something upstream moved would falsify the one thing
 * a board is for (ADR 0023). Ancestry stays exactly as it was: this is about
 * following, not about where a state came from.
 * @param variant The variant.
 * @param parent The variant that has just changed.
 * @returns True when the change should be carried into it.
 */
function inherits(variant: SemanticVariant, parent: string): boolean {
	return variant.parent === parent && variant.lifecycle === "draft";
}

/**
 * What one child says now, given what its predecessor has just become.
 * @param child The child as it stands.
 * @param carrying Its predecessor, before and after.
 * @param atVersion The version the board will carry once this write lands.
 * @returns The child afterwards and what it did.
 */
function answerFor(
	child: SemanticVariant,
	carrying: Carried,
	atVersion: number,
): { variant: SemanticVariant; outcome: DescendantOutcome } {
	// The state this draft last agreed with: what it kept while it was unsettled,
	// or its predecessor as it was before this write when the two were in step.
	const base = child.reconciliation?.base ?? carrying.was.content;
	const blockedBy = waitingFor(carrying);
	if (blockedBy !== undefined) {
		return blocked(child, carrying.variant.id, blockedBy, { base, atVersion });
	}
	const merged = reconcileVariant({
		base,
		mine: child.content,
		theirs: carrying.variant.content,
	});
	const settled = withoutStanding(child, merged.content);
	if (merged.issues.length === 0) {
		return {
			variant: settled,
			outcome: { variant: child.id, name: child.name, outcome: "merged", issues: [] },
		};
	}
	const standing: VariantStanding = {
		against: carrying.variant.id,
		atVersion,
		base,
		issues: [...merged.issues],
	};
	return {
		variant: { ...settled, reconciliation: standing },
		outcome: {
			variant: child.id,
			name: child.name,
			outcome: "conflicted",
			issues: standing.issues,
		},
	};
}

/**
 * The ancestor a draft under this one would be waiting for, if any.
 *
 * Whatever blocks the predecessor blocks what is under it, and it is the same
 * ancestor rather than the nearest link: a grandchild is told where the decision
 * actually has to be made.
 * @param carrying The predecessor being carried down.
 * @returns The ancestor's id, or undefined when nothing above is in dispute.
 */
function waitingFor(carrying: Carried): string | undefined {
	if (carrying.blockedBy !== undefined) {
		return carrying.blockedBy;
	}
	return carrying.variant.reconciliation === undefined ? undefined : carrying.variant.id;
}

/**
 * A draft that may not be merged, because the state it is derived from is
 * itself in dispute.
 *
 * Its content is left exactly as it is. That content is coherent — it was
 * written and validated as a whole — and leaving it alone is what makes a
 * waiting draft still readable, still renderable, and still honest about being
 * out of date. What it already had to settle it still has to settle.
 * @param child The draft as it stands.
 * @param against The predecessor it will be merged against once it can be.
 * @param blockedBy The ancestor whose disagreement is in the way.
 * @param held The state it last agreed with, and the version in flight.
 * @param held.base The state it last agreed with.
 * @param held.atVersion The version the board will carry once this write lands.
 * @returns The draft afterwards and what it did.
 */
function blocked(
	child: SemanticVariant,
	against: string,
	blockedBy: string,
	held: { base: SemanticVariant["content"]; atVersion: number },
): { variant: SemanticVariant; outcome: DescendantOutcome } {
	const issues = child.reconciliation?.issues ?? [];
	const standing: VariantStanding = {
		against,
		atVersion: held.atVersion,
		base: held.base,
		issues: [...issues],
		blockedBy,
	};
	return {
		variant: { ...withoutStanding(child, child.content), reconciliation: standing },
		outcome: {
			variant: child.id,
			name: child.name,
			outcome: "blocked",
			blockedBy,
			issues: standing.issues,
		},
	};
}

/**
 * One variant with new content and nothing outstanding.
 *
 * The standing is rebuilt from scratch on every propagation rather than
 * inherited by spreading the variant: a draft that has just been brought into
 * agreement must not keep a note saying it is waiting on something, and a
 * record that is sometimes replaced and sometimes carried over is one nobody
 * can read with confidence.
 * @param variant The variant as it stands.
 * @param content What it says now.
 * @returns The variant with that content and no standing.
 */
function withoutStanding(
	variant: SemanticVariant,
	content: SemanticVariant["content"],
): SemanticVariant {
	const next = { ...variant, content };
	delete next.reconciliation;
	return next;
}

export {
	propagateEdit,
	unsettledAncestor,
	withoutStanding,
	type DescendantOutcome,
	type Propagation,
};
