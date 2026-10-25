// The route that renames a board or one of its variants (TASK-281, ADR 0036).
//
// A rename is a write like any other: the same envelope, the same `?doing=`,
// the same expected version and the same lease, answered in the same shape.
// What is its own is what a board's new name moves with it. The file, the
// lease, the claim and what an agent said it was doing are all facts about the
// board, and everything this server keyed by the old name follows it:
//
//   every pane on the board is pointed at the name it has now, so the next news
//     about the board reaches it and its address is rewritten to the new name;
//   this server's claim on the board is carried to the new name, so a campaign
//     that renamed its board is still one campaign;
//   the lines an agent wrote about the board stay with it.
//
// A pane addressing a variant by a name that variant has since given up is
// pointed at the name it has now, the same way.
//
// The board package carries the claim and the doing lines
// (`renameSemanticBoard`), and this route points the panes.

import type { NextFunction, Request, Response } from "express";
import {
	makeIdentity,
	paneBoardAddress,
	parseBoardKey,
	statedVariant,
} from "@archboard/board/address";
import { addressedVariant, type SemanticBoard } from "@archboard/board/document";
import { BoardRenameInputSchema } from "@archboard/board/commands";
import { renameSemanticBoard } from "@archboard/board/store-write";
import { publishPaneContext } from "@archboard/workbench/server";
import { aggregateOf, paneBoards, paneVaults, sendToPane } from "@archboard/workbench/panes";
import { arrivedOnBoard } from "#server/routes/panes/pane-routes.ts";
import { acceptedIdentity } from "#server/routes/panes/pane-show-route.ts";
import {
	announceWork,
	answerWrite,
	statedWrite,
	writerOf,
} from "#server/routes/semantic-boards/semantic-board-writes.ts";
import { asCommand } from "#server/protocol/semantic-write/semantic-write-requests.ts";

/**
 * Rename a board, or one variant of it.
 * @param req The request.
 * @param res Its response.
 * @param _next The next handler, which a write never calls.
 * @param signal Cancels waiting for the board's lease when the caller goes.
 */
async function renameRoute(
	req: Request,
	res: Response,
	_next: NextFunction,
	signal: AbortSignal,
): Promise<void> {
	const stated = await statedWrite(req, res, "rename");
	if (stated === null) {
		return;
	}
	const renaming = asCommand(BoardRenameInputSchema, stated.body, res);
	if (renaming === null) {
		return;
	}
	const result = await renameSemanticBoard({
		vault: stated.vault,
		board: stated.envelope.board,
		writer: writerOf(stated.envelope),
		rename: renaming,
		expectedVersion: stated.expected,
		signal,
	});
	if (result.outcome === "applied") {
		repointPanes(stated.vault, result.renamedFrom?.key ?? result.location.key, result.board);
	}
	announceWork(stated.vault, result, stated.doing, stated.envelope);
	answerWrite(res, stated.vault, result, stated.envelope);
}

/**
 * Point every pane on the board at the address it answers to now. A pane whose
 * address was already the board's own is left alone.
 * @param vault The vault the board lives in; panes of another vault are not on it.
 * @param from The key the panes are on.
 * @param board The board as it now stands.
 */
function repointPanes(vault: string, from: string, board: SemanticBoard): void {
	for (const [clientId, key] of paneBoards) {
		if (paneVaults.get(clientId) !== vault || aggregateOf(key) !== from) {
			continue;
		}
		const identity = parseBoardKey(key);
		const opened = addressedVariant(board, statedVariant(identity));
		const accepted = opened.ok
			? acceptedIdentity(identity, board, opened.variant)
			: makeIdentity({ board: board.name, variant: identity.variant });
		const moved = paneBoardAddress(accepted);
		if (moved !== key) {
			sendToPane(clientId, { type: "pane_board", identity: accepted }, moved);
			arrivedOnBoard(clientId, moved);
			publishPaneContext(clientId, "focus");
		}
	}
}

export { renameRoute };
