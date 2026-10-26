// Reading a footprint by name (ADR 0045): the board a caller names, the
// proposal it names and the variant that proposal is read against, then the
// commits. The lens reads only a live variant, a current one or a draft, never
// a historical or a shelved one. A head that no checkout holding a part
// resolves is refused, because then no part was read and none may look
// unchanged. A footprint keeps no answer: a ref such as `origin/main` can move
// while every HEAD stays.

import {
	addressedVariant,
	currentVariant,
	type SemanticBoard,
	type SemanticVariant,
} from "@archboard/board/document";
import {
	type HistoryReading,
	type HistoryRefusal,
	isRefusal,
	namedBoard,
	refused,
} from "#runtime/operations/history-lens/admission.ts";
import { readVariantFootprint } from "#runtime/operations/history-lens/footprint.ts";
import type { FootprintAnswer } from "#shared/protocol/footprint.ts";
import { HistoryRefusalCode } from "#shared/protocol/history-refusal.ts";

/** What a caller asks a footprint of, by name. */
interface FootprintRequest {
	/** The vault directory the board is in: its own checkout is read for its own repository. */
	readonly vault: string;
	/** The board's name. */
	readonly board: string;
	/** A draft to set the commits against, by id or name. */
	readonly variant?: string | undefined;
	/**
	 * The variant the proposal is read against, by id or name: the board's
	 * current variant by default, else the proposal's parent.
	 */
	readonly against?: string | undefined;
	/** Any ref that resolves in the checkouts, such as `main`, `origin/main` or a commit. */
	readonly base: string;
	/** Where the commits end, when not at each checkout's HEAD. It is never checked out. */
	readonly head?: string | undefined;
	readonly signal?: AbortSignal | undefined;
}

/** The variants one footprint reads. */
interface FootprintVariants {
	/** What the proposal is read against; none for a proposal read against nothing. */
	readonly against: SemanticVariant | undefined;
	readonly proposal: SemanticVariant | undefined;
}

/**
 * The variant a caller named.
 * @param board The board.
 * @param asked The id or name as the caller wrote it.
 * @returns The variant, or why there is none.
 */
function named(board: SemanticBoard, asked: string): SemanticVariant | HistoryRefusal {
	const found = addressedVariant(board, asked);
	return found.ok
		? found.variant
		: refused(HistoryRefusalCode.UNKNOWN_VARIANT, `"${board.name}": ${found.problem}`);
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
): SemanticVariant | HistoryRefusal | undefined {
	if (asked === undefined) return undefined;
	const proposal = named(board, asked);
	if (isRefusal(proposal)) return proposal;
	if (proposal.id === currentVariant(board)?.id) {
		return refused(
			HistoryRefusalCode.NOTHING_TO_COMPARE,
			`"${proposal.name}" is the current variant of "${board.name}". Name a draft to set the footprint against, or leave --variant out.`,
		);
	}
	return proposal.lifecycle === "draft"
		? proposal
		: refused(
				HistoryRefusalCode.NOT_A_DRAFT,
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
): SemanticVariant | HistoryRefusal {
	if (against.id === proposal?.id) {
		return refused(
			HistoryRefusalCode.NOTHING_TO_COMPARE,
			`"${against.name}" is the proposal itself. Read it against another variant of "${board.name}".`,
		);
	}
	return against.lifecycle === "current" || against.lifecycle === "draft"
		? against
		: refused(
				HistoryRefusalCode.AGAINST_NOT_LIVE,
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
): SemanticVariant | HistoryRefusal | undefined {
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
 * @param request The proposal and the variant to read it against, as the caller named them.
 * @returns The variants, or why the request reads none.
 */
function variantsOf(
	board: SemanticBoard,
	request: FootprintRequest,
): FootprintVariants | HistoryRefusal {
	const proposal = proposalOf(board, request.variant);
	if (isRefusal(proposal)) return proposal;
	const against = againstOf(board, request.against, proposal);
	if (isRefusal(against)) return against;
	if (proposal === undefined && against === undefined) {
		return refused(
			HistoryRefusalCode.NO_CURRENT_VARIANT,
			`"${board.name}" has no current variant: nothing it describes is built, so there is no code for a footprint to be read against. Name a draft with --variant.`,
		);
	}
	return { against, proposal };
}

/**
 * Why a head the caller named is refused: no checkout that holds a part of the
 * board resolves it. A head only some checkouts have is read where it
 * resolves, as a base is.
 * @param answer The footprint, read.
 * @returns The refusal, or undefined when the head resolved somewhere or none was named.
 */
function headRefusal(answer: FootprintAnswer): HistoryRefusal | undefined {
	const { head, repositories } = answer;
	const resolved = repositories.some(
		(one) => one.status === "read" || one.reason !== "head-unresolved",
	);
	if (head === undefined || repositories.length === 0 || resolved) return undefined;
	return refused(
		HistoryRefusalCode.HEAD_UNRESOLVED,
		`--head "${head}" does not resolve in any checkout that holds a part of "${answer.board}". Name a branch, tag or commit that the checkout has; nothing is fetched.`,
	);
}

/**
 * Read the footprint of a range of commits on the board a caller names,
 * against a proposal when one is named.
 * @param request What to read, by name.
 * @returns The footprint, or why it reads nothing.
 */
async function readFootprint(request: FootprintRequest): Promise<HistoryReading<FootprintAnswer>> {
	const board = namedBoard(request.vault, request.board);
	if (isRefusal(board)) return board;
	const variants = variantsOf(board, request);
	if (isRefusal(variants)) return variants;
	const { vault, base, head, signal } = request;
	const answer = await readVariantFootprint({ vault, board, base, head, signal, ...variants });
	return headRefusal(answer) ?? { ok: true, answer };
}

export { readFootprint };
