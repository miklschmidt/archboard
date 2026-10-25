// Reading locality by name (ADR 0045): the board a caller names, at its
// current variant or at the draft the caller names. A historical or a shelved
// variant is refused, because only the current variant says that its
// architecture is built (ADR 0031), and a draft says what will be. The reading
// keeps its answers while nothing they derive from has moved (`locality.ts`).

import {
	resolveVariant,
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
import { createVariantLocality } from "#runtime/operations/history-lens/locality.ts";
import type { LocalityAnswer } from "#shared/protocol/locality.ts";
import { HistoryRefusalCode } from "#shared/protocol/history-refusal.ts";

/** What a caller asks the locality of, by name. */
interface LocalityRequest {
	/** The vault directory the board is in: its own checkout is read for its own repository. */
	readonly vault: string;
	/** The board's name. */
	readonly board: string;
	/** A draft to read, by id or name; the board's current variant when absent. */
	readonly variant?: string | undefined;
	/** The start of the period, or undefined for the year before each HEAD. */
	readonly since?: Date | undefined;
	/** Cancels the reading and every Git command it runs, once no other request waits for it. */
	readonly signal?: AbortSignal | undefined;
}

/** The reading of locality, with the memory of its answers. */
interface LocalityReading {
	/**
	 * The hotspots and change coupling of the variant of a board that a caller names.
	 * @param request What to read, by name.
	 * @returns The answer, or why it reads nothing.
	 */
	read(request: LocalityRequest): Promise<HistoryReading<LocalityAnswer>>;
}

/**
 * The variant the lens reads: the current one, or the draft that was named.
 * @param board The board.
 * @param asked The variant's id or name, or undefined for the current one.
 * @returns The variant, or why the lens does not read it.
 */
function readableVariant(
	board: SemanticBoard,
	asked: string | undefined,
): SemanticVariant | HistoryRefusal {
	const variant = resolveVariant(board, asked);
	if (variant === undefined) {
		return asked === undefined
			? refused(
					HistoryRefusalCode.NO_CURRENT_VARIANT,
					`"${board.name}" has no current variant: nothing it describes is built. Name a draft with the variant option.`,
				)
			: refused(
					HistoryRefusalCode.UNKNOWN_VARIANT,
					`"${board.name}" has no variant called "${asked}".`,
				);
	}
	if (variant.lifecycle === "current" || variant.lifecycle === "draft") return variant;
	return refused(
		HistoryRefusalCode.NOT_A_DRAFT,
		`"${variant.name}" is ${variant.lifecycle}: the lens reads only the current variant and a draft.`,
	);
}

/**
 * A reading of locality by name, which keeps its answers while nothing they
 * derive from has moved.
 * @returns The reading.
 */
function createLocalityReading(): LocalityReading {
	const locality = createVariantLocality();
	return {
		/**
		 * Read the board, choose its variant, and read or answer from memory.
		 * @param request What to read, by name.
		 * @returns The answer, or why it reads nothing.
		 */
		async read(request) {
			const board = namedBoard(request.vault, request.board);
			if (isRefusal(board)) return board;
			const variant = readableVariant(board, request.variant);
			if (isRefusal(variant)) return variant;
			const { vault, since, signal } = request;
			return { ok: true, answer: await locality.read(vault, board, variant, since, signal) };
		},
	};
}

export { createLocalityReading };
