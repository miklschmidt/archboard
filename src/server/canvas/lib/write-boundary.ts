import type { Express, NextFunction, Request, Response } from "express";
import { boards } from "@/runtime/engine/board-store";
import { resolveInstalledBoard } from "@/runtime/engine/board-io";
import { boardKey, normalizeBoardKey, parseBoardKey } from "@/runtime/engine/board";
import { BoardRequiredError } from "@/runtime/engine/board-target";
import { holdOn, reportHold, writesBoardNote } from "@/runtime/engine/board-hold";
import {
	BoardLockCancelledError,
	claimWriterId,
	holdBoard,
	releaseHold,
	takeClaimRevocation,
} from "@/runtime/engine/board-lock";
import { checkDoing } from "@/runtime/engine/board-doing";
import {
	checkBoardVersion,
	rememberVersion,
	rememberVersionAt,
	statedVersion,
} from "@/runtime/engine/board-version";
import { announceDoing, refuseUndescribedWrite } from "@/server/canvas/lib/board-announcements";
import { answerBoardError, checkoutSnapshotFor, refusalDocument } from "@/server/canvas/lib/board-response";
import { callerGone, trackMutationWork } from "@/server/canvas/lib/mutation-work";
import {
	boardOfRequest,
	bodyOf,
	bodyString,
	isRecord,
	queryString,
	resolvedBoardWrites,
	writeContextOf,
} from "@/server/canvas/lib/request-board";

// ─── One writer at a time ─────────────────────────────────────
//
// Every request that could change a board takes the board's mutex before the
// handler runs and gives it back when the response goes out (ADR 0016,
// `src/runtime/engine/board-lock.ts`). One place, so no route assembles the steps itself
// and no route can forget to.
//
// **Deny by default.** Anything that is not a GET and names a board is a write
// unless it is listed below with the reason it is not. A route added later and
// not thought about therefore locks a board it did not need to, which costs a
// few milliseconds; the other way round costs a lost update, and would be
// invisible.
//
// Nothing between the lock and the handler awaits, so the read-modify-write
// cycle inside the handler is still one synchronous run (`board-io.ts`). What
// changes is what keeps two of them apart: express ran them one at a time, and
// now the mutex does, which is the same guarantee extended to a second process.
const NOT_A_BOARD_WRITE: Array<[RegExp, string]> = [
	[/^\/api\/boards\/hold/, "is the lock"],
	[/^\/api\/boards\/take-back$/, "is the lock, given back"],
	[/^\/api\/boards\/claim/, "is the lock, held for longer"],
	[/^\/api\/panes/, "layout, not board content, and open/close wait on the browser"],
	[/^\/api\/viewport/, "a camera move, and it waits on the browser"],
	[/^\/api\/browser\//, "a live browser operation, not board content"],
	[/^\/api\/export/, "a picture of a board, which only reads it"],
	[/^\/api\/render/, "a server-owned Board render, which only reads its snapshot"],
	[/^\/api\/selection/, "a selection is not board content"],
	[/^\/api\/library/, "one palette behind every board, and not board content"],
	[/^\/api\/snapshots/, "reads a board into a snapshot and writes no note"],
	[/^\/api\/boards\/open$/, "reads a note and points a pane at it"],
	[
		/^\/api\/boards\/new$/,
		"exclusively creates a new note rather than modifying an existing board",
	],
	[
		/^\/api\/code-targets\/open$/,
		"reads canonical board state and launches a process but writes no note",
	],
];

/** Who a request writes as. */
interface RequestWriter {
	id: string;
	kind: "human" | "agent";
}

/**
 * The client id a request carries, in its body or — for the shell's own
 * bodiless writes, Clear being a DELETE — in its query.
 * @param req The request.
 * @returns The client id, or undefined for a writer with none.
 */
function clientIdOf(req: Request): string | undefined {
	return bodyString(req, "clientId") ?? queryString(req, "clientId");
}

/**
 * Who this request writes as.
 *
 * A pane sends its client id, and that id is what makes the lock reentrant: the
 * hold taken for a user edit covers the change report that edit produces 400 ms
 * later. An agent sends none, so it gets a fresh identity per request and takes
 * and releases the board around that one write — which is the per-write mutex.
 *
 * Unless this canvas holds a claim on the board, in which case an agent's write
 * is* the claim's, and that is the whole of how a claim survives across
 * requests (ADR 0016, TASK-080). Nothing is threaded through the caller: a CLI
 * agent is a fresh process every command and has nowhere to keep an id, so the
 * canvas keeps it, against the board every call already names. The write joins
 * the claim's hold rather than taking one, so twenty writes leave no gap.
 *
 * A write with a pane behind it is that person's, and a person is not made to
 * narrate their own act (TASK-095).
 * @param req The request.
 * @param board The board it writes.
 * @returns The writer's id and kind.
 */
function holderFromRequest(req: Request, board: string): RequestWriter {
	const clientId = clientIdOf(req);
	const kind = bodyOf(req)["origin"] === "agent" || clientId === undefined ? "agent" : "human";
	if (kind === "agent") {
		const claimed = claimWriterId(board);
		if (claimed) {
			return { id: claimed, kind };
		}
	}
	const id = clientId ? clientId : `agent-${Math.random().toString(36).slice(2, 10)}`;
	return { id, kind };
}

/**
 * The board was claimed and a person took it back, and this is the agent
 * finding out.
 *
 * The one place it is said, because the agent has to hear it whatever it does
 * next: writing, or claiming again. Told once — `takeClaimRevocation` clears as
 * it reads — so an agent that has understood can carry on, and the board is not
 * left wedged against the agent that used to hold it.
 *
 * Nothing is rolled back. Every write made under the claim is in the note,
 * because that is what it means for the note to be the board, so the answer
 * says what state the board was left in rather than pretending it can be
 * undone.
 * @param res The response the refusal goes out on.
 * @param board The board the agent lost.
 * @returns True when a revocation was pending and has now been answered.
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
			" has ended. Everything you had already written is in the note and nothing was undone, so the board is " +
			"part way through whatever you were doing — say what state you left it in rather than carrying on. " +
			"Writing again is an ordinary write, and takes the board only for as long as that write.",
		board,
		claim: lost.claim,
		revokedBy: lost.by,
		...refusalDocument(board, checkoutSnapshotFor(res)),
	});
	return true;
}

/**
 * The board a request names, as a canonical key, or null when it names none
 * or names one malformed. The handler refuses better than the boundary can:
 * it knows the operation's name.
 * @param req The request.
 * @returns The key, or null.
 */
function writeKeyOf(req: Request): string | null {
	try {
		const asked = boardOfRequest(req);
		if (!asked) {
			throw new BoardRequiredError([], "A write");
		}
		return boardKey(parseBoardKey(asked));
	} catch {
		return null;
	}
}

/**
 * Whether a request is a board write the boundary must guard: a non-read
 * under `/api/` that is not listed as something other than a write.
 * @param req The request.
 * @returns True for a board write.
 */
function isBoardWrite(req: Request): boolean {
	if (req.method === "GET" || req.method === "HEAD" || !req.path.startsWith("/api/")) {
		return false;
	}
	// A route that is not a board write writes no note, so there is no version
	// for a precondition to be about either.
	return !NOT_A_BOARD_WRITE.some(([pattern]) => pattern.test(req.path));
}

/**
 * Once the write has landed, remember what this agent was told the board is,
 * which is what its next write is checked against (TASK-091). On `finish` and
 * only on success, beside the `doing` announcement and for the same reason.
 * The three write-boundary refusals carry their own current document and version.
 * @param res The response.
 * @param key The board.
 * @param writer Who wrote.
 */
function rememberTold(res: Response, key: string, writer: RequestWriter): void {
	res.on("finish", () => {
		if (res.statusCode >= 400 || writer.kind !== "agent" || claimWriterId(key) !== writer.id) {
			return;
		}
		const context = writeContextOf(res);
		if (context.writtenVersion !== undefined) {
			rememberVersion(writer.id, context.writtenVersion);
		} else {
			rememberVersionAt(writer.id, boards.get(key)?.file);
		}
	});
}

/**
 * Say what the agent was doing as the write lands, not before it: a refusal
 * narrates nothing, and a pane that showed intended writes as completed writes
 * would be inaccurate.
 * @param res The response.
 * @param key The board.
 * @param writer Who wrote.
 * @param doing What they said they were doing.
 */
function announceOnFinish(res: Response, key: string, writer: RequestWriter, doing: string): void {
	res.on("finish", () => {
		if (res.statusCode >= 400) {
			return;
		}
		announceDoing(key, {
			doing,
			at: new Date().toISOString(),
			by: writer.id,
			kind: writer.kind,
			claimed: claimWriterId(key) === writer.id,
		});
	});
}

/**
 * Release a hold this request created exactly once, on whichever of finish
 * and close comes first. Both, because a client that hangs up mid-write never
 * finishes the response, and a board held by a request nobody is listening to
 * is a board held until the lease lapses.
 * @param res The response.
 * @param key The board.
 * @param holderId The holder to release.
 */
function giveBackOnResponseEnd(res: Response, key: string, holderId: string): void {
	let given = false;
	/** Release the hold, the first time only. */
	const give = (): void => {
		if (given) {
			return;
		}
		given = true;
		releaseHold(key, holderId);
	};
	res.on("finish", give);
	res.on("close", give);
}

/** What the boundary established before the lock, for the under-lock step. */
interface GuardedWrite {
	key: string;
	writer: RequestWriter;
	expected: number | undefined;
}

/**
 * Take the board and check the write's version under the lock, then hand the
 * request to its handler. Under the lock, so no other archboard writer can land
 * between the version being read and the note being written; before `next()`,
 * so a refusal writes nothing (TASK-091). On refusal the board is given straight
 * back: the handlers that would do that on `finish` are registered only once
 * the request goes through, and a request that never reaches the handler never
 * took the board for any longer than this.
 * @param req The request.
 * @param res Its response.
 * @param next The next middleware.
 * @param guarded What the boundary established before the lock.
 * @param signal The mutation lease's abort signal.
 */
async function takeBoardAndContinue(
	req: Request,
	res: Response,
	next: NextFunction,
	guarded: GuardedWrite,
	signal: AbortSignal,
): Promise<void> {
	const { key, writer, expected } = guarded;
	const hold = await holdBoard({ board: key, holder: writer, signal });
	const context = writeContextOf(res);
	context.lockKey = key;
	context.lockToken = hold.leaseToken;
	context.lockHolder = hold.holder;
	/** Give the board back when this request created the hold. */
	const giveBackNow = (): void => {
		if (hold.created) {
			releaseHold(key, hold.holder.id);
		}
	};
	try {
		resolvedBoardWrites.set(
			req,
			resolveInstalledBoard(key, "A write", {
				write: true,
				...(hold.predecessorHash === undefined
					? {}
					: { trustedPredecessorHash: hold.predecessorHash }),
			}),
		);
	} catch (error) {
		giveBackNow();
		answerBoardError(res, error);
		return;
	}
	const rememberedBy =
		writer.kind === "agent" && claimWriterId(key) === writer.id ? writer.id : undefined;
	const file = resolvedBoardWrites.get(req)?.board.file;
	const conflict = checkBoardVersion({
		board: key,
		...(file === undefined ? {} : { file }),
		writesNote: writesBoardNote(key),
		...(expected === undefined ? {} : { stated: expected }),
		...(rememberedBy === undefined ? {} : { rememberedBy }),
	});
	if (conflict) {
		res.status(409).json({
			success: false,
			code: "BOARD_VERSION_CONFLICT",
			error: conflict.message,
			versionConflict: conflict,
			...refusalDocument(key, checkoutSnapshotFor(res)),
		});
		giveBackNow();
		return;
	}
	if (hold.created) {
		giveBackOnResponseEnd(res, key, hold.holder.id);
	}
	next();
}

/**
 * The write boundary itself: identify the writer, refuse a revoked claim, a
 * malformed precondition or an undescribed agent write, then take the board.
 * @param req The request.
 * @param res Its response.
 * @param next The next middleware.
 */
function guardBoardWrite(req: Request, res: Response, next: NextFunction): void {
	const key = writeKeyOf(req);
	if (key === null) {
		return next();
	}
	// An agent whose claim was taken back hears about it here, before anything is
	// written, because "you no longer have this board" is the answer to the write
	// rather than a note attached to a write that went through.
	const writer = holderFromRequest(req, key);
	writeContextOf(res).writerKind = writer.kind;
	if (writer.kind === "agent" && refuseRevokedClaim(res, key)) {
		return;
	}
	// Which version this write says it is against (TASK-091). One that is not a
	// number is refused before the board is taken: it is a malformed request
	// rather than a conflict, and nothing should wait on a lock to be told so.
	// What the canvas remembers telling this writer is read later, under the
	// lock, because that half can move while a write waits for the board.
	const stated = statedVersion(req.query["expectVersion"], writer.kind);
	if (!stated.ok) {
		res
			.status(400)
			.json({ success: false, code: "BAD_EXPECTED_VERSION", error: stated.problem, board: key });
		return;
	}
	rememberTold(res, key, writer);
	// And an agent says what it is doing, on this write, before it takes the
	// board. Same boundary as the lock and for the same reason: this is the one
	// place that knows a request is a board write, so a route added later cannot
	// be the one that got away with saying nothing.
	if (writer.kind === "agent") {
		const check = checkDoing(req.query["doing"]);
		if (!check.ok) {
			return refuseUndescribedWrite(res, key, req.path, check.problem);
		}
		announceOnFinish(res, key, writer, check.doing);
	}
	const guarded: GuardedWrite = { key, writer, expected: stated.expected };
	void trackMutationWork(req, `${req.method} ${req.path} board-lock wait`, (signal) =>
		takeBoardAndContinue(req, res, next, guarded, signal),
	).catch((error) => {
		if (error instanceof BoardLockCancelledError && callerGone(req, res)) {
			return;
		}
		answerBoardError(res, error);
	});
}

/**
 * Mount the write boundary (ADR 0016) so that every board write takes the
 * board's mutex before its handler runs.
 * @param app The application to mount on.
 */
function mountWriteBoundary(app: Express): void {
	app.use((req: Request, res: Response, next: NextFunction) => {
		if (!isBoardWrite(req)) {
			return next();
		}
		guardBoardWrite(req, res, next);
	});
}

/**
 * Mount the middleware that makes a board that has stopped saving say so in
 * every answer about it.
 *
 * One line rather than a line in each of thirty routes, because the point of a
 * held board is that nobody working on it can fail to notice (TASK-079). An
 * agent that never sees the refusal — a different process, a different turn —
 * still gets the hold, the three outcomes and how much is riding on them
 * attached to the next thing it reads or draws. Refusals carry it too: a 409
 * is exactly when it is worth saying.
 *
 * It is put on the response rather than fetched by the caller so that adding a
 * route cannot forget it.
 * @param app The application to mount on.
 */
function mountHeldBoardReport(app: Express): void {
	app.use((req: Request, res: Response, next: NextFunction) => {
		const asked = boardOfRequest(req) ?? "";
		if (!asked.trim()) {
			return next();
		}
		const key = normalizeBoardKey(asked);
		const send = res.json.bind(res);
		/**
		 * Answer with the hold attached whenever the board is held and the body can carry it.
		 * @param body The answer.
		 * @returns The response, as `res.json` returns it.
		 */
		res.json = (body: unknown) => {
			const hold = holdOn(key);
			return send(hold && isRecord(body) ? { ...body, held: reportHold(key, hold) } : body);
		};
		next();
	});
}

export { holderFromRequest, mountHeldBoardReport, mountWriteBoundary, refuseRevokedClaim };
