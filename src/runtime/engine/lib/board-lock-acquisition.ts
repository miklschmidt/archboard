import fs from "node:fs";
import path from "node:path";

import {
	LOCK_LEASE_MS,
	LOCK_POLL_MS,
	LOCK_STEAL_GUARD_MS,
	LOCK_WAIT_CAP_MS,
} from "../../../shared/timing/timing.js";
import { normalizeBoardKey } from "../board.js";
import { noteClaimRevoked, processClaims } from "./board-lock-claim-state.js";
import {
	BoardHeldError,
	processName,
	type HolderKind,
	type LockHold,
	type LockRecord,
	type LockRequest,
} from "./board-lock-contracts.js";
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
} from "./board-lock-state.js";

class BoardLockCancelledError extends Error {
	readonly code = "BOARD_LOCK_CANCELLED";

	constructor(readonly board: string) {
		super(`Waiting to write "${board}" was canceled because the request disconnected.`);
		this.name = "BoardLockCancelledError";
	}
}

// One attempt either proves this acquisition, names the live blocker, or says
// the file moved underneath the read. The outer bounded loop owns retry policy.
type Attempt =
	| { ok: true; record: LockRecord; created: boolean }
	| { ok: false; record: LockRecord | null };

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => {
		setTimeout(resolve, ms);
	});
}

function waitForLockPoll(board: string, ms: number, signal?: AbortSignal): Promise<void> {
	// Waiting is filesystem polling because another process has no signal it can
	// send here. Abort removes both timer and listener so disconnected requests
	// do not consume application shutdown time.
	if (signal?.aborted) {
		return Promise.reject(new BoardLockCancelledError(board));
	}
	return new Promise((resolve, reject) => {
		let timer: ReturnType<typeof setTimeout> | null = null;
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

async function attempt(
	board: string,
	who: { id: string; kind: HolderKind; reason?: string; claimed?: boolean },
	leaseMs: number,
	revoke: boolean,
): Promise<Attempt> {
	// Three ordinary states: same holder renews; a live rival refuses; absent or
	// lapsed state is acquired. A person's explicit take-back of a claim (ADR
	// 0022) follows the contested lapsed path; a short write is never revoked,
	// and an ordinary human hold is refused by a claim like any other rival.
	const file = lockPathFor(board);
	const current = readRecord(file);
	const live = liveRecord(current);
	const revoking = Boolean(
		live && revoke && who.kind === "human" && live.claimed && live.id !== who.id,
	);

	const endsClaimHere = (taker: LockRecord): void => {
		// A process claim can outlive a momentarily lapsed/deleted lease. End it
		// only after this taker's acquisition is proven, including a reentrant
		// human lease that was already present when take-back was requested.
		if (!revoke || who.kind !== "human") {
			return;
		}
		const claimHere = processClaims.get(board);
		if (!claimHere || claimHere.holder.id === who.id) {
			return;
		}
		noteClaimRevoked(board, claimHere.holder, holderOf(taker));
	};

	if (live && live.id === who.id) {
		// Reentrant renewal preserves `since`, so refusals describe when the holder
		// began rather than its latest heartbeat. Joining is not creating: callers
		// must not release the surrounding human gesture or claim.
		const renewed: LockRecord = {
			...live,
			kind: who.kind,
			until: stamp(Date.now() + leaseMs),
			...(who.reason !== undefined ? { reason: who.reason } : {}),
			...(who.claimed ? { claimed: true } : {}),
		};
		writeRecord(file, renewed);
		endsClaimHere(renewed);
		announceHeld(board, holderOf(renewed));
		return { ok: true, record: renewed, created: false };
	}

	if (live && !revoking) {
		announceHeld(board, holderOf(live));
		return { ok: false, record: live };
	}

	const record: LockRecord = {
		id: who.id,
		kind: who.kind,
		since: stamp(Date.now()),
		until: stamp(Date.now() + leaseMs),
		process: processName(),
		...(who.reason !== undefined ? { reason: who.reason } : {}),
		...(who.claimed ? { claimed: true } : {}),
		token: newToken(),
	};

	if (!current) {
		// Exclusive create settles an actually absent path atomically. If another
		// process wins between read and create, reread its record; a live winner is
		// the blocker, while a lapsed/malformed result proceeds to contested steal.
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
			if ((error as NodeJS.ErrnoException).code !== "EEXIST") {
				throw error;
			}
			const raced = liveRecord(readRecord(file));
			if (raced) {
				announceHeld(board, holderOf(raced));
				return { ok: false, record: raced };
			}
		}
	}

	writeRecord(file, record);
	// Rename takeover is not settled by the write: two processes can both see an
	// expired lease and both rename. Both pay the steal guard, then only the one
	// whose token remains in the file believes it owns the board. The ordinary
	// absent and live-holder paths never pay this delay.
	await sleep(LOCK_STEAL_GUARD_MS);
	const settled = readRecord(file);
	if (!settled || settled.token !== record.token) {
		return { ok: false, record: liveRecord(settled) };
	}
	endsClaimHere(record);
	announceHeld(board, holderOf(record));
	return { ok: true, record, created: true };
}

async function holdBoard(request: LockRequest): Promise<LockHold> {
	// Waiting is for agents. The expected blocker is a person's short gesture
	// hold or another agent's per-write hold, both about to clear, so an agent
	// waits them out rather than failing at once; the cap outlasts a crashed
	// holder's lease. A person never waits: their gesture is refused on the
	// spot when anybody else holds the board (TASK-153). Zero asks exactly once.
	const board = normalizeBoardKey(request.board);
	const leaseMs = request.leaseMs ?? LOCK_LEASE_MS;
	const waitMs = request.waitMs ?? LOCK_WAIT_CAP_MS;
	const startedAt = Date.now();
	const deadline = startedAt + waitMs;
	let blocker: LockRecord | null = null;
	let attemptsPastDeadline = 0;

	for (;;) {
		// Cancellation is checked on both sides of the asynchronous attempt. If it
		// arrives after a successful new acquisition, release that acquisition;
		// never release a reentrant hold that belonged to the caller beforehand.
		if (request.signal?.aborted) {
			throw new BoardLockCancelledError(request.board);
		}
		const result = await attempt(board, request.holder, leaseMs, request.revokeClaim === true);
		if (request.signal?.aborted) {
			if (result.ok && result.created) {
				releaseHold(board, request.holder.id);
			}
			throw new BoardLockCancelledError(request.board);
		}
		if (result.ok) {
			// A receipt is useful only when this newly-created acquirer observed its
			// exact predecessor. The state owner consumes and validates it once.
			const predecessorHash = result.created ? takeHandoff(board, blocker) : undefined;
			return {
				holder: holderOf(result.record),
				leaseToken: result.record.token,
				created: result.created,
				...(predecessorHash !== undefined ? { predecessorHash } : {}),
			};
		}
		if (result.record) {
			// Null means movement/race, not a known holder. Preserve the last concrete
			// blocker for refusal text and predecessor proof.
			blocker = result.record;
			if (blocker.id !== request.holder.id) {
				// A person is refused now, whoever the blocker is: the wait was only
				// ever for an agent behind a person's gesture hold or another agent's
				// per-write hold, and it was never meant to make a person wait to
				// learn that their edit was not accepted.
				if (request.holder.kind === "human") {
					break;
				}
				// An agent waits for a write that is about to finish. A claim is not:
				// it stands until its holder releases it or a take-back revokes it, so
				// a request that will not revoke learns that now instead of at the
				// deadline.
				if (blocker.claimed && request.revokeClaim !== true) {
					break;
				}
			}
		}
		if (Date.now() >= deadline) {
			// Bound file churn: allow two post-deadline attempts when no concrete
			// blocker was readable, then refuse rather than loop forever.
			if (blocker || attemptsPastDeadline >= 2) {
				break;
			}
			attemptsPastDeadline += 1;
			continue;
		}
		await waitForLockPoll(
			request.board,
			Math.min(LOCK_POLL_MS, Math.max(1, deadline - Date.now())),
			request.signal,
		);
	}

	throw new BoardHeldError(
		request.board,
		blocker ? holderOf(blocker) : null,
		Date.now() - startedAt,
	);
}

async function withBoardLock<T>(request: LockRequest, write: () => T): Promise<T> {
	// `write` is intentionally synchronous. An await inside the note's
	// read-modify-write would admit a second request into the very cycle this
	// mutex protects. Release in finally only when this call created the lease;
	// a joined human hold or claim must outlive this one write.
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
