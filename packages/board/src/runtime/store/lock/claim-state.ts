import { BOARD_LOCK_MS, CLAIM_MS } from "@archboard/timing";
import { boardMemoryKey } from "#runtime/store/address.ts";
import type {
	Claim,
	ClaimEndCause,
	ClaimEntry,
	ClaimRevocation,
	LockHolder,
} from "#runtime/store/lock/contracts.ts";
import {
	boardLockState,
	releaseHold,
	renewRecord,
	stamp,
} from "#runtime/store/lock/lease-state.ts";

// Both are keyed by `boardMemoryKey`: one server serves several vaults, and two
// of them can each hold a board of one name (ADR 0049).
const processClaims = new Map<string, ClaimEntry>();
const processRevocations = new Map<string, ClaimRevocation>();

// Claims are process knowledge layered over the vault lease. The server, not a
// command-lived agent, survives between writes and can renew on its behalf.
/**
 * One process claim as a caller is told about it.
 * @param board The board key.
 * @param entry The claim this server holds.
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
 * End one claim on this server.
 *
 * Ending the process claim also ends renewal and its remembered write
 * identity. It does not undo anything already committed to the note.
 * @param entry The claim.
 */
function dropClaim(entry: ClaimEntry): void {
	stopRenewing(entry);
	processClaims.delete(boardMemoryKey(entry.vault, entry.board));
}

/**
 * The claim this server holds on a board, when it still stands.
 *
 * Claim expiry bounds a live agent or one that walked away, so an expired
 * claim is dropped the moment it is asked about rather than whenever the
 * renewal timer next lands.
 * @param vault The vault root the board lives in.
 * @param board The board key.
 * @returns The claim, or null when this server has none.
 */
function liveClaim(vault: string, board: string): ClaimEntry | null {
	const entry = processClaims.get(boardMemoryKey(vault, board));
	if (!entry) {
		return null;
	}
	if (Date.now() < entry.expires) {
		return entry;
	}
	// Claim expiry bounds a live agent or one that walked away. Drop immediately
	// when asked rather than depending on where the renewal timer last landed.
	dropClaim(entry);
	releaseHold(entry.vault, entry.board, entry.holder.id);
	return null;
}

/**
 * Record that a claim ended, and why, for the agent that lost it.
 *
 * Both sides discover the same event here: a local take-back at proven
 * acquisition, or a later refused renewal after the lease went to somebody
 * else. Only the server that owned this claim records it, and the record is
 * consumed once.
 * @param vault The vault root the board lives in.
 * @param board The board key.
 * @param lost Who held the claim.
 * @param by Who has the board now, when that is known.
 * @param cause Why the claim ended.
 */
function noteClaimRevoked(
	vault: string,
	board: string,
	lost: LockHolder,
	by: LockHolder | null,
	cause: ClaimEndCause,
): void {
	const key = boardMemoryKey(vault, board);
	const entry = processClaims.get(key);
	if (!entry || entry.holder.id !== lost.id) {
		return;
	}
	dropClaim(entry);
	processRevocations.set(key, { claim: claimOf(board, entry), by, cause });
}

/**
 * Keep the lease under one claim alive for another beat.
 *
 * Ordinary acquisition is never called here: retaking a free lease would
 * restore a claim the person explicitly took back (ADR 0022), so a refused
 * renewal ends the claim instead.
 * @param vault The vault root the board lives in.
 * @param board The board key.
 */
function renewClaim(vault: string, board: string): void {
	const entry = liveClaim(vault, board);
	if (!entry) {
		return;
	}
	const renewed = renewRecord(vault, board, entry.holder.id, CLAIM_MS.lease);
	if (renewed) {
		entry.holder = renewed;
		return;
	}
	// Never call ordinary acquisition here. Retaking a free lease would restore
	// a claim the person explicitly took back (ADR 0022).
	const holder = boardLockState(vault, board);
	noteClaimRevoked(vault, board, entry.holder, holder, causeOfRefusedRenewal(holder));
}

/**
 * Why a refused renewal ended the claim, from who has the board now.
 * @param holder Who holds the board's lease now, or null when nobody does.
 * @returns The cause.
 */
function causeOfRefusedRenewal(holder: LockHolder | null): ClaimEndCause {
	if (!holder) {
		return "lease-gone";
	}
	// A person displaces a claim only by taking it back (ADR 0022), here or
	// through another server, whose take-back holds the lease for a moment.
	return holder.kind === "human" ? "taken-back" : "held-by-another";
}

/**
 * Start renewing the lease under one claim.
 *
 * The short lease bounds a dead server; repeated renewal is what makes a long
 * claim long. This timer never moves the separate claim expiry.
 * @param vault The vault root the board lives in.
 * @param board The board key.
 * @returns The timer, so the claim can stop it.
 */
function startRenewing(vault: string, board: string): ReturnType<typeof setInterval> {
	const timer = setInterval(() => {
		renewClaim(vault, board);
	}, BOARD_LOCK_MS.renew);
	// Renewal must not be the reason a process stays alive.
	timer.unref();
	return timer;
}

/**
 * Drop every claim this process remembers. For a check that wants a fresh
 * server; the vault leases are released as each claim goes.
 */
function forgetClaimState(): void {
	for (const entry of processClaims.values()) {
		dropClaim(entry);
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
