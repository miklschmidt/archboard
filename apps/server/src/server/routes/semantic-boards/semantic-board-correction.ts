import type { NextFunction, Request, Response } from "express";
import { HistoricalCorrectionInputSchema } from "@archboard/board/commands";
import { addressedVariant } from "@archboard/board/document";
import { readSemanticBoard } from "@archboard/board/store-read";
import { readSemanticBoardConfiguration } from "@archboard/board/vault-policy";
import {
	acceptedBoard,
	correctHistoricalTransition,
	writeSemanticBoard,
} from "@archboard/board/store-write";
import { checkCandidateCode, suggestHistoricalCommits } from "@archboard/code-intel/code-check-run";
import { checkoutWork } from "#server/wiring/owners/server-owners.ts";
import { queryString, vaultOfRequest } from "@archboard/workbench/host";
import {
	asCommand,
	requiredVersion,
	statedEnvelope,
} from "#server/protocol/semantic-write/semantic-write-requests.ts";
import {
	announceWork,
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
 * Read the configured vocabulary when it is valid.
 * @param vault The vault directory.
 * @returns Its policy, or null when configuration needs repair.
 */
function correctionPolicy(vault: string) {
	const policy = readSemanticBoardConfiguration(vault);
	return policy.ok ? policy.configuration : null;
}

/**
 * Build and validate the candidate without writing it.
 * @param res Its response.
 * @param stated The parsed correction.
 * @returns The candidate, or null after a refusal.
 */
function prepareCorrection(
	res: Response,
	stated: NonNullable<ReturnType<typeof statedCorrection>>,
) {
	const { vault } = stated;
	const read = readSemanticBoard(vault, stated.envelope.board);
	if (!read.ok) {
		res.status(422).json({ success: false, code: read.code, error: read.problem });
		return null;
	}
	if (read.board.version !== stated.expected) {
		res.status(409).json({
			success: false,
			code: "BOARD_VERSION_CONFLICT",
			error: "The board changed. Read it again before correcting it.",
			version: read.board.version,
		});
		return null;
	}
	const at = new Date().toISOString();
	const transition = correctHistoricalTransition(stated.input);
	const produced = transition.apply(read.board, at);
	if (!produced.ok) {
		res.status(422).json({ success: false, code: produced.code, error: produced.problem });
		return null;
	}
	const candidate = acceptedBoard(read.board, produced.board, at, correctionPolicy(vault));
	if ("problem" in candidate) {
		res.status(422).json({ success: false, code: "INVALID_BOARD", error: candidate.problem });
		return null;
	}
	const selected = addressedVariant(candidate.board, stated.input.variant);
	if (!selected.ok) throw new Error(selected.problem);
	return { read, transition, produced, candidate, selected };
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
	const prepared = prepareCorrection(res, stated);
	if (prepared === null) return;
	const { envelope, expected, input, doing, vault } = stated;
	const { read, transition, produced, candidate, selected } = prepared;
	// The code reading is checkout work, so a stopping server cancels it rather
	// than waiting for it as it waits for the write.
	const checked = await checkoutWork.track("Historical correction code check", signal, (reading) =>
		checkCandidateCode({
			vault,
			board: candidate.board,
			file: read.location.file,
			variant: selected.variant,
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
			board: candidate.board,
			previousVersion: read.board.version,
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
	// Commit the exact candidate that passed the check. The write boundary reads
	// the expected version again under the lease before it accepts this transition.
	const result = await writeSemanticBoard({
		vault,
		board: envelope.board,
		writer: writerOf(envelope),
		expectedVersion: expected,
		signal,
		transition: {
			...transition,
			/**
			 * Return the checked candidate without minting different subject identities.
			 * @returns The candidate that the code pass read.
			 */
			apply: () => ({ ...produced, board: candidate.board }),
		},
	});
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
function historicalSelection(req: Request, res: Response) {
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
	const vault = vaultOfRequest(req);
	const read = readSemanticBoard(vault, name);
	if (!read.ok) {
		res.status(422).json({ success: false, code: read.code, error: read.problem });
		return null;
	}
	const found = addressedVariant(read.board, wanted);
	if (!found.ok || found.variant.lifecycle !== "historical") {
		res.status(422).json({
			success: false,
			code: "VARIANT_NOT_HISTORICAL",
			error: "Name a historical variant to suggest its code revisions.",
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
