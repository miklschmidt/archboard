// A talk's board and policy, read the way a pane reads them from the server.
//
// The picture is rendered from the board the voice spoke over, whatever the
// board says now or whether it still exists. So the pane reads the talk's
// snapshot, and a read of any other board is a failure of the rendering rather
// than a quiet trip to the server.

import { parseSemanticBoard } from "@archboard/board/document";
import {
	SemanticBoardError,
	type SemanticBoardListing,
} from "#ui/clients/semantic-board-canvas/reads/semantic-boards.ts";
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
		 * List the original document inside this capture.
		 * @returns Only the document retained by this talk.
		 */
		listing: async () => retainedListing(talk),
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
	};
}

/**
 * Describe the captured original without discovering live boards.
 * @param talk The immutable recording.
 * @returns The one available original document.
 * @throws {SemanticBoardError} When the retained document is invalid.
 */
function retainedListing(talk: Talk): SemanticBoardListing {
	const parsed = parseSemanticBoard(talk.document);
	if (!parsed.ok) throw new SemanticBoardError("BOARD_UNREADABLE", parsed.problem);
	const board = parsed.board;
	return {
		levels: [],
		boards: [
			{
				id: board.id,
				key: board.name,
				name: board.name,
				version: board.version,
				opens: board.current ?? null,
				links: [],
				description: null,
				variants: board.variants.map((variant) => ({
					id: variant.id,
					name: variant.name,
					lifecycle: variant.lifecycle,
					parentId: variant.parent ?? null,
				})),
			},
		],
	};
}

export { talkReads };
