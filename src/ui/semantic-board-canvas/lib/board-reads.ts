// Where a pane reads a board's document and the vault's policy from.
//
// A page reads both from the Archboard server. A page rendering a recording
// frame by frame reads them from the talk it recorded instead, so the picture
// is the one the voice spoke over, whatever the board says now (TASK-381). The
// page chooses once, at start, before anything is read.

import type { VaultCheck } from "@/shared/semantic-policy/index";
import {
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
}

const fromServer: BoardReads = {
	document: fetchSemanticBoardDocument,
	vaultCheck: fetchVaultCheck,
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
