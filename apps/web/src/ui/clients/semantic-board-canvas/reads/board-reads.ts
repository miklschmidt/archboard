// Where retained board documents, vault policy, and remembered code findings come from.
//
// A page reads them from the Archboard server. A page rendering a recording
// frame by frame reads them from the talk it recorded instead, so the picture
// is the one the voice spoke over, whatever the board says now (TASK-381). The
// page chooses once, at start, before anything is read.

import type { RememberedFindings } from "@archboard/code-intel/code-check";
import {
	fetchCodeFindings,
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
}

const fromServer: BoardReads = {
	document: fetchSemanticBoardDocument,
	vaultCheck: fetchVaultCheck,
	codeFindings: fetchCodeFindings,
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
