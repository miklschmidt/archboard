import type { NextFunction, Request, Response } from "express";
import { HistoricalCorrectionInputSchema } from "@archboard/board/commands";
import { addressedVariant } from "@archboard/board/document";
import { readSemanticBoard } from "@archboard/board/store-read";
import { prepareSemanticBoardWrite } from "@archboard/board/store-write";
import { checkCandidateCode, suggestHistoricalCommits } from "@archboard/code-intel/code-check-run";
import { checkoutWork } from "#server/wiring/owners/server-owners.ts";
import { queryString, vaultOfRequest } from "@archboard/workbench/host";
import {
	asCommand,
	requiredVersion,
	statedEnvelope,
	usableBoard,
} from "#server/protocol/semantic-write/semantic-write-requests.ts";
import {
	announceWork,
	needsAttention,
	answerWrite,
	describedWrite,
	writerOf,
} from "#server/routes/semantic-boards/semantic-board-writes.ts";

/**
 * Read the correction request before reading board content.
 * @param req The request.
 * @param res Its response.
 * @param apply Whether the caller asks for a write.
 * @returns The stated request, or null after a refusal.
 */
function statedCorrection(req: Request, res: Response, apply: boolean) {
	const envelope = statedEnvelope(req, res);
	if (envelope === null) return null;
	const doing = apply ? describedWrite(req, res, envelope) : "";
	if (doing === null) return null;
	const expected = requiredVersion(req, res, envelope.board);
	if (expected === null) return null;
	const input = asCommand(HistoricalCorrectionInputSchema, req.body.correct, res);
	if (input === null) return null;
	return { envelope, expected, input, doing, vault: vaultOfRequest(req) };
}

/**
 * Prepare the corrected board without writing it, and select the variant the
 * evidence is read for.
 * @param res Its response.
 * @param stated The parsed correction.
 * @returns The prepared candidate and its corrected variant, or null after a refusal.
 */
function prepareCorrection(
	res: Response,
	stated: NonNullable<ReturnType<typeof statedCorrection>>,
) {
	const prepared = prepareSemanticBoardWrite({
		vault: stated.vault,
		board: stated.envelope.board,
		expectedVersion: stated.expected,
		correct: stated.input,
	});
	if (prepared.outcome === "rejected") {
		answerPreparationRefusal(res, prepared);
		return null;
	}
	const selected = addressedVariant(prepared.board, stated.input.variant);
	if (!selected.ok) throw new Error(selected.problem);
	return { prepared, variant: selected.variant };
}

/**
 * Answer a correction the store would not prepare, in this route's own codes.
 * @param res Its response.
 * @param refused Why the store would not write the correction.
 */
function answerPreparationRefusal(
	res: Response,
	refused: Extract<ReturnType<typeof prepareSemanticBoardWrite>, { outcome: "rejected" }>,
): void {
	if (refused.code === "BOARD_VERSION_CONFLICT") {
		res.status(409).json({
			success: false,
			code: refused.code,
			error: "The board changed. Read it again before correcting it.",
			version: refused.version,
		});
		return;
	}
	// A candidate the board's coherence or vocabulary refuses is INVALID_BOARD
	// on this route, where the store says INVALID_CONTENT.
	const code = refused.code === "INVALID_CONTENT" ? "INVALID_BOARD" : refused.code;
	res.status(422).json({ success: false, code, error: refused.problem });
}

/**
 * Inspect or commit a correction against the same immutable Git evidence.
 * @param req The request.
 * @param res Its response.
 * @param apply Whether to write the checked candidate.
 * @param signal Cancels work before the write begins.
 */
async function correct(
	req: Request,
	res: Response,
	apply: boolean,
	signal: AbortSignal,
): Promise<void> {
	const stated = statedCorrection(req, res, apply);
	if (stated === null) return;
	const preparation = prepareCorrection(res, stated);
	if (preparation === null) return;
	const { envelope, input, doing, vault } = stated;
	const { prepared, variant } = preparation;
	// The code reading is checkout work, so a stopping server cancels it rather
	// than waiting for it as it waits for the write. No lease is held while it runs.
	const checked = await checkoutWork.track("Historical correction code check", signal, (reading) =>
		checkCandidateCode({
			vault,
			board: prepared.board,
			file: prepared.location.file,
			variant,
			revisions: input.revisions,
			signal: reading,
		}),
	);
	if (!checked.ok) {
		res
			.status(422)
			.json({ success: false, code: "HISTORICAL_EVIDENCE_UNREADABLE", error: checked.problem });
		return;
	}
	const { ok: _ok, ...codeCheck } = checked;
	if (!apply) {
		res.json({
			success: true,
			board: prepared.board,
			previousVersion: prepared.previousVersion,
			reconciliation: needsAttention(prepared.descendants),
			codeCheck,
		});
		return;
	}
	if (codeCheck.findings.some((finding) => finding.severity === "warning")) {
		res.status(422).json({
			success: false,
			code: "HISTORICAL_CODE_MISMATCH",
			error:
				"The correction contradicts its Git revisions. Repair the code findings and preview it again.",
			codeCheck,
		});
		return;
	}
	signal.throwIfAborted();
	// Commit the exact candidate that passed the check. The commit reads the
	// version again under the lease and refuses a board that moved meanwhile.
	const result = await prepared.commit({ writer: writerOf(envelope), signal });
	announceWork(vault, result, doing, envelope);
	answerWrite(res, vault, result, envelope);
}

/**
 * Preview a historical correction without changing the board.
 * @param req The request.
 * @param res Its response.
 * @param _next The unused next handler.
 * @param signal Cancels the code reading.
 */
async function correctionPreviewRoute(
	req: Request,
	res: Response,
	_next: NextFunction,
	signal: AbortSignal,
): Promise<void> {
	await correct(req, res, false, signal);
}

/**
 * Commit a correction through the normal write boundary after reading its evidence.
 * @param req The request.
 * @param res Its response.
 * @param _next The unused next handler.
 * @param signal Cancels the evidence reading or lease wait.
 */
async function correctionRoute(
	req: Request,
	res: Response,
	_next: NextFunction,
	signal: AbortSignal,
): Promise<void> {
	await correct(req, res, true, signal);
}

/**
 * Read the historical state whose timestamp can suggest code revisions.
 * @param req The request.
 * @param res Its response.
 * @returns The selected history, or null after a refusal.
 */
function suggestionTarget(req: Request, res: Response) {
	const name = queryString(req, "board");
	const wanted = queryString(req, "variant");
	if (!name || !wanted) {
		res.status(400).json({
			success: false,
			code: "BAD_REQUEST",
			error: "Name the board and historical variant.",
		});
		return null;
	}
	if (usableBoard({ board: name }, res) === null) return null;
	return { name, wanted };
}

/**
 * Read the historical variant named by a valid suggestion request.
 * @param req The request.
 * @param res Its response.
 * @returns The selected history, or null after a refusal.
 */
function historicalSelection(req: Request, res: Response) {
	const target = suggestionTarget(req, res);
	if (target === null) return null;
	const { name, wanted } = target;
	const vault = vaultOfRequest(req);
	const read = readSemanticBoard(vault, name);
	if (!read.ok) {
		res.status(422).json({ success: false, code: read.code, error: read.problem });
		return null;
	}
	const found = addressedVariant(read.board, wanted);
	if (!found.ok) {
		res.status(422).json({ success: false, code: "UNKNOWN_VARIANT", error: found.problem });
		return null;
	}
	if (found.variant.lifecycle !== "historical") {
		res.status(422).json({
			success: false,
			code: "VARIANT_NOT_HISTORICAL",
			error: `"${found.variant.name}" is not historical. Name a historical variant to suggest its code revisions.`,
		});
		return null;
	}
	return { vault, read, found };
}

/**
 * Suggest commits from the end of the variant's recorded current interval.
 * @param req The request.
 * @param res Its response.
 * @param _next The unused next handler.
 * @param signal Cancels the Git reading.
 */
async function suggestCorrection(
	req: Request,
	res: Response,
	_next: NextFunction,
	signal: AbortSignal,
): Promise<void> {
	const selected = historicalSelection(req, res);
	if (selected === null) return;
	const { vault, read, found } = selected;
	const variant = found.variant;
	const at = read.board.adoptions?.findLast((adoption) => adoption.from === variant.id)?.at;
	if (at === undefined) {
		res.status(422).json({
			success: false,
			code: "HISTORICAL_TIME_UNKNOWN",
			error: "This variant has no recorded supersession time. State its Git commits explicitly.",
		});
		return;
	}
	const revisions = await suggestHistoricalCommits(vault, variant, at, signal);
	res.json({ success: true, board: read.board.name, variant: variant.name, at, revisions });
}

/**
 * Track the read-only suggestion request without requiring a mutation lease.
 * @param req The request.
 * @param res Its response.
 * @param next Receives unexpected failures.
 */
function correctionSuggestRoute(req: Request, res: Response, next: NextFunction): void {
	void checkoutWork
		.trackRequest(req, res, "Historical commit suggestions", (signal) =>
			suggestCorrection(req, res, next, signal),
		)
		.catch((error: unknown) => {
			setImmediate(next, error);
		});
}

export { correctionPreviewRoute, correctionRoute, correctionSuggestRoute };
