// Where a pane reads a board's document, the vault's policy, the findings of
// the last code check and the locality of a board's code from.
//
// A page reads them from the Archboard server. A page rendering a recording
// frame by frame reads them from the talk it recorded instead, so the picture
// is the one the voice spoke over, whatever the board says now (TASK-381). The
// page chooses once, at start, before anything is read.

import type { RememberedFindings } from "@/shared/code-check/index";
import type { LocalityAnswer } from "@/shared/locality/index";
import type { VaultCheck } from "@/shared/semantic-policy/index";
import {
	fetchCodeFindings,
	fetchLocality,
	fetchSemanticBoardDocument,
	fetchVaultCheck,
} from "@/ui/semantic-board-canvas/api/semantic-boards";

/** Where boards are read from. */
interface BoardReads {
	/**
	 * One board's whole document.
	 * @param board The board, by name.
	 * @param signal Cancels the read.
	 * @returns The document, not yet checked.
	 */
	readonly document: (board: string, signal?: AbortSignal) => Promise<unknown>;
	/**
	 * The vault's checked policy and diagnostics.
	 * @param signal Cancels the read.
	 * @returns The check.
	 */
	readonly vaultCheck: (signal?: AbortSignal) => Promise<VaultCheck>;
	/**
	 * What the last code pass found on each board it read. Never a pass.
	 * @param signal Cancels the read.
	 * @returns The remembered readings.
	 */
	readonly codeFindings: (signal?: AbortSignal) => Promise<RememberedFindings>;
	/**
	 * Where change concentrates in one variant of one board, read from Git. It
	 * takes no cancellation: a pick made while it runs waits for it.
	 * @param board The board, by name.
	 * @param variant The variant, by id: the current one or a draft.
	 * @returns The answer.
	 */
	readonly locality: (board: string, variant: string) => Promise<LocalityAnswer>;
}

const fromServer: BoardReads = {
	document: fetchSemanticBoardDocument,
	vaultCheck: fetchVaultCheck,
	codeFindings: fetchCodeFindings,
	locality: fetchLocality,
};

let current: BoardReads = fromServer;

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
