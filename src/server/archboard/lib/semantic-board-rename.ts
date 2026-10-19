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

import type { NextFunction, Request, Response } from "express";
import {
	makeIdentity,
	paneBoardAddress,
	parseBoardKey,
	statedVariant,
} from "@archboard/board/address";
import { claimBoard, claimOn, releaseClaim } from "@archboard/board/lock";
import { forgetDoing, recentDoing, recordDoing } from "@archboard/board/doing";
import { errorMessage } from "@archboard/diagnostics/errno";
import { addressedVariant, type SemanticBoard } from "@archboard/board/document";
import { BoardRenameInputSchema } from "@archboard/board/commands";
import { renameTransition } from "@archboard/board/rename";
import { writeSemanticBoard, type SemanticWriteResult } from "@archboard/board/write";
import type { VaultDiagnostic } from "@archboard/board/policy";
import { publishPaneContext } from "@/server/archboard/lib/codex-wiring";
import {
	aggregateOf,
	paneBoards,
	paneVaults,
	sendToPane,
} from "@/server/archboard/lib/pane-registry";
import { arrivedOnBoard } from "@/server/archboard/lib/pane-routes";
import { acceptedIdentity } from "@/server/archboard/lib/pane-show-route";
import {
	announceWork,
	answerWrite,
	statedWrite,
	writerOf,
} from "@/server/archboard/lib/semantic-board-writes";
import { asCommand } from "@/server/archboard/lib/semantic-write-requests";

/** A write that landed. */
type Applied = Extract<SemanticWriteResult, { outcome: "applied" }>;

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
	const result = await writeSemanticBoard({
		vault: stated.vault,
		board: stated.envelope.board,
		writer: writerOf(stated.envelope),
		transition: renameTransition(renaming),
		expectedVersion: stated.expected,
		signal,
	});
	const answered = result.outcome === "applied" ? await followBoard(stated.vault, result) : result;
	announceWork(stated.vault, answered, stated.doing, stated.envelope);
	answerWrite(res, stated.vault, answered, stated.envelope);
}

/**
 * Move everything this server keyed by the board's old name to its new one,
 * and point every pane on it at the name it goes by now.
 * @param vault The vault the board lives in.
 * @param result The rename that landed.
 * @returns The same result, with a warning when the claim could not follow.
 */
async function followBoard(vault: string, result: Applied): Promise<Applied> {
	const from = result.renamedFrom?.key ?? result.location.key;
	repointPanes(vault, from, result.board);
	if (result.renamedFrom === undefined) {
		return result;
	}
	carryDoing(vault, from, result.location.key);
	const lost = await carryClaim(vault, from, result.location.name);
	return lost === null ? result : { ...result, warnings: [...result.warnings, lost] };
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

/**
 * Keep what agents said they were doing to the board with the board.
 * @param vault The vault the board lives in.
 * @param from The key it was said under.
 * @param to The key the board has now.
 */
function carryDoing(vault: string, from: string, to: string): void {
	for (const entry of recentDoing(vault, from)) {
		recordDoing(vault, to, entry);
	}
	forgetDoing({ vault, board: from });
}

/**
 * Carry this server's claim on the board to its new name, for what is left of
 * the campaign and for the reason it was taken.
 * @param vault The vault the board lives in.
 * @param from The key the claim was taken on.
 * @param to The board's new name.
 * @returns A warning when the claim could not follow the board, else null.
 */
async function carryClaim(
	vault: string,
	from: string,
	to: string,
): Promise<VaultDiagnostic | null> {
	const claim = claimOn(vault, from);
	if (claim === null) {
		return null;
	}
	releaseClaim(vault, from);
	try {
		await claimBoard({
			vault,
			board: to,
			reason: claim.holder.reason ?? "",
			forMs: Date.parse(claim.expires) - Date.now(),
			waitMs: 0,
		});
		return null;
	} catch (error) {
		return {
			severity: "warning",
			code: "CLAIM_NOT_CARRIED",
			file: "",
			board: to,
			message:
				`The board was renamed, and your claim on it ended with its old name: ` +
				`${errorMessage(error)}. Claim "${to}" again to go on with the campaign.`,
		};
	}
}

export { renameRoute };
