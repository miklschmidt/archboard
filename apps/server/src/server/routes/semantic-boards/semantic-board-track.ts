// The route that lists a tracked embed on a board (ADR 0057).
//
// A write like any other: the same envelope, the same `?doing=`, the same lease
// and the same answer. It needs no expected version, because an addition to
// the list undoes nothing another writer did, and it checks one when a caller
// states it. Tracking an embed the board lists already answers the board as it
// stands, unchanged and at the same version, so a repeated `--track` is one.

import type { NextFunction, Request, Response } from "express";
import { SemanticBoardSchema } from "@archboard/board/document";
import { readSemanticBoard } from "@archboard/board/store-read";
import { trackEmbedTransition, writeSemanticBoard } from "@archboard/board/store-write";
import { vaultOfRequest } from "@archboard/workbench/host";
import {
	asCommand,
	expectedVersion,
	statedEnvelope,
} from "#server/protocol/semantic-write/semantic-write-requests.ts";
import {
	announceWork,
	answerWrite,
	describedWrite,
	writerOf,
} from "#server/routes/semantic-boards/semantic-board-writes.ts";

/** One embed a board lists, as a caller states it. */
const TrackedEmbedSchema = SemanticBoardSchema.shape.trackedEmbeds.unwrap().element;

/**
 * Answer a tracking the board had already: the board as it stands.
 * @param res The response.
 * @param vault The vault the board lives in.
 * @param board The board's name.
 */
function answerTracked(res: Response, vault: string, board: string): void {
	const read = readSemanticBoard(vault, board);
	if (!read.ok) {
		res.status(422).json({ success: false, code: read.code, error: read.problem });
		return;
	}
	res.json({
		warnings: read.warnings,
		success: true,
		board: read.board,
		version: read.board.version,
		reconciliation: null,
	});
}

/**
 * What a tracking request states, before it is allowed near the write boundary.
 * @param req The request.
 * @param res Its response.
 * @returns The stated write, or null when the refusal has already been sent.
 */
function statedTrack(req: Request, res: Response) {
	const envelope = statedEnvelope(req, res);
	if (envelope === null) return null;
	const doing = describedWrite(req, res, envelope);
	if (doing === null) return null;
	const stated = expectedVersion(req);
	if (!stated.ok) {
		res.status(400).json({ success: false, code: "BAD_EXPECTED_VERSION", error: stated.problem });
		return null;
	}
	const embed = asCommand(TrackedEmbedSchema, req.body.track, res);
	return embed === null ? null : { envelope, doing, version: stated.version, embed };
}

/**
 * List one embed on a board.
 * @param req The request.
 * @param res Its response.
 * @param _next The next handler, which a write never calls.
 * @param signal Cancels waiting for the board's lease when the caller goes.
 */
async function trackEmbedRoute(
	req: Request,
	res: Response,
	_next: NextFunction,
	signal: AbortSignal,
): Promise<void> {
	const stated = statedTrack(req, res);
	if (stated === null) return;
	const { envelope, doing, embed } = stated;
	const vault = vaultOfRequest(req);
	const result = await writeSemanticBoard({
		vault,
		board: envelope.board,
		writer: writerOf(envelope),
		transition: trackEmbedTransition(embed),
		expectedVersion: stated.version,
		signal,
	});
	if (result.outcome === "rejected" && result.code === "EMBED_ALREADY_TRACKED") {
		answerTracked(res, vault, envelope.board);
		return;
	}
	announceWork(vault, result, doing, envelope);
	answerWrite(res, vault, result, envelope);
}

export { trackEmbedRoute };
