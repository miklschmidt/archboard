import fs from "node:fs";
import path from "node:path";

import {
	LOCK_LEASE_MS,
	LOCK_POLL_MS,
	LOCK_STEAL_GUARD_MS,
	LOCK_WAIT_CAP_MS,
} from "@/shared/timing/timing";
import { normalizeBoardKey } from "@/runtime/engine/board";
import { noteClaimRevoked, processClaims } from "@/runtime/engine/lib/board-lock-claim-state";
import {
	BoardHeldError,
	processName,
	type HolderKind,
	type LockHold,
	type LockRecord,
	type LockRequest,
} from "@/runtime/engine/lib/board-lock-contracts";
import { isRecord, stringAt } from "@/runtime/engine/lib/unknown-record";
import {
	announceHeld,
	holderOf,
	liveRecord,
	lockPathFor,
	newToken,
	readRecord,
	releaseHold,
	stamp,
	takeHandoff,
	writeRecord,
} from "@/runtime/engine/lib/board-lock-state";

class BoardLockCancelledError extends Error {
	readonly code = "BOARD_LOCK_CANCELLED";

	/**
	 * A wait given up because the request that was waiting went away.
	 * @param board The board key.
	 */
	constructor(readonly board: string) {
		super(`Waiting to write "${board}" was canceled because the request disconnected.`);
		this.name = "BoardLockCancelledError";
	}
}

/**
 * Whether a failed exclusive create failed because somebody else got there
 * first, which is a race to re-read rather than a fault.
 * @param error The thrown value.
 * @returns True when the file already existed.
 */
function isAlreadyThere(error: unknown): boolean {
	return isRecord(error) && stringAt(error, "code") === "EEXIST";
}

/** Who is asking for the board, and whether they are claiming it. */
type Asker = { id: string; kind: HolderKind; reason?: string; claimed?: boolean };

/**
 * The lease this holder already has, renewed. `since` is preserved, so a
 * refusal describes when the hold began rather than its latest heartbeat.
 * @param live The lease as it stands.
 * @param who Who is renewing.
 * @param leaseMs How much longer to hold it.
 * @returns The renewed lease.
 */
function renewedRecord(live: LockRecord, who: Asker, leaseMs: number): LockRecord {
	return {
		...live,
		kind: who.kind,
		until: stamp(Date.now() + leaseMs),
		...(who.reason !== undefined ? { reason: who.reason } : {}),
		...(who.claimed ? { claimed: true } : {}),
	};
}

/**
 * A new lease for this asker.
 * @param who Who is taking the board.
 * @param leaseMs How long to hold it.
 * @returns The lease.
 */
function freshRecord(who: Asker, leaseMs: number): LockRecord {
	return {
		id: who.id,
		kind: who.kind,
		since: stamp(Date.now()),
		until: stamp(Date.now() + leaseMs),
		process: processName(),
		...(who.reason !== undefined ? { reason: who.reason } : {}),
		...(who.claimed ? { claimed: true } : {}),
		token: newToken(),
	};
}

/**
 * Whether this attempt is a person taking a standing claim back, which is the
 * one case that displaces a live lease (ADR 0022).
 * @param live The lease as it stands.
 * @param who Who is asking.
 * @param revoke Whether the person asked to take it back.
 * @returns True when the live lease may be displaced.
 */
function isTakingBack(live: LockRecord, who: Asker, revoke: boolean): boolean {
	return revoke && who.kind === "human" && Boolean(live.claimed) && live.id !== who.id;
}

/**
 * Take a lease file that is actually absent, atomically.
 *
 * If another process wins between the read and the create, its record is
 * re-read: a live winner is the blocker, while a lapsed or malformed result
 * falls through to the contested steal below.
 * @param file The lease file's path.
 * @param record The lease to write.
 * @param board The board key.
 * @param endsClaimHere Ends a standing claim this acquisition displaced.
 * @returns The settled attempt, or null when the contested path must decide.
 * @throws {Error} When the create fails for any reason but the file existing.
 */
function createExclusively(
	file: string,
	record: LockRecord,
	board: string,
	endsClaimHere: (taker: LockRecord) => void,
): Attempt | null {
	fs.mkdirSync(path.dirname(file), { recursive: true });
	try {
		const handle = fs.openSync(file, "wx");
		try {
			fs.writeFileSync(handle, JSON.stringify(record));
		} finally {
			fs.closeSync(handle);
		}
		endsClaimHere(record);
		announceHeld(board, holderOf(record));
		return { ok: true, record, created: true };
	} catch (error) {
		if (!isAlreadyThere(error)) {
			throw error;
		}
	}
	const raced = liveRecord(readRecord(file));
	if (!raced) {
		return null;
	}
	announceHeld(board, holderOf(raced));
	return { ok: false, record: raced };
}

/** What one attempt is asking for. */
interface AttemptContext {
	board: string;
	file: string;
	who: Asker;
	leaseMs: number;
	revoke: boolean;
}

/**
 * What a live lease decides: the same holder renews it, and anybody else is
 * refused unless this is a person taking a standing claim back.
 * @param live The live lease.
 * @param context What this attempt is asking for.
 * @param endsClaimHere Ends a standing claim this acquisition displaced.
 * @returns The settled attempt, or null when the lease may be displaced.
 */
function decideAgainstLive(
	live: LockRecord,
	context: AttemptContext,
	endsClaimHere: (taker: LockRecord) => void,
): Attempt | null {
	const { board, file, who, leaseMs, revoke } = context;
	if (live.id === who.id) {
		// Reentrant renewal preserves `since`, so refusals describe when the holder
		// began rather than its latest heartbeat. Joining is not creating: callers
		// must not release the surrounding human gesture or claim.
		const renewed = renewedRecord(live, who, leaseMs);
		writeRecord(file, renewed);
		endsClaimHere(renewed);
		announceHeld(board, holderOf(renewed));
		return { ok: true, record: renewed, created: false };
	}
	if (isTakingBack(live, who, revoke)) {
		return null;
	}
	announceHeld(board, holderOf(live));
	return { ok: false, record: live };
}

// One attempt either proves this acquisition, names the live blocker, or says
// the file moved underneath the read. The outer bounded loop owns retry policy.
type Attempt =
	| { ok: true; record: LockRecord; created: boolean }
	| { ok: false; record: LockRecord | null };

/**
 * Wait, without a signal to wait on.
 * @param ms How long.
 * @returns When the time is up.
 */
function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => {
		setTimeout(resolve, ms);
	});
}

/**
 * Wait one poll interval before looking at the lease again.
 *
 * Waiting is filesystem polling because another process has no signal it can
 * send here. Abort removes both the timer and the listener, so a disconnected
 * request does not consume application shutdown time.
 * @param board The board key, for the message a cancelled wait carries.
 * @param ms How long to wait.
 * @param signal Cancels the wait when the request goes away.
 * @returns When the interval is up.
 * @throws {BoardLockCancelledError} When the request goes away first.
 */
function waitForLockPoll(board: string, ms: number, signal?: AbortSignal): Promise<void> {
	if (signal?.aborted) {
		return Promise.reject(new BoardLockCancelledError(board));
	}
	return new Promise((resolve, reject) => {
		let timer: ReturnType<typeof setTimeout> | null = null;
		/**
		 * End the wait once, either way, dropping the timer and the listener.
		 * @param cancelled Whether the request went away rather than the time being up.
		 */
		const settle = (cancelled: boolean): void => {
			if (timer === null) {
				return;
			}
			clearTimeout(timer);
			timer = null;
			signal?.removeEventListener("abort", onAbort);
			if (cancelled) {
				reject(new BoardLockCancelledError(board));
			} else {
				resolve();
			}
		};
		/**
		 * End the wait because the request went away.
		 */
		const onAbort = (): void => {
			settle(true);
		};
		timer = setTimeout(() => {
			settle(false);
		}, ms);
		signal?.addEventListener("abort", onAbort, { once: true });
		if (signal?.aborted) {
			settle(true);
		}
	});
}

/**
 * One try at taking the board.
 *
 * Three ordinary states: the same holder renews; a live rival refuses; absent
 * or lapsed state is acquired. A person's explicit take-back of a claim (ADR
 * 0022) follows the contested lapsed path; a short write is never revoked,
 * and an ordinary human hold is refused by a claim like any other rival.
 * @param board The board key, already normalized.
 * @param who Who is asking, and whether they are claiming it.
 * @param leaseMs How long the lease runs for.
 * @param revoke Whether a person is taking a standing claim back.
 * @returns This acquisition, or the live blocker that refused it.
 * @throws {Error} When the lease file cannot be written.
 */
async function attempt(
	board: string,
	who: Asker,
	leaseMs: number,
	revoke: boolean,
): Promise<Attempt> {
	const file = lockPathFor(board);
	const current = readRecord(file);
	const live = liveRecord(current);
	/**
	 * End a standing claim this take-back displaced.
	 *
	 * A process claim can outlive a momentarily lapsed or deleted lease, so it
	 * is ended only after this taker's acquisition is proven — including a
	 * reentrant human lease that was already present when take-back was asked
	 * for.
	 * @param taker The acquisition that has just been proven.
	 */
	const endsClaimHere = (taker: LockRecord): void => {
		const claimHere = revoke && who.kind === "human" ? processClaims.get(board) : undefined;
		if (claimHere && claimHere.holder.id !== who.id) {
			noteClaimRevoked(board, claimHere.holder, holderOf(taker));
		}
	};

	if (live) {
		const decided = decideAgainstLive(live, { board, file, who, leaseMs, revoke }, endsClaimHere);
		if (decided) {
			return decided;
		}
	}

	const record = freshRecord(who, leaseMs);
	if (!current) {
		const settled = createExclusively(file, record, board, endsClaimHere);
		if (settled) {
			return settled;
		}
	}

	return stealContested(file, record, board, endsClaimHere);
}

/**
 * Take a lease another writer has let lapse.
 *
 * Rename takeover is not settled by the write: two processes can both see an
 * expired lease and both rename. Both pay the steal guard, and then only the
 * one whose token remains in the file believes it owns the board. The
 * ordinary absent and live-holder paths never pay this delay.
 * @param file The lease file's path.
 * @param record The lease to write.
 * @param board The board key.
 * @param endsClaimHere Ends a standing claim this acquisition displaced.
 * @returns This acquisition, or the writer that won the steal.
 */
async function stealContested(
	file: string,
	record: LockRecord,
	board: string,
	endsClaimHere: (taker: LockRecord) => void,
): Promise<Attempt> {
	writeRecord(file, record);
	await sleep(LOCK_STEAL_GUARD_MS);
	const settled = readRecord(file);
	if (settled?.token !== record.token) {
		return { ok: false, record: liveRecord(settled) };
	}
	endsClaimHere(record);
	announceHeld(board, holderOf(record));
	return { ok: true, record, created: true };
}

/**
 * Take the board, waiting for it where waiting is the right answer.
 *
 * Waiting is for agents. The expected blocker is a person's short gesture
 * hold or another agent's per-write hold, both about to clear, so an agent
 * waits them out rather than failing at once; the cap outlasts a crashed
 * holder's lease. A person never waits: their gesture is refused on the spot
 * when anybody else holds the board (TASK-153). A zero wait asks exactly once.
 * @param request Who is asking, for which board, and how long to wait.
 * @returns The hold, saying whether this call created it or joined one.
 * @throws {BoardHeldError} When somebody else still has the board.
 * @throws {BoardLockCancelledError} When the request goes away while waiting.
 */
async function holdBoard(request: LockRequest): Promise<LockHold> {
	const board = normalizeBoardKey(request.board);
	const plan = waitPlan(request);
	const wait: WaitState = { blocker: null, attemptsPastDeadline: 0 };
	for (;;) {
		// One try at a time, against one lease file: the whole point of this loop
		// is that the board admits a single writer, so the attempts cannot overlap.
		// oxlint-disable-next-line no-await-in-loop -- one attempt at a time is the mutex
		const result = await attemptOnce(board, request, plan.leaseMs);
		if (result.ok) {
			return holdFrom(result, board, wait.blocker);
		}
		const verdict = nextStep(result, request, wait, plan.deadline);
		if (verdict === "stop") {
			break;
		}
		if (verdict === "wait") {
			// The poll interval between attempts, which is what waiting is here.
			// oxlint-disable-next-line no-await-in-loop -- the interval between attempts
			await waitForLockPoll(request.board, pollFor(plan.deadline), request.signal);
		}
	}
	throw new BoardHeldError(
		request.board,
		wait.blocker ? holderOf(wait.blocker) : null,
		Date.now() - plan.startedAt,
	);
}

/** How long this call waits, and from when. */
interface WaitPlan {
	leaseMs: number;
	startedAt: number;
	deadline: number;
}

/** What the wait has learnt so far. */
interface WaitState {
	/** The last concrete blocker, for the refusal text and predecessor proof. */
	blocker: LockRecord | null;
	attemptsPastDeadline: number;
}

/** What the wait does after one refused attempt. */
type WaitVerdict = "stop" | "retry" | "wait";

/**
 * How long this call holds the board for and how long it waits to get it.
 * @param request Who is asking.
 * @returns The plan.
 */
function waitPlan(request: LockRequest): WaitPlan {
	const startedAt = Date.now();
	return {
		leaseMs: request.leaseMs ?? LOCK_LEASE_MS,
		startedAt,
		deadline: startedAt + (request.waitMs ?? LOCK_WAIT_CAP_MS),
	};
}

/**
 * How long to sleep before looking again, never past the deadline and never
 * nothing at all.
 * @param deadline When the wait gives up.
 * @returns The interval in milliseconds.
 */
function pollFor(deadline: number): number {
	return Math.min(LOCK_POLL_MS, Math.max(1, deadline - Date.now()));
}

/**
 * What the wait does after one refused attempt, recording what it learnt.
 * @param result The refused attempt.
 * @param request Who is asking.
 * @param wait What the wait has learnt, extended in place.
 * @param deadline When the wait gives up.
 * @returns Whether to refuse now, try again at once, or wait a poll interval.
 */
function nextStep(
	result: Extract<Attempt, { ok: false }>,
	request: LockRequest,
	wait: WaitState,
	deadline: number,
): WaitVerdict {
	// Null means movement or a race, not a known holder, so the last concrete
	// blocker is kept.
	wait.blocker = result.record ?? wait.blocker;
	if (result.record && refusedOutright(result.record, request)) {
		return "stop";
	}
	if (Date.now() < deadline) {
		return "wait";
	}
	return givesUp(wait) ? "stop" : "retry";
}

/**
 * Whether a wait past its deadline refuses now.
 *
 * File churn is bounded: two post-deadline attempts are allowed when no
 * concrete blocker was readable, and then the wait refuses rather than
 * looping forever.
 * @param wait What the wait has learnt, extended in place.
 * @returns True when it refuses now.
 */
function givesUp(wait: WaitState): boolean {
	if (wait.blocker || wait.attemptsPastDeadline >= 2) {
		return true;
	}
	wait.attemptsPastDeadline += 1;
	return false;
}

/**
 * The hold a proven acquisition becomes.
 *
 * A commit receipt is useful only when this newly-created acquirer observed
 * its exact predecessor; the state owner consumes and validates it once.
 * @param result The proven acquisition.
 * @param board The board key.
 * @param blocker The last concrete blocker this wait saw.
 * @returns The hold.
 */
function holdFrom(
	result: Extract<Attempt, { ok: true }>,
	board: string,
	blocker: LockRecord | null,
): LockHold {
	const predecessorHash = result.created ? takeHandoff(board, blocker) : undefined;
	return {
		holder: holderOf(result.record),
		leaseToken: result.record.token,
		created: result.created,
		...(predecessorHash !== undefined ? { predecessorHash } : {}),
	};
}

/**
 * One attempt, with cancellation checked on both sides of it.
 *
 * If cancellation arrives after a successful new acquisition, that
 * acquisition is released; a reentrant hold that belonged to the caller
 * beforehand never is.
 * @param board The board key, already normalized.
 * @param request Who is asking.
 * @param leaseMs How long the lease runs for.
 * @returns This acquisition, or the live blocker that refused it.
 * @throws {BoardLockCancelledError} When the request goes away.
 */
async function attemptOnce(board: string, request: LockRequest, leaseMs: number): Promise<Attempt> {
	refuseIfCancelled(request);
	const result = await attempt(board, request.holder, leaseMs, request.revokeClaim === true);
	if (request.signal?.aborted && result.ok && result.created) {
		releaseHold(board, request.holder.id);
	}
	refuseIfCancelled(request);
	return result;
}

/**
 * Stop when the request that was waiting has gone away.
 * @param request Who was asking.
 * @throws {BoardLockCancelledError} When the request has gone away.
 */
function refuseIfCancelled(request: LockRequest): void {
	if (request.signal?.aborted) {
		throw new BoardLockCancelledError(request.board);
	}
}

/**
 * Whether this blocker ends the wait rather than being waited out.
 *
 * A person is refused now, whoever the blocker is: the wait was only ever for
 * an agent behind a person's gesture hold or another agent's per-write hold,
 * and it was never meant to make a person wait to learn that their edit was
 * not accepted. An agent waits for a write that is about to finish; a claim
 * is not one, because it stands until its holder releases it or a take-back
 * revokes it, so a request that will not revoke learns that now instead of at
 * the deadline.
 * @param blocker Who has the board.
 * @param request Who is asking.
 * @returns True when waiting would not help.
 */
function refusedOutright(blocker: LockRecord, request: LockRequest): boolean {
	if (blocker.id === request.holder.id) {
		return false;
	}
	if (request.holder.kind === "human") {
		return true;
	}
	return Boolean(blocker.claimed) && request.revokeClaim !== true;
}

/**
 * Hold the board for exactly one write.
 *
 * `write` is intentionally synchronous. An await inside the note's
 * read-modify-write would admit a second request into the very cycle this
 * mutex protects. The lease is released only when this call created it; a
 * joined human hold or claim must outlive this one write.
 * @param request Who is asking, and for which board.
 * @param write The write, which runs while the board is held.
 * @returns Whatever the write returned.
 * @throws {BoardHeldError} When somebody else has the board.
 */
async function withBoardLock<T>(request: LockRequest, write: () => T): Promise<T> {
	const hold = await holdBoard(request);
	try {
		return write();
	} finally {
		if (hold.created) {
			releaseHold(request.board, request.holder.id);
		}
	}
}

export { BoardLockCancelledError, holdBoard, sleep, withBoardLock };
