import { forgetRememberedVersion } from "../board-version.js";
import { CLAIM_LEASE_MS, LOCK_RENEW_MS } from "../../../shared/timing/timing.js";
import type { Claim, ClaimEntry, ClaimRevocation, LockHolder } from "./board-lock-contracts.js";
import { boardLockState, releaseHold, renewRecord, stamp } from "./board-lock-state.js";

const processClaims = new Map<string, ClaimEntry>();
const processRevocations = new Map<string, ClaimRevocation>();

// Claims are process knowledge layered over the vault lease. The canvas, not a
// command-lived agent, survives between writes and can renew on its behalf.
function claimOf(board: string, entry: ClaimEntry): Claim {
	return { board, holder: entry.holder, expires: stamp(entry.expires) };
}

function stopRenewing(entry: ClaimEntry): void {
	if (entry.timer) {
		clearInterval(entry.timer);
	}
	entry.timer = null;
}

function dropClaim(board: string, entry: ClaimEntry): void {
	// Ending the process claim also ends renewal and its remembered write
	// identity. It does not undo anything already committed to the note.
	stopRenewing(entry);
	forgetRememberedVersion(entry.holder.id);
	processClaims.delete(board);
}

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

function noteClaimRevoked(board: string, lost: LockHolder, by: LockHolder | null): void {
	// Both sides discover the same event here: a local take-back at proven
	// acquisition, or a later refused renewal after a remote take-back. Only the
	// canvas that owned this claim records it, and it is consumed once.
	const entry = processClaims.get(board);
	if (!entry || entry.holder.id !== lost.id) {
		return;
	}
	dropClaim(board, entry);
	processRevocations.set(board, { claim: claimOf(board, entry), by });
}

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

function startRenewing(board: string): ReturnType<typeof setInterval> {
	// The short lease bounds a dead canvas; repeated renewal makes a long claim
	// long. This timer never moves the separate claim expiry.
	const timer = setInterval(() => {
		renewClaim(board);
	}, LOCK_RENEW_MS);
	timer.unref?.();
	return timer;
}

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
