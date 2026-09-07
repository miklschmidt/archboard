import type { Express, Request, Response } from "express";
import { boards } from "@/runtime/engine/board-store";
import { resolveBoard } from "@/runtime/engine/board-io";
import {
	BoardLockCancelledError,
	boardLockState,
	claimBoard,
	holdBoard,
	releaseClaim,
	releaseHold,
} from "@/runtime/engine/board-lock";
import { rememberVersionAt, versionOfNoteAt } from "@/runtime/engine/board-version";
import { answerBoardError } from "@/server/canvas/lib/board-response";
import { callerGone, trackMutationWork } from "@/server/canvas/lib/mutation-work";
import { boardOfRequest, bodyOf, bodyString } from "@/server/canvas/lib/request-board";
import { refuseRevokedClaim } from "@/server/canvas/lib/write-boundary";

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
	answerBoardError(res, error);
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
 * A person has started changing this board, and wants it.
 *
 * The message the pane sends on the leading edge of a content edit. The first
 * progress report is due after REPORT_PROGRESS_MS even during a continuous
 * gesture, and renewal every LOCK_RENEW_MS keeps the lease alive while content
 * remains pending.
 *
 * It does not wait. A person is refused on the spot when anybody else holds
 * the board (TASK-153): the lock's bounded wait exists for an agent behind a
 * person's gesture, and a person cannot be made to wait to find out whether
 * their edit was accepted. The refusal names the holder, and the pane
 * withdraws the optimistic edit and reconciles to the note (ADR 0022).
 *
 * It never takes a claimed board back (ADR 0022). Under a claim the answer is
 * the refusal, naming the agent that has it, and the pane withdraws the
 * optimistic edit and stays read-only until the claim ends or the person asks
 * for the board through `/api/boards/take-back`.
 * @param req The request.
 * @param res Its response.
 */
function holdRoute(req: Request, res: Response): void {
	try {
		const { key } = resolveBoard(boardOfRequest(req), "Holding a board");
		const clientId = requiredClientId(
			req,
			res,
			"A hold needs a clientId: the lock is reentrant by holder, and an unnamed holder cannot be renewed or released.",
		);
		if (clientId === null) {
			return;
		}
		const reason = bodyString(req, "reason");
		const holder = { id: clientId, kind: "human" as const, ...(reason ? { reason } : {}) };
		void trackMutationWork(req, `${req.method} ${req.path} board-lock wait`, (signal) =>
			holdBoard({ board: key, holder, signal }),
		)
			.then((hold) =>
				res.json({ success: true, board: key, holder: hold.holder, created: hold.created }),
			)
			.catch((error) => answerLockError(req, res, error));
	} catch (error) {
		answerBoardError(res, error);
	}
}

/**
 * They have stopped, the change has been written, and the board can go.
 *
 * A person's hold covers one edit and not a session (ADR 0016): holding it for as
 * long as a board is on screen would block every agent for as long as anybody
 * has the board open. The pane sends this once its report has landed and
 * nothing new has arrived since.
 *
 * Idempotent, and it releases nothing that is not this holder's. A pane that
 * dies without sending it costs one lease.
 * @param req The request.
 * @param res Its response.
 */
function holdReleaseRoute(req: Request, res: Response): void {
	try {
		const { key } = resolveBoard(boardOfRequest(req), "Releasing a board");
		const clientId = requiredClientId(req, res, "A release needs the clientId that took the hold.");
		if (clientId === null) {
			return;
		}
		res.json({ success: true, board: key, released: releaseHold(key, clientId) });
	} catch (error) {
		answerBoardError(res, error);
	}
}

/**
 * The person wants a claimed board back (ADR 0022).
 *
 * The one control that ends an agent's claim. A content gesture never does:
 * a claimed board is read-only to people, and taking it back is something
 * they ask for by name. The lease is taken with the claim revoked and given
 * straight back, so the board goes to nobody and the next gesture holds it as
 * any gesture does. Nothing already written is undone; the agent hears once,
 * on its next write or re-claim, that it lost the board (ADR 0016).
 *
 * Like the hold, it does not wait: a claim is revoked at once, and an
 * unclaimed writer holding the board at that instant is refused by name so
 * the person can ask again (TASK-153).
 * @param req The request.
 * @param res Its response.
 */
function takeBackRoute(req: Request, res: Response): void {
	try {
		const { key } = resolveBoard(boardOfRequest(req), "Taking a board back");
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
	} catch (error) {
		answerBoardError(res, error);
	}
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
	const file = boards.get(key)?.file;
	const version = created
		? rememberVersionAt(claim.holder.id, file)
		: file
			? versionOfNoteAt(file)
			: null;
	return { success: true, board: key, claim, created, version };
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
 *
 * It waits for a person mid-edit like any other writer, and it is refused if
 * they are still there. A claim is not a way past the human at the canvas.
 * @param req The request.
 * @param res Its response.
 */
function claimRoute(req: Request, res: Response): void {
	try {
		const { key } = resolveBoard(boardOfRequest(req), "Claiming a board");
		const reason = bodyString(req, "reason")?.trim();
		if (!reason) {
			res.status(400).json({
				success: false,
				error:
					"A claim needs a reason: it is what the pane shows the person whose board you have taken. " +
					"Without it the pane has stopped accepting edits for no reason they can see.",
			});
			return;
		}
		// An agent that lost the board hears that before it is given another one,
		// or it would claim its way straight back onto a board somebody just took.
		if (refuseRevokedClaim(res, key)) {
			return;
		}
		const forMs = claimDuration(bodyOf(req)["forMs"]);
		void trackMutationWork(req, `${req.method} ${req.path} claim wait`, (signal) =>
			takeClaim(key, reason, forMs, signal),
		)
			.then((answer) => res.json(answer))
			.catch((error) => answerLockError(req, res, error));
	} catch (error) {
		answerBoardError(res, error);
	}
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
	try {
		const { key } = resolveBoard(boardOfRequest(req), "Releasing a claim");
		const claim = releaseClaim(key);
		res.json({ success: true, board: key, released: claim !== null, claim });
	} catch (error) {
		answerBoardError(res, error);
	}
}

/**
 * Mount the lock routes: a person's hold and release, the take-back, and an
 * agent's claim and release.
 * @param app The application to mount on.
 */
function mountLockRoutes(app: Express): void {
	app.post("/api/boards/hold", holdRoute);
	app.post("/api/boards/hold/release", holdReleaseRoute);
	app.post("/api/boards/take-back", takeBackRoute);
	app.post("/api/boards/claim", claimRoute);
	app.post("/api/boards/claim/release", claimReleaseRoute);
}

export { mountLockRoutes };
