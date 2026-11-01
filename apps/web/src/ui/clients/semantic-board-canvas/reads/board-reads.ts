// Retained documents come from an explicit capture. Live panes read only canonical models.

import type { RememberedFindings } from "@archboard/code-intel/code-check";
import {
	fetchCodeFindings,
	SemanticBoardError,
	type SemanticBoardListing,
	fetchVaultCheck,
} from "#ui/clients/semantic-board-canvas/reads/semantic-boards.ts";
import type { VaultCheckSchema } from "@archboard/board/policy";
import type { z } from "zod";

type VaultCheck = z.infer<typeof VaultCheckSchema>;

/** Where boards are read from. */
interface BoardReads {
	/** List only the original documents supplied by the capture. */
	readonly listing: (vault: string, signal?: AbortSignal) => Promise<SemanticBoardListing>;
	/**
	 * One board's whole document.
	 * @param vault The vault the board is in.
	 * @param board The board, by name.
	 * @param signal Cancels the read.
	 * @returns The document, not yet checked.
	 */
	readonly document: (vault: string, board: string, signal?: AbortSignal) => Promise<unknown>;
	/**
	 * The vault's checked policy and diagnostics.
	 * @param vault The vault.
	 * @param signal Cancels the read.
	 * @returns The check.
	 */
	readonly vaultCheck: (vault: string, signal?: AbortSignal) => Promise<VaultCheck>;
	/**
	 * What the last code pass found on each board it read. Never a pass.
	 * @param vault The vault.
	 * @param signal Cancels the read.
	 * @returns The remembered readings.
	 */
	readonly codeFindings: (vault: string, signal?: AbortSignal) => Promise<RememberedFindings>;
}

/**
 * Retained documents require a capture supplied by replay.
 * @returns An explicit refusal without a live board request.
 * @throws {SemanticBoardError} When no retained provider is installed.
 */
async function captureRequired(): Promise<never> {
	throw new SemanticBoardError(
		"BOARD_UNREADABLE",
		"Open an exact retained recording to read original board content.",
	);
}

const liveEvidence: BoardReads = {
	document: captureRequired,
	listing: captureRequired,
	vaultCheck: fetchVaultCheck,
	codeFindings: fetchCodeFindings,
};

let current: BoardReads = liveEvidence;

/**
 * Where boards are read from now.
 * @returns The reads.
 */
function boardReads(): BoardReads {
	return current;
}

/**
 * Read boards from somewhere else from now on.
 * @param reads Where.
 */
function readBoardsFrom(reads: BoardReads): void {
	current = reads;
}

export { boardReads, readBoardsFrom, type BoardReads };
