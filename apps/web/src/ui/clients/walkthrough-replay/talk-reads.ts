// A talk's board and policy, read the way a pane reads them from the server.
//
// The picture is rendered from the board the voice spoke over, whatever the
// board says now or whether it still exists. So the pane reads the talk's
// snapshot, and a read of any other board is a failure of the rendering rather
// than a quiet trip to the server.

import type { Talk } from "@archboard/walkthrough/talk";
import { sameBoardName } from "#ui/rules/semantic-board-canvas/board/address.ts";
import { type BoardReads } from "#ui/clients/semantic-board-canvas/reads/board-reads.ts";

/**
 * Board reads answered from a talk.
 * @param talk The talk.
 * @param foreign Told of a read of another board, which the talk cannot answer.
 * @returns The reads.
 */
function talkReads(talk: Talk, foreign: (board: string) => void): BoardReads {
	return {
		/**
		 * The talk's board, and no other, whichever vault the pane names.
		 * @param _vault The pane's vault, which a talk has no use for.
		 * @param board The board asked for.
		 * @returns The talk's document.
		 * @throws {Error} When another board is asked for.
		 */
		document: async (_vault, board) => {
			if (sameBoardName(board, talk.board.name)) return talk.document;
			foreign(board);
			throw new Error(`The talk is of ${talk.board.name}; ${board} was read while rendering it.`);
		},
		/**
		 * The policy the talk's board was drawn under.
		 * @returns The vault check the talk kept.
		 */
		vaultCheck: async () => talk.policy,
		/**
		 * No findings: a recording draws the board the voice spoke over, never
		 * what a code pass left in some server's memory.
		 * @returns No readings.
		 */
		codeFindings: async () => ({ readings: [] }),
		/**
		 * No exposed names, for the reason there are no findings.
		 * @returns No reading.
		 */
		exposure: async () => null,
		/**
		 * No history: a recording reads the board the voice spoke over, never Git.
		 * @throws {Error} Always.
		 */
		locality: async () => {
			throw new Error("A recording reads no history of the code.");
		},
	};
}

export { talkReads };
