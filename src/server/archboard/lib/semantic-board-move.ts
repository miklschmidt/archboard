// The route that moves a board into another repository's vault (ADR 0051).
//
// A move is an agent write like any other: the same envelope, the same
// `?doing=`, an expected version when the caller states one, and a refusal
// answered in the same shape and status. The call names its vault, which is the
// vault the board is in, and names the vault it moves to in `move.to`, which is
// read as strictly as the vault of any call (ADR 0049).
//
// What it announces is the news every board it wrote makes, in the vault of
// each: the board in the target vault, each board whose drill-down it
// rewrote, and the board gone from the source vault, as a discard announces
// it. The line the mover wrote goes up in both vaults. A move that stopped part
// way announces what it did write, and is answered as a refusal that says to
// run it again.

import type { NextFunction, Request, Response } from "express";
import type { z } from "zod";
import { forgetDoing } from "@/runtime/engine/board-doing";
import { BoardMoveInputSchema } from "@/shared/semantic-board/index";
import {
	moveSemanticBoard,
	semanticBoardAddress,
	type SemanticMoveResult,
} from "@/runtime/semantic-board-store/index";
import { announceDoing } from "@/server/archboard/lib/board-announcements";
import { broadcast } from "@/server/archboard/lib/pane-registry";
import { namedVault, vaultOfRequest } from "@/server/archboard/lib/request-vault";
import { settledChangeFields } from "@/server/archboard/lib/semantic-change-feed";
import {
	answerRefusal,
	describedWrite,
	writerOf,
} from "@/server/archboard/lib/semantic-board-writes";
import {
	asCommand,
	expectedVersion,
	statedContent,
	statedEnvelope,
	type WriteEnvelopeSchema,
} from "@/server/archboard/lib/semantic-write-requests";

/** A move that wrote something: the whole move, or the part before it stopped. */
type Wrote = Exclude<SemanticMoveResult, { outcome: "rejected" }>;

/**
 * Tell the panes of each vault about every board the move wrote, and say what
 * the mover was doing in both vaults. A finished move then tells the source
 * vault the board is gone from it, and forgets the lines said about it there.
 * @param result What the move did.
 * @param doing The line the mover wrote, or empty for a person.
 * @param by The agent session that asked, or null when it named none.
 */
function announceMove(result: Wrote, doing: string, by: string | null): void {
	const { from, to, heldAs } = result;
	const { key } = semanticBoardAddress(result.board.name);
	if (doing !== "") {
		const entry = { doing, at: new Date().toISOString(), by: "agent", kind: "agent" as const };
		announceDoing(from.vault, key, entry);
		announceDoing(to.vault, key, entry);
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
	if (result.outcome !== "moved") return;
	broadcast(
		{ type: "board_note", board: key, ...settledChangeFields({ by, heldAs, discarded: true }) },
		from.vault,
		key,
	);
	forgetDoing({ vault: from.vault, board: key });
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
 * The version the mover read, when it states one: optional, as a discard's
 * is, and refused when it is spelled wrong rather than read as absent.
 * @param req The request.
 * @param res Its response.
 * @returns The version, or null when the refusal has already been sent.
 */
function statedVersion(req: Request, res: Response): { readonly version?: number } | null {
	const stated = expectedVersion(req);
	if (stated.ok) return stated.version === undefined ? {} : { version: stated.version };
	res.status(400).json({ success: false, code: "BAD_EXPECTED_VERSION", error: stated.problem });
	return null;
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
	const version = statedVersion(req, res);
	if (version === null) return null;
	const to = statedTarget(req, res);
	return to === null ? null : { ...described, ...version, to };
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
	announceMove(result, stated.doing, envelope.session ?? null);
	if (result.outcome === "stopped") {
		res.status(409).json({
			success: false,
			code: result.code,
			error: result.problem,
			...moveFields(result),
		});
		return;
	}
	res.json({ success: true, ...moveFields(result) });
}

export { moveRoute };
