import fs from "node:fs";
import path from "node:path";

import { after, ms, pollUntil, TimedOut } from "@archboard/timing";
import { modelMemoryKey, normalizePaneKey } from "#runtime/store/legacy-address.ts";
import { noteClaimRevoked, processClaims } from "#runtime/lock/store/claim-state.ts";
import {
	ModelHeldError,
	processName,
	type HolderKind,
	type LockHold,
	type LockRecord,
	type LockRequest,
} from "#runtime/lock/store/contracts.ts";
import { isRecord, stringAt } from "@archboard/diagnostics/unknown-record";
import {
	announceHeld,
	holderOf,
	liveRecord,
	lockPathFor,
	newToken,
	readRecord,
	releaseHold,
	stamp,
	writeRecord,
} from "#runtime/lock/store/lease-state.ts";

class ModelLockCancelledError extends Error {
	readonly code = "MODEL_LOCK_CANCELLED";

	/**
	 * A wait given up because the request that was waiting went away.
	 * @param model The legacy board key.
	 */
	constructor(readonly model: string) {
		super(`Waiting to write "${model}" was canceled because the request disconnected.`);
		this.name = "ModelLockCancelledError";
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

/** Who is asking for the model, and whether they are claiming it. */
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
 * @param who Who is taking the model.
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
 * @param vault The vault root the legacy board lives in.
 * @param file The lease file's path.
 * @param record The lease to write.
 * @param model The legacy board key.
 * @param endsClaimHere Ends a standing claim this acquisition displaced.
 * @returns The settled attempt, or null when the contested path must decide.
 * @throws {Error} When the create fails for any reason but the file existing.
 */
function createExclusively(
	vault: string,
	file: string,
	record: LockRecord,
	model: string,
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
		announceHeld(vault, model, holderOf(record));
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
	announceHeld(vault, model, holderOf(raced));
	return { ok: false, record: raced };
}

/** What one attempt is asking for. */
interface AttemptContext {
	vault: string;
	model: string;
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
	const { vault, model, file, who, leaseMs, revoke } = context;
	if (live.id === who.id) {
		// Reentrant renewal preserves `since`, so refusals describe when the holder
		// began rather than its latest heartbeat. Joining is not creating: callers
		// must not release the surrounding human gesture or claim.
		const renewed = renewedRecord(live, who, leaseMs);
		writeRecord(file, renewed);
		endsClaimHere(renewed);
		announceHeld(vault, model, holderOf(renewed));
		return { ok: true, record: renewed, created: false };
	}
	if (isTakingBack(live, who, revoke)) {
		return null;
	}
	announceHeld(vault, model, holderOf(live));
	return { ok: false, record: live };
}

// One attempt either proves this acquisition, names the live blocker, or says
// the file moved underneath the read. The outer bounded loop owns retry policy.
type Attempt =
	| { ok: true; record: LockRecord; created: boolean }
	| { ok: false; record: LockRecord | null };

/**
 * One try at taking the legacy board.
 *
 * Three ordinary states: the same holder renews; a live rival refuses; absent
 * or lapsed state is acquired. A person's explicit take-back of a claim (ADR
 * 0022) follows the contested lapsed path; a short write is never revoked,
 * and an ordinary human hold is refused by a claim like any other rival.
 * @param vault The vault root the legacy board lives in.
 * @param model The legacy board key, already normalized.
 * @param who Who is asking, and whether they are claiming it.
 * @param leaseMs How long the lease runs for.
 * @param revoke Whether a person is taking a standing claim back.
 * @returns This acquisition, or the live blocker that refused it.
 * @throws {Error} When the lease file cannot be written.
 */
async function attempt(
	vault: string,
	model: string,
	who: Asker,
	leaseMs: number,
	revoke: boolean,
): Promise<Attempt> {
	const file = lockPathFor(vault, model);
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
		const claimHere =
			revoke && who.kind === "human" ? processClaims.get(modelMemoryKey(vault, model)) : undefined;
		if (claimHere && claimHere.holder.id !== who.id) {
			noteClaimRevoked(vault, model, claimHere.holder, holderOf(taker), "taken-back");
		}
	};

	const context = { vault, model, file, who, leaseMs, revoke };
	if (live) {
		const decided = decideAgainstLive(live, context, endsClaimHere);
		if (decided) {
			return decided;
		}
	}

	if (!current) {
		const settled = createExclusively(vault, file, freshRecord(who, leaseMs), model, endsClaimHere);
		if (settled) {
			return settled;
		}
	}

	return takeLapsed(context, current, endsClaimHere);
}

/**
 * Whether a lapsed lease is the asking claim's own.
 * @param current The lease as read, lapsed or absent.
 * @param who Who is asking.
 * @returns True when a claim asks for a lease that still names it.
 */
function isOwnLapsedClaim(current: LockRecord | null, who: Asker): current is LockRecord {
	return who.claimed === true && current?.id === who.id;
}

/**
 * Take a lapsed lease. A claim's own lapsed lease was taken by nobody, only
 * renewed late by a busy server (TASK-489), so a write under the claim joins it
 * as it would a live one: `since` is kept and the write does not release it.
 * It still pays the steal guard: another process may be taking it too.
 * @param context What this attempt is asking for.
 * @param current The lease as read, lapsed or absent.
 * @param endsClaimHere Ends a standing claim this acquisition displaced.
 * @returns This acquisition, or the writer that won the steal.
 */
async function takeLapsed(
	context: AttemptContext,
	current: LockRecord | null,
	endsClaimHere: (taker: LockRecord) => void,
): Promise<Attempt> {
	const { vault, model, file, who, leaseMs } = context;
	if (!isOwnLapsedClaim(current, who)) {
		return stealContested(vault, file, freshRecord(who, leaseMs), model, endsClaimHere);
	}
	const record = { ...renewedRecord(current, who, leaseMs), token: newToken() };
	const taken = await stealContested(vault, file, record, model, endsClaimHere);
	return taken.ok ? { ...taken, created: false } : taken;
}

/**
 * Take a lease another writer has let lapse.
 *
 * Rename takeover is not settled by the write: two processes can both see an
 * expired lease and both rename. Both pay the steal guard, and then only the
 * one whose token remains in the file believes it owns the legacy board. The
 * ordinary absent and live-holder paths never pay this delay.
 * @param vault The vault root the legacy board lives in.
 * @param file The lease file's path.
 * @param record The lease to write.
 * @param model The legacy board key.
 * @param endsClaimHere Ends a standing claim this acquisition displaced.
 * @returns This acquisition, or the writer that won the steal.
 */
async function stealContested(
	vault: string,
	file: string,
	record: LockRecord,
	model: string,
	endsClaimHere: (taker: LockRecord) => void,
): Promise<Attempt> {
	writeRecord(file, record);
	await new Promise((resolve) => after("modelLock.stealGuard", () => resolve(undefined)));
	const settled = readRecord(file);
	if (settled?.token !== record.token) {
		return { ok: false, record: liveRecord(settled) };
	}
	endsClaimHere(record);
	announceHeld(vault, model, holderOf(record));
	return { ok: true, record, created: true };
}

/**
 * Take the model, waiting for it where waiting is the right answer.
 *
 * Waiting is for agents. The expected blocker is a person's short gesture
 * hold or another agent's per-write hold, both about to clear, so an agent
 * waits them out rather than failing at once; the cap outlasts a crashed
 * holder's lease. A person never waits: their gesture is refused on the spot
 * when anybody else holds the model (TASK-153). A zero wait asks exactly once.
 * @param request Who is asking, for which model, and how long to wait.
 * @returns The hold, saying whether this call created it or joined one.
 * @throws {ModelHeldError} When somebody else still has the model.
 * @throws {ModelLockCancelledError} When the request goes away while waiting.
 */
async function holdModel(request: LockRequest): Promise<LockHold> {
	const startedAt = performance.now();
	const wait: WaitState = { blocker: null, attemptsPastDeadline: 0, created: false };
	const look = lockAttempt(request, wait);
	try {
		const first = request.waits === false ? await look() : await waitedFor(look, request);
		const outcome = await lastAttempts(first, look, wait);
		if (outcome === undefined || outcome === "refused") {
			throw new ModelHeldError(
				request.model,
				wait.blocker ? holderOf(wait.blocker) : null,
				Math.round(performance.now() - startedAt),
			);
		}
		return outcome;
	} finally {
		// The poll can cancel after a look acquired a lease but before handing it back.
		refuseIfCancelled(request, wait.created);
	}
}

/**
 * One attempt of a request. A hold ends the wait, and so does a blocker that waiting would not
 * move; every refusal teaches the wait its blocker.
 * @param request Who is asking.
 * @param wait What the wait has learnt, extended in place.
 * @returns The attempt: the hold, "refused", or undefined to try again.
 */
function lockAttempt(
	request: LockRequest,
	wait: WaitState,
): () => Promise<LockHold | "refused" | undefined> {
	const model = normalizePaneKey(request.model);
	const leaseMs = request.leaseMs ?? ms("modelLock.lease");
	return async () => {
		// One try at a time, against one lease file: the model admits a single writer.
		refuseIfCancelled(request);
		const result = await attempt(
			request.vault,
			model,
			request.holder,
			leaseMs,
			request.revokeClaim === true,
		);
		// A look can outlive its poll. Return any lease this look acquired after cancellation.
		refuseIfCancelled(request, result.ok && result.created);
		if (result.ok) {
			wait.created = result.created;
			return { holder: holderOf(result.record), created: result.created };
		}
		// Null means movement or a race, not a known holder, so the last concrete blocker is kept.
		wait.blocker = result.record ?? wait.blocker;
		return result.record && refusedOutright(result.record, request) ? "refused" : undefined;
	};
}

/**
 * Past the wait, try again only while no blocker was readable, and at most twice.
 * @param outcome What the wait ended with.
 * @param look One attempt.
 * @param wait What the wait has learnt.
 * @returns What the last attempt found.
 */
async function lastAttempts<T>(
	outcome: T | undefined,
	look: () => Promise<T | undefined>,
	wait: WaitState,
): Promise<T | undefined> {
	let last = outcome;
	while (last === undefined && !givesUp(wait)) {
		// oxlint-disable-next-line no-await-in-loop -- one attempt at a time is the mutex
		last = await look();
	}
	return last;
}

/**
 * Attempt again until the model is held or refused, or the wait runs out. The lock is a file,
 * so waiting is polling: another process has no signal it can send here. A request that goes
 * away ends the wait at once, so it does not consume application shutdown time.
 * @param look One attempt.
 * @param request Who is asking, and its cancellation.
 * @returns What the last attempt found, or undefined when the wait ran out.
 */
async function waitedFor<T>(
	look: () => Promise<T | undefined>,
	request: LockRequest,
): Promise<T | undefined> {
	try {
		return await pollUntil("modelLock.wait", look, { signal: request.signal });
	} catch (error) {
		if (!request.signal?.aborted && error instanceof TimedOut) return undefined;
		throw error;
	}
}

/** What the wait has learnt so far. */
interface WaitState {
	/** The last concrete blocker, for the refusal text. */
	blocker: LockRecord | null;
	attemptsPastDeadline: number;
	/** Whether a look acquired a new lease before the poll delivered its result. */
	created: boolean;
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
 * Stop when the request has gone away and release any lease this request created.
 * @param request Who was asking.
 * @param created Whether this request created the lease.
 * @throws {ModelLockCancelledError} When the request has gone away.
 */
function refuseIfCancelled(request: LockRequest, created = false): void {
	if (request.signal?.aborted) {
		if (created) releaseHold(request.vault, request.model, request.holder.id);
		throw new ModelLockCancelledError(request.model);
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
 * @param blocker Who has the model.
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
 * Hold the model for exactly one write.
 *
 * `write` is intentionally synchronous. An await inside the note's
 * read-modify-write would admit a second request into the very cycle this
 * mutex protects. The lease is released only when this call created it; a
 * joined human hold or claim must outlive this one write.
 * @param request Who is asking, and for which model.
 * @param write The write, which runs while the model is held.
 * @returns Whatever the write returned.
 * @throws {ModelHeldError} When somebody else has the model.
 */
async function withLease<T>(request: LockRequest, write: () => T): Promise<T> {
	const hold = await holdModel(request);
	try {
		return write();
	} finally {
		if (hold.created) {
			releaseHold(request.vault, request.model, request.holder.id);
		}
	}
}

export { ModelLockCancelledError, holdModel, withLease };
