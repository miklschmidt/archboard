// Where a pane reads a board's document, the vault's policy, the findings of
// the last code check and the locality of a board's code from.
//
// A page reads them from the Archboard server. A page rendering a recording
// frame by frame reads them from the talk it recorded instead, so the picture
// is the one the voice spoke over, whatever the board says now (TASK-381). The
// page chooses once, at start, before anything is read.

import type { RememberedFindings } from "@archboard/code-intel/code-check";
import type { LocalityAnswer } from "@archboard/code-intel/history";
import {
	fetchCodeFindings,
	fetchLocality,
	fetchSemanticBoardDocument,
	fetchVaultCheck,
} from "#ui/clients/semantic-board-canvas/reads/semantic-boards.ts";
import type { VaultCheckSchema } from "@archboard/board/policy";
import type { z } from "zod";

type VaultCheck = z.infer<typeof VaultCheckSchema>;

/** Where boards are read from. */
interface BoardReads {
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
	/**
	 * Where change concentrates in one variant of one board, read from Git. It
	 * takes no cancellation: a pick made while it runs waits for it.
	 * @param vault The vault the board is in.
	 * @param board The board, by name.
	 * @param variant The variant, by id: the current one or a draft.
	 * @returns The answer.
	 */
	readonly locality: (vault: string, board: string, variant: string) => Promise<LocalityAnswer>;
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
