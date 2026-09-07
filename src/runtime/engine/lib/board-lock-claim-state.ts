import { forgetRememberedVersion } from "@/runtime/engine/board-version";
import { CLAIM_LEASE_MS, LOCK_RENEW_MS } from "@/shared/timing/timing";
import type {
	Claim,
	ClaimEntry,
	ClaimRevocation,
	LockHolder,
} from "@/runtime/engine/lib/board-lock-contracts";
import {
	boardLockState,
	releaseHold,
	renewRecord,
	stamp,
} from "@/runtime/engine/lib/board-lock-state";

const processClaims = new Map<string, ClaimEntry>();
const processRevocations = new Map<string, ClaimRevocation>();

// Claims are process knowledge layered over the vault lease. The canvas, not a
// command-lived agent, survives between writes and can renew on its behalf.
/**
 * One process claim as a caller is told about it.
 * @param board The board key.
 * @param entry The claim this canvas holds.
 * @returns The claim, with its campaign deadline as a timestamp.
 */
function claimOf(board: string, entry: ClaimEntry): Claim {
	return { board, holder: entry.holder, expires: stamp(entry.expires) };
}

/**
 * Stop renewing the lease under one claim.
 * @param entry The claim.
 */
function stopRenewing(entry: ClaimEntry): void {
	if (entry.timer) {
		clearInterval(entry.timer);
	}
	entry.timer = null;
}

/**
 * End one claim on this canvas.
 *
 * Ending the process claim also ends renewal and its remembered write
 * identity. It does not undo anything already committed to the note.
 * @param board The board key.
 * @param entry The claim.
 */
function dropClaim(board: string, entry: ClaimEntry): void {
	stopRenewing(entry);
	forgetRememberedVersion(entry.holder.id);
	processClaims.delete(board);
}

/**
 * The claim this canvas holds on a board, when it still stands.
 *
 * Claim expiry bounds a live agent or one that walked away, so an expired
 * claim is dropped the moment it is asked about rather than whenever the
 * renewal timer next lands.
 * @param board The board key.
 * @returns The claim, or null when this canvas has none.
 */
function liveClaim(board: string): ClaimEntry | null {
	const entry = processClaims.get(board);
	if (!entry) {
		return null;
	}
	if (Date.now() < entry.expires) {
		return entry;
	}
	// Claim expiry bounds a live agent or one that walked away. Drop immediately
	// when asked rather than depending on where the renewal timer last landed.
	dropClaim(board, entry);
	releaseHold(board, entry.holder.id);
	return null;
}

/**
 * Record that a claim was taken back, for the agent that lost it.
 *
 * Both sides discover the same event here: a local take-back at proven
 * acquisition, or a later refused renewal after a remote take-back. Only the
 * canvas that owned this claim records it, and the record is consumed once.
 * @param board The board key.
 * @param lost Who held the claim.
 * @param by Who took it back, when that is known.
 */
function noteClaimRevoked(board: string, lost: LockHolder, by: LockHolder | null): void {
	const entry = processClaims.get(board);
	if (!entry || entry.holder.id !== lost.id) {
		return;
	}
	dropClaim(board, entry);
	processRevocations.set(board, { claim: claimOf(board, entry), by });
}

/**
 * Keep the lease under one claim alive for another beat.
 *
 * Ordinary acquisition is never called here: retaking a free lease would
 * restore a claim the person explicitly took back (ADR 0022), so a refused
 * renewal ends the claim instead.
 * @param board The board key.
 */
function renewClaim(board: string): void {
	const entry = liveClaim(board);
	if (!entry) {
		return;
	}
	const renewed = renewRecord(board, entry.holder.id, CLAIM_LEASE_MS);
	if (renewed) {
		entry.holder = renewed;
		return;
	}
	// Never call ordinary acquisition here. Retaking a free lease would restore
	// a claim the person explicitly took back (ADR 0022).
	noteClaimRevoked(board, entry.holder, boardLockState(board));
}

/**
 * Start renewing the lease under one claim.
 *
 * The short lease bounds a dead canvas; repeated renewal is what makes a long
 * claim long. This timer never moves the separate claim expiry.
 * @param board The board key.
 * @returns The timer, so the claim can stop it.
 */
function startRenewing(board: string): ReturnType<typeof setInterval> {
	const timer = setInterval(() => {
		renewClaim(board);
	}, LOCK_RENEW_MS);
	// Renewal must not be the reason a process stays alive.
	timer.unref();
	return timer;
}

/**
 * Drop every claim this process remembers. For a check that wants a fresh
 * canvas; the vault leases are released as each claim goes.
 */
function forgetClaimState(): void {
	for (const [board, entry] of processClaims) {
		dropClaim(board, entry);
	}
	processRevocations.clear();
}

export {
	claimOf,
	dropClaim,
	forgetClaimState,
	liveClaim,
	noteClaimRevoked,
	processClaims,
	processRevocations,
	startRenewing,
};
