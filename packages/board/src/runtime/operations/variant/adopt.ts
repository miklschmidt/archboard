// Adopting an architecture: moving the `current` designation, or on a board
// for something nobody had built, giving it one.
//
// Adoption renames nothing, reparents nothing, and rewrites no history: the
// variant that was current becomes a historical state under its own name, the
// adopted one becomes current under its own name, and the move itself is
// written down. On a board that had no current variant nothing becomes
// history: adoption is the moment its architecture starts existing (ADR 0031). A proposal that was derived from either of them still says
// so, because ancestry is a record of where a state came from and adoption
// does not change where anything came from. It goes through the one write
// boundary every other change does (ADR 0016, ADR 0023).
//
// A proposal built on an architecture that a later adoption superseded is
// refused unless the request forces it: adopting it would leave out what that
// later adoption brought, and nothing else would say so (ADR 0037).

import type { Adoption, SemanticBoard, SemanticVariant } from "#shared/schemas/board-document.ts";
import { unsettledAncestor } from "#runtime/operations/variant/propagate.ts";
import { BRANCH_INSTEAD } from "#runtime/operations/variant/shelve.ts";
import { refuse, type SemanticRefusal } from "#runtime/operations/write/outcome.ts";

/** A board with the designation moved, or why it cannot move. */
type AdoptionResult = { readonly ok: true; readonly board: SemanticBoard } | SemanticRefusal;

/**
 * Move the designation to a variant that is coherent and settled.
 * @param board The board as it stands.
 * @param adopting The variant to adopt.
 * @param at The timestamp the write is being made at.
 * @param asked Why, when whoever adopted it said so, and whether they forced it.
 * @param asked.reason Why, when whoever adopted it said so.
 * @param asked.force Whether to adopt it even though what it was built on was superseded.
 * @returns The board afterwards, or the refusal.
 */
function adoptVariant(
	board: SemanticBoard,
	adopting: SemanticVariant,
	at: string,
	asked: { readonly reason?: string | undefined; readonly force?: boolean | undefined },
): AdoptionResult {
	const refused = adoptable(board, adopting);
	if (refused !== null) {
		return refused;
	}
	const superseded = supersededBase(board, adopting);
	if (superseded !== undefined && asked.force !== true) {
		return supersededRefusal(board, adopting, superseded);
	}
	const entry = adoptionEntry(board, adopting, at, asked.reason, superseded !== undefined);
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
 * The record of one move of the designation.
 * @param board The board as it stands.
 * @param adopting The variant becoming current.
 * @param at The timestamp the write is being made at.
 * @param reason Why, when whoever adopted it said so.
 * @param forced Whether it was adopted over the refusal of a superseded base.
 * @returns The entry.
 */
function adoptionEntry(
	board: SemanticBoard,
	adopting: SemanticVariant,
	at: string,
	reason: string | undefined,
	forced: boolean,
): Adoption {
	return {
		variant: adopting.id,
		...(board.current === undefined ? {} : { from: board.current }),
		at,
		...(reason === undefined ? {} : { reason }),
		...(forced ? { forced: true } : {}),
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
				"record rather than add to it. Branch a proposal from it and adopt that, with --force, " +
				"because it leaves out what was adopted since.",
		);
	}
	if (adopting.lifecycle === "shelved") {
		return refuse(
			"VARIANT_SHELVED",
			`"${adopting.name}" is a proposal this board has let go, and the record says when and ` +
				"why. Adopting it would make the implemented architecture a proposal nobody was " +
				`carrying out. ${BRANCH_INSTEAD}`,
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
 * The superseded architecture a proposal is built on, if it is built on one.
 *
 * Walks what the proposal stands on: its parent, and through drafts their
 * parents, because a draft follows what it came from and so carries it. The
 * walk ends well at the current variant, and at a shelved or root one, which
 * no adoption superseded. A historical variant on the way is one a later
 * adoption moved the designation off after this line was branched from it,
 * so adopting the proposal would leave out what that adoption brought.
 * @param board The board as it stands.
 * @param adopting The variant to adopt.
 * @returns The historical variant it is built on, or undefined.
 */
function supersededBase(
	board: SemanticBoard,
	adopting: SemanticVariant,
): SemanticVariant | undefined {
	const seen = new Set<string>([adopting.id]);
	let at = variantNamed(board, adopting.parent);
	while (at !== undefined && !seen.has(at.id)) {
		if (at.lifecycle === "historical") {
			return at;
		}
		if (at.lifecycle !== "draft") {
			return undefined;
		}
		seen.add(at.id);
		at = variantNamed(board, at.parent);
	}
	return undefined;
}

/**
 * One variant of the board, by id.
 * @param board The board.
 * @param id The variant's id, or undefined.
 * @returns The variant, or undefined when there is none by that id.
 */
function variantNamed(board: SemanticBoard, id: string | undefined): SemanticVariant | undefined {
	return id === undefined ? undefined : board.variants.find((one) => one.id === id);
}

/**
 * Why a proposal built on a superseded architecture is not adopted unasked.
 * @param board The board as it stands.
 * @param adopting The variant to adopt.
 * @param superseded The historical variant it is built on.
 * @returns The refusal, naming what replaced it and the two ways on.
 */
function supersededRefusal(
	board: SemanticBoard,
	adopting: SemanticVariant,
	superseded: SemanticVariant,
): SemanticRefusal {
	const replacedBy = variantNamed(
		board,
		board.adoptions?.find((one) => one.from === superseded.id)?.variant,
	)?.name;
	const current = variantNamed(board, board.current)?.name;
	const since = replacedBy === current ? "" : `, and "${current}" is current now`;
	return refuse(
		"PARENT_SUPERSEDED",
		`"${adopting.name}" is built on "${superseded.name}", which stopped being the implemented ` +
			`architecture when "${replacedBy}" was adopted over it${since}. Adopting it would leave ` +
			`out what was adopted since. Branch a proposal from "${current}" and state this change ` +
			"on it again, or adopt with --force if leaving that out is intended.",
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
 * @param was Which variant was current, or undefined when none was.
 * @returns The variant as it should now be.
 */
function designated(
	variant: SemanticVariant,
	becoming: string,
	was: string | undefined,
): SemanticVariant {
	if (variant.id === becoming) {
		return { ...variant, lifecycle: "current" };
	}
	return variant.id === was ? { ...variant, lifecycle: "historical" } : variant;
}

export { adoptVariant, type AdoptionResult };
