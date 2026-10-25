// The route that moves a board into another repository's vault (ADR 0051).
//
// A move is an agent write like any other: the same envelope, the same
// `?doing=`, the same required expected version, and a refusal answered in the
// same shape and status. The call names its vault, which is the
// vault the board is in, and names the vault it moves to in `move.to`, which is
// read as strictly as the vault of any call (ADR 0049).
//
// What it announces is the news every board it wrote makes, in the vault of
// each: the board in the target vault, each board whose drill-down it
// rewrote, and the board gone from the source vault, as a discard announces
// it but naming where it went. The line the mover wrote goes up on every
// board it wrote and on the board in the source vault. Every pane that showed
// the board in the source vault moves with it into the target vault and shows
// it there (ADR 0051), as a show of another repository's board moves a pane.
// A target in a known checkout that is not the chosen one of its repository
// becomes the chosen one once the move has finished, as an agent's show makes
// it (ADR 0050), so the app goes on reading the board where it is now. A move
// that stopped part way announces what it did write, moves no pane, chooses
// nothing, and is answered as a refusal that says to run it again.

import type { NextFunction, Request, Response } from "express";
import type { z } from "zod";
import { parseBoardKey, semanticBoardAddress } from "@archboard/board/address";
import { forgetDoing } from "@archboard/board/doing";
import { BoardMoveInputSchema } from "@archboard/board/commands";
import {
	moveSemanticBoard,
	previewSemanticMove,
} from "@archboard/board/store-move";
import { announceDoing } from "#server/projections/board-announcements/board-announcements.ts";
import {
	aggregateOf,
	broadcast,
	paneBoardOf,
	sendToPane,
	settledChangeFields,
} from "@archboard/workbench/panes";
import { arrivedOnBoard } from "#server/routes/panes/pane-routes.ts";
import { chooseShownCheckout, type ShowChoice } from "#server/routes/panes/pane-show-route.ts";
import { movePaneVault, paneClientsOfVault } from "#server/state/pane-vaults/pane-vaults.ts";
import { repositoryOfVault } from "@archboard/workspace/repository-listing";
import { followRegistry } from "#server/routes/repositories/repository-routes.ts";
import { namedVault, vaultOfRequest } from "@archboard/workbench/host";
import {
	answerRefusal,
	describedWrite,
	writerOf,
} from "#server/routes/semantic-boards/semantic-board-writes.ts";
import {
	asCommand,
	requiredVersion,
	statedContent,
	statedEnvelope,
	usableBoard,
	type WriteEnvelopeSchema,
} from "#server/protocol/semantic-write/semantic-write-requests.ts";

type SemanticMoveResult = Awaited<ReturnType<typeof moveSemanticBoard>>;

/** A move that wrote something: the whole move, or the part before it stopped. */
type Wrote = Exclude<SemanticMoveResult, { outcome: "rejected" }>;

/**
 * Move every pane that shows the board in the source vault into the target
 * vault, each keeping the address it shows, so it reads the board where it is
 * now (ADR 0051).
 * @param from The source vault.
 * @param to The target vault.
 * @param key The board's key.
 */
function followMovedBoard(from: string, to: string, key: string): void {
	const repository = repositoryOfVault(to);
	for (const clientId of paneClientsOfVault(from)) {
		const shown = paneBoardOf(clientId);
		if (shown === null || (aggregateOf(shown) ?? shown) !== key) continue;
		movePaneVault(clientId, to);
		sendToPane(
			clientId,
			{ type: "pane_board", identity: parseBoardKey(shown), vault: to, repository },
			shown,
		);
		arrivedOnBoard(clientId, shown);
	}
}

/**
 * Tell the panes of each vault about every board the move wrote, and say what
 * the mover was doing on each of them and on the board in the source vault. A
 * finished move then chooses the target's checkout when it is a known one that
 * is not chosen, moves every pane on the board to the target vault, tells the
 * source vault the board is gone from it, forgets the lines said about it
 * there, and brings every other pane in line with the choice it made.
 * @param result What the move did.
 * @param doing The line the mover wrote, or empty for a person.
 * @param by The agent session that asked, or null when it named none.
 * @returns The choice of checkout a finished move made, or undefined when it changed none.
 */
function announceMove(result: Wrote, doing: string, by: string | null): ShowChoice | undefined {
	const { from, to, heldAs } = result;
	const { key } = semanticBoardAddress(result.board.name);
	if (doing !== "") {
		const entry = { doing, at: new Date().toISOString(), by: "agent", kind: "agent" as const };
		announceDoing(from.vault, key, entry);
		for (const write of result.written) announceDoing(write.vault, write.location.key, entry);
	}
	for (const write of result.written) {
		broadcast(
			{
				type: "board_note",
				board: write.location.key,
				...settledChangeFields({ version: write.version, by, heldAs }),
			},
			write.vault,
			write.location.key,
		);
	}
	if (result.outcome !== "moved") return undefined;
	// Chosen only once nothing can stop the move (ADR 0050).
	const chose = chooseShownCheckout(to.vault, "A move");
	followMovedBoard(from.vault, to.vault, key);
	broadcast(
		{
			type: "board_note",
			board: key,
			...settledChangeFields({ by, heldAs, discarded: true, movedTo: to }),
		},
		from.vault,
		key,
	);
	forgetDoing({ vault: from.vault, board: key });
	if (chose !== undefined) followRegistry();
	return chose;
}

/**
 * What a move answers with: the board as it now stands in the target vault,
 * both ends of the move and every drill-down it rewrote.
 * @param result What the move did.
 * @returns The answer's fields.
 */
function moveFields(result: Wrote) {
	return {
		board: result.board,
		version: result.board.version,
		from: result.from,
		to: result.to,
		rewritten: result.rewritten,
	};
}

/**
 * Who is moving the board and what they say they are doing, or nothing when
 * the refusal has already been sent.
 * @param req The request.
 * @param res Its response.
 * @returns The envelope and the line.
 */
function describedEnvelope(
	req: Request,
	res: Response,
): { readonly envelope: z.infer<typeof WriteEnvelopeSchema>; readonly doing: string } | null {
	const envelope = statedEnvelope(req, res);
	if (envelope === null) return null;
	const doing = describedWrite(req, res, envelope);
	return doing === null ? null : { envelope, doing };
}

/**
 * The vault the board moves to, read as strictly as the vault of any call.
 * @param req The request.
 * @param res Its response.
 * @returns Its canonical directory, or null when the refusal has already been sent.
 */
function statedTarget(req: Request, res: Response): string | null {
	const body = statedContent(req, res, "move", true);
	const moving = body === null ? null : asCommand(BoardMoveInputSchema, body, res);
	if (moving === null) return null;
	const target = namedVault(moving.to);
	if (target.ok) return target.vault;
	const { status, code, error } = target.refusal;
	res.status(status).json({ success: false, code, error });
	return null;
}

/**
 * Everything a move states before it is a command.
 * @param req The request.
 * @param res Its response.
 * @returns What was stated, or null when the refusal has already been sent.
 */
function statedMove(req: Request, res: Response) {
	const described = describedEnvelope(req, res);
	if (described === null) return null;
	const version = requiredVersion(req, res, described.envelope.board);
	if (version === null) return null;
	const to = statedTarget(req, res);
	return to === null ? null : { ...described, version, to };
}

/**
 * Move one board, every variant of it, into another repository's vault.
 * @param req The request.
 * @param res Its response.
 * @param _next The next handler, which a write never calls.
 * @param signal Cancels waiting for a lease when the caller goes.
 */
async function moveRoute(
	req: Request,
	res: Response,
	_next: NextFunction,
	signal: AbortSignal,
): Promise<void> {
	const stated = statedMove(req, res);
	if (stated === null) return;
	const { envelope } = stated;
	const result = await moveSemanticBoard({
		vault: vaultOfRequest(req),
		board: envelope.board,
		to: stated.to,
		writer: writerOf(envelope),
		expectedVersion: stated.version,
		signal,
	});
	if (result.outcome === "rejected") {
		answerRefusal(res, result);
		return;
	}
	const chose = announceMove(result, stated.doing, envelope.session ?? null);
	if (result.outcome === "stopped") {
		res.status(409).json({
			success: false,
			code: result.code,
			error: result.problem,
			...moveFields(result),
		});
		return;
	}
	res.json({ success: true, ...moveFields(result), ...(chose === undefined ? {} : { chose }) });
}

/**
 * The board and the target vault a move preview names, or nothing when the
 * refusal has already been sent.
 * @param req The request.
 * @param res Its response.
 * @returns The board, and the target's canonical directory.
 */
function previewTarget(req: Request, res: Response): { board: string; to: string } | null {
	const board = req.query["board"];
	if (typeof board !== "string" || board === "") {
		res.status(400).json({
			success: false,
			code: "BAD_REQUEST",
			error: "A move preview names its board in ?board=.",
		});
		return null;
	}
	if (usableBoard({ board }, res) === null) return null;
	const target = namedVault(req.query["to"]);
	if (target.ok) return { board, to: target.vault };
	const { status, code, error } = target.refusal;
	res.status(status).json({ success: false, code, error });
	return null;
}

/**
 * What a move would do now: every drill-down it rewrites, or why it would be
 * refused, in the refusal's own terms (ADR 0051). The browser asks before a
 * person moves a board, so it names the target vault as a move does, in `?to=`.
 * Nothing is held or written.
 * @param req The request.
 * @param res Its response.
 */
function movePreviewRoute(req: Request, res: Response): void {
	const asked = previewTarget(req, res);
	if (asked === null) return;
	const preview = previewSemanticMove({ vault: vaultOfRequest(req), ...asked });
	if (preview.outcome === "rejected") {
		answerRefusal(res, preview);
		return;
	}
	const { from, to, rewritten } = preview;
	res.json({ success: true, version: preview.board.version, from, to, rewritten });
}

export { movePreviewRoute, moveRoute };
