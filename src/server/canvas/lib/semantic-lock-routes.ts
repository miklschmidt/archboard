// The board's mutex from the outside: an agent's claim, its release, and the
// one control a person has over a claim that is standing (ADR 0016, ADR 0022).
//
// There is no human hold here any more. A person does not author a semantic
// board — they read one an agent wrote (ADR 0023) — so the only thing a pane
// ever asks of the lock is that somebody else's claim be given back.

import type { Express, Request, Response } from "express";
import { errorMessage } from "@/shared/thrown-error/index";
import {
	BoardLockCancelledError,
	boardLockState,
	claimBoard,
	holdBoard,
	releaseClaim,
	releaseHold,
	takeClaimRevocation,
} from "@/runtime/engine/board-lock";
import { readSemanticBoard, semanticBoardAddress } from "@/runtime/semantic-board-store/index";
import { callerGone, trackMutationWork } from "@/server/canvas/lib/mutation-work";
import { boardOfRequest, bodyOf, bodyString } from "@/server/canvas/lib/request-board";
import { aggregateOf } from "@/server/canvas/lib/pane-registry";

/**
 * Answer a lock failure, unless the caller has already gone after cancelling
 * its own wait.
 * @param req The request.
 * @param res Its response.
 * @param error The failure.
 */
function answerLockError(req: Request, res: Response, error: unknown): void {
	if (error instanceof BoardLockCancelledError && callerGone(req, res)) {
		return;
	}
	res.status(409).json({ success: false, error: errorMessage(error) });
}

/**
 * An agent that lost the board hears so once, before anything else it asks
 * for is answered (ADR 0022). Without this it would claim its way straight
 * back onto a board somebody had just taken from it.
 * @param res The response.
 * @param board The board key.
 * @returns True once the refusal has been sent.
 */
function refuseRevokedClaim(res: Response, board: string): boolean {
	const lost = takeClaimRevocation(board);
	if (!lost) {
		return false;
	}
	const who = lost.by?.kind === "human" ? "The person at the canvas" : "Somebody";
	const reason = lost.claim.holder.reason ? ` (${lost.claim.holder.reason})` : "";
	res.status(409).json({
		success: false,
		code: "CLAIM_REVOKED",
		error:
			`${who} took "${board}" back, so your claim${reason}` +
			" has ended. Everything you had already written is on the board and nothing was undone, so it is " +
			"part way through whatever you were doing — say what state you left it in rather than carrying on. " +
			"Writing again is an ordinary write, and takes the board only for as long as that write.",
		board,
		claim: lost.claim,
		revokedBy: lost.by,
	});
	return true;
}

/**
 * Which board a lock request is about, in the vault's own spelling.
 *
 * A claim is a claim on a name, not on a file: it is the thing that says "for
 * the next ten minutes, writes to this board are mine". A board that does not
 * exist is refused here rather than being claimed into existence.
 * @param req The request.
 * @param res Its response.
 * @param what What the caller is doing, for the refusal.
 * @returns The canonical key, or null once the refusal has been sent.
 */
function lockableKey(req: Request, res: Response, what: string): string | null {
	const asked = boardOfRequest(req);
	if (asked === undefined || asked.trim() === "") {
		res.status(400).json({
			success: false,
			error: `${what} needs a board: pass --board <name>, or ?board=<name>.`,
		});
		return null;
	}
	// A pane asks with the address it is showing, variant and all, and a claim
	// is a claim on the whole family: every variant is in the one document, so
	// there is one lease for it and taking a board back means taking back the
	// document somebody is holding. Reading the pane's address as a board name
	// would refuse a pane that happens to be on a proposal.
	const board = aggregateOf(asked) ?? asked;
	if (!readSemanticBoard(board).ok) {
		res.status(404).json({
			success: false,
			code: "BOARD_MISSING",
			error: `${what} names "${board}", and the vault holds no such board.`,
		});
		return null;
	}
	return semanticBoardAddress(board).key;
}

/**
 * The client id a lock request must carry, or the refusal when it does not.
 * @param req The request.
 * @param res Its response.
 * @param refusal Why a client id is needed here.
 * @returns The client id, or null once the refusal has been sent.
 */
function requiredClientId(req: Request, res: Response, refusal: string): string | null {
	const clientId = bodyString(req, "clientId");
	if (clientId === undefined || clientId === "") {
		res.status(400).json({ success: false, error: refusal });
		return null;
	}
	return clientId;
}

/**
 * The person wants a claimed board back (ADR 0022).
 *
 * The one control that ends an agent's claim. The lease is taken with the
 * claim revoked and given straight back, so the board goes to nobody and the
 * next write takes it as any write does. Nothing already written is undone;
 * the agent hears once, on its next write or re-claim, that it lost the board.
 *
 * It does not wait: a claim is revoked at once, and an unclaimed writer
 * holding the board at that instant is refused by name so the person can ask
 * again (TASK-153).
 * @param req The request.
 * @param res Its response.
 */
function takeBackRoute(req: Request, res: Response): void {
	const key = lockableKey(req, res, "Taking a board back");
	if (key === null) {
		return;
	}
	const clientId = requiredClientId(
		req,
		res,
		"Taking a board back needs the clientId of the pane asking for it.",
	);
	if (clientId === null) {
		return;
	}
	const holder = { id: clientId, kind: "human" as const };
	const standing = boardLockState(key);
	const claim = standing?.kind === "agent" && standing.claimed ? standing : null;
	void trackMutationWork(req, `${req.method} ${req.path} board-lock wait`, (signal) =>
		holdBoard({ board: key, holder, revokeClaim: true, signal }),
	)
		.then((hold) => {
			if (hold.created) {
				releaseHold(key, hold.holder.id);
			}
			return res.json({
				success: true,
				board: key,
				released: claim !== null,
				...(claim ? { claim } : {}),
			});
		})
		.catch((error) => answerLockError(req, res, error));
}

/**
 * Take a claim and answer with the version the agent has now been told, so
 * the record of what it has seen starts with the board it just took (TASK-091).
 * Without the seed the first write under a claim would be the one write
 * nothing checked, and the rest of the claimed work may depend on it.
 * @param key The board.
 * @param reason What the claim is for.
 * @param forMs How long the agent asked for, if it said.
 * @param signal The mutation lease's abort signal.
 * @returns The answer body.
 */
async function takeClaim(
	key: string,
	reason: string,
	forMs: number | undefined,
	signal: AbortSignal,
): Promise<Record<string, unknown>> {
	const { claim, created } = await claimBoard({
		board: key,
		reason,
		...(forMs === undefined ? {} : { forMs }),
		signal,
	});
	const read = readSemanticBoard(key);
	return {
		success: true,
		board: key,
		claim,
		created,
		// The version the claim was told about: an agent that has just claimed a
		// board is about to write to it, and this is what its first write states.
		version: read.ok ? read.board.version : null,
	};
}

/**
 * How long a claim asked for, when it asked for a usable length.
 * @param asked The `forMs` body field.
 * @returns The duration, or undefined when the claim named none.
 */
function claimDuration(asked: unknown): number | undefined {
	return typeof asked === "number" && Number.isFinite(asked) ? asked : undefined;
}

/**
 * An agent is about to redraw this board and wants it until it says otherwise.
 *
 * The per-write lock fits most of what an agent does. It does not fit twenty
 * writes that only make sense together: taking and releasing the board twenty
 * times leaves nineteen gaps for somebody else to write into, and the board is
 * never in one consistent state while it is being built (ADR 0016).
 *
 * Claiming again extends: the same claim, a later deadline, and a reason that
 * can be brought up to date with what the agent is now doing. A write does not
 * extend it, because the expiry exists to bound a working agent and would bound
 * nothing if the work moved it.
 * @param req The request.
 * @param res Its response.
 */
function claimRoute(req: Request, res: Response): void {
	const key = lockableKey(req, res, "Claiming a board");
	if (key === null) {
		return;
	}
	const reason = bodyString(req, "reason")?.trim();
	if (!reason) {
		res.status(400).json({
			success: false,
			error:
				"A claim needs a reason: it is what the pane shows the person whose board you have taken. " +
				"Without it the pane has said the board is claimed for no reason they can see.",
		});
		return;
	}
	if (refuseRevokedClaim(res, key)) {
		return;
	}
	const forMs = claimDuration(bodyOf(req)["forMs"]);
	void trackMutationWork(req, `${req.method} ${req.path} claim wait`, (signal) =>
		takeClaim(key, reason, forMs, signal),
	)
		.then((answer) => res.json(answer))
		.catch((error) => answerLockError(req, res, error));
}

/**
 * The agent is done, and the board goes back to being taken one write at a
 * time.
 *
 * Idempotent: releasing a claim that has expired, or that somebody took back,
 * answers `released: false` rather than failing. An agent tidying up after
 * losing the board is doing the right thing a moment late.
 * @param req The request.
 * @param res Its response.
 */
function claimReleaseRoute(req: Request, res: Response): void {
	const key = lockableKey(req, res, "Releasing a claim");
	if (key === null) {
		return;
	}
	const claim = releaseClaim(key);
	res.json({ success: true, board: key, released: claim !== null, claim });
}

/**
 * Mount the lock routes: an agent's claim and release, and the take-back.
 * @param app The application to mount on.
 */
function mountSemanticLockRoutes(app: Express): void {
	app.post("/api/semantic-boards/take-back", takeBackRoute);
	app.post("/api/semantic-boards/claim", claimRoute);
	app.post("/api/semantic-boards/claim/release", claimReleaseRoute);
}

export { mountSemanticLockRoutes, refuseRevokedClaim };
