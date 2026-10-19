// Which variants one footprint reads (ADR 0045): the proposal a caller names,
// and the variant it is read against to decide which parts it names. The lens
// reads only a live variant, a current one or a draft, never a historical or a
// shelved one.

import {
	addressedVariant,
	currentVariant,
	type SemanticBoard,
	type SemanticVariant,
} from "@archboard/board/document";

/** A request the route turns away, with the code the CLI maps to its exit status. */
interface Refusal {
	readonly status: number;
	readonly code: string;
	readonly error: string;
}

/** The variants one footprint reads. */
interface FootprintVariants {
	/** What the proposal is read against; none for a proposal read against nothing. */
	readonly against: SemanticVariant | undefined;
	readonly proposal: SemanticVariant | undefined;
}

/** What the caller named. */
interface NamedVariants {
	readonly variant: string | undefined;
	readonly against: string | undefined;
}

/**
 * Turn a request away.
 * @param code The code the CLI maps to its exit status.
 * @param error What happened and what to do next.
 * @returns The refusal.
 */
function refusal(code: string, error: string): Refusal {
	return { status: 422, code, error };
}

/**
 * Whether a value is a refusal and not a variant.
 * @param value What a step of the request answered.
 * @returns True for a refusal.
 */
function isRefusal(value: object | undefined): value is Refusal {
	return value !== undefined && "code" in value;
}

/**
 * The variant a caller named.
 * @param board The board.
 * @param asked The id or name as the caller wrote it.
 * @returns The variant, or why there is none.
 */
function named(board: SemanticBoard, asked: string): SemanticVariant | Refusal {
	const found = addressedVariant(board, asked);
	return found.ok ? found.variant : refusal("UNKNOWN_VARIANT", `"${board.name}": ${found.problem}`);
}

/**
 * The proposal a request names: a draft that is not the current variant.
 * @param board The board.
 * @param asked The proposal as the caller named it, if it did.
 * @returns The proposal, none when none was named, or why it cannot be read.
 */
function proposalOf(
	board: SemanticBoard,
	asked: string | undefined,
): SemanticVariant | Refusal | undefined {
	if (asked === undefined) return undefined;
	const proposal = named(board, asked);
	if (isRefusal(proposal)) return proposal;
	if (proposal.id === currentVariant(board)?.id) {
		return refusal(
			"NOTHING_TO_COMPARE",
			`"${proposal.name}" is the current variant of "${board.name}". Name a draft to set the footprint against, or leave --variant out.`,
		);
	}
	return proposal.lifecycle === "draft"
		? proposal
		: refusal(
				"NOT_A_DRAFT",
				`"${proposal.name}" is ${proposal.lifecycle}, and the footprint reads only a draft.`,
			);
}

/**
 * Check that a variant can be read against.
 * @param board The board.
 * @param against The variant.
 * @param proposal The proposal it is read against, if any.
 * @returns The variant, or why it cannot be used.
 */
function liveAgainst(
	board: SemanticBoard,
	against: SemanticVariant,
	proposal: SemanticVariant | undefined,
): SemanticVariant | Refusal {
	if (against.id === proposal?.id) {
		return refusal(
			"NOTHING_TO_COMPARE",
			`"${against.name}" is the proposal itself. Read it against another variant of "${board.name}".`,
		);
	}
	return against.lifecycle === "current" || against.lifecycle === "draft"
		? against
		: refusal(
				"AGAINST_NOT_LIVE",
				`"${against.name}" is ${against.lifecycle}, and a footprint is read against a current variant or a draft. Name one with --against.`,
			);
}

/**
 * What a proposal is read against: the variant the caller named, else the
 * current variant, else the proposal's parent.
 * @param board The board.
 * @param asked The variant as the caller named it, if it did.
 * @param proposal The proposal, if one was named.
 * @returns The variant, none when nothing is to be read against, or why it cannot be used.
 */
function againstOf(
	board: SemanticBoard,
	asked: string | undefined,
	proposal: SemanticVariant | undefined,
): SemanticVariant | Refusal | undefined {
	const chosen =
		asked === undefined
			? (currentVariant(board) ?? board.variants.find((one) => one.id === proposal?.parent))
			: named(board, asked);
	return chosen === undefined || isRefusal(chosen) ? chosen : liveAgainst(board, chosen, proposal);
}

/**
 * Which variants a request reads. A board with no current variant reads a
 * proposal against its parent, and a proposal with no parent against nothing.
 * Without a proposal the footprint needs a variant to read, and a board with no
 * current variant has none to offer.
 * @param board The board.
 * @param asked The proposal and the variant to read it against, as the caller named them.
 * @returns The variants, or why the request reads none.
 */
function variantsOf(board: SemanticBoard, asked: NamedVariants): FootprintVariants | Refusal {
	const proposal = proposalOf(board, asked.variant);
	if (isRefusal(proposal)) return proposal;
	const against = againstOf(board, asked.against, proposal);
	if (isRefusal(against)) return against;
	if (proposal === undefined && against === undefined) {
		return refusal(
			"NO_CURRENT_VARIANT",
			`"${board.name}" has no current variant: nothing it describes is built, so there is no code for a footprint to be read against. Name a draft with --variant.`,
		);
	}
	return { against, proposal };
}

export { type FootprintVariants, isRefusal, type Refusal, variantsOf };
