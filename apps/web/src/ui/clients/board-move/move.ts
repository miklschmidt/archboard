// What the browser asks when a person moves a board to another repository
// (ADR 0051): what the move would rewrite, and the move itself. The move is the
// person's own act, as taking back a claim is, so it states the human origin
// and writes no doing line. It states the version the preview read, so a board
// written since is refused rather than moved as nobody saw it.

import type { BoardMoveAnswer, BoardMovePreview } from "@archboard/board/commands";
import { inVault, requestJson } from "@archboard/server-requests";

/** Which board to move, from which vault, to which vault. */
interface MoveAsked {
	/** The vault the board is in. */
	readonly vault: string;
	/** The board's name, without a variant: every variant moves with it. */
	readonly board: string;
	/** The vault it moves to. */
	readonly to: string;
}

/**
 * What the move would do now, or why it would be refused.
 * @param asked The board and the two vaults.
 * @param signal Cancels the read.
 * @returns The preview. A refusal throws with the move's own words.
 */
function previewMove(asked: MoveAsked, signal?: AbortSignal): Promise<BoardMovePreview> {
	const query = `?board=${encodeURIComponent(asked.board)}&to=${encodeURIComponent(asked.to)}`;
	return requestJson(inVault(`/api/semantic-boards/move-preview${query}`, asked.vault), { signal });
}

/**
 * Move the board, every variant of it, as the version the preview read.
 * @param asked The board and the two vaults.
 * @param version The version the preview read.
 * @returns The move's answer. A refusal throws with the move's own words.
 */
function moveBoard(asked: MoveAsked, version: number): Promise<BoardMoveAnswer> {
	const url = inVault(`/api/semantic-boards/move?expectVersion=${version}`, asked.vault);
	return requestJson(url, {
		method: "POST",
		payload: { board: asked.board, origin: "human", move: { to: asked.to } },
	});
}

export { moveBoard, previewMove, type MoveAsked };
