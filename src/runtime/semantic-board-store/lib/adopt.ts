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

import type { Adoption, SemanticBoard, SemanticVariant } from "@/shared/semantic-board/index";
import { unsettledAncestor } from "@/runtime/semantic-board-store/lib/propagate";
import { BRANCH_INSTEAD } from "@/runtime/semantic-board-store/lib/shelve";
import { refuse, type SemanticRefusal } from "@/runtime/semantic-board-store/lib/outcome";

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
		...(board.current === undefined ? {} : { from: board.current }),
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
