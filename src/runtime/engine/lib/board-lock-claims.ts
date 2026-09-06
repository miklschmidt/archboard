import { CLAIM_DEFAULT_MS, CLAIM_LEASE_MS, CLAIM_MAX_MS } from "../../../shared/timing/timing.js";
import { normalizeBoardKey } from "../board.js";
import { holdBoard } from "./board-lock-acquisition.js";
import {
	claimOf,
	dropClaim,
	liveClaim,
	processClaims,
	processRevocations,
	startRenewing,
} from "./board-lock-claim-state.js";
import type { Claim, ClaimEntry, ClaimRevocation } from "./board-lock-contracts.js";
import { newToken, releaseHold } from "./board-lock-state.js";

/**
 * Claim a board for an agent campaign, or extend this canvas's existing claim.
 *
 * @param request Board, reason, bounded campaign duration, wait, and cancellation evidence.
 * @returns The active claim and whether this call created its holder identity.
 */
async function claimBoard(
	request: Readonly<{
		board: string;
		reason: string;
		forMs?: number;
		waitMs?: number;
		signal?: Readonly<AbortSignal>;
	}>,
): Promise<{ claim: Claim; created: boolean }> {
	// Claiming again extends the campaign while keeping its holder id. Writes
	// under the claim renew only the lease; this explicit act alone moves expiry.
	// Clamp rather than refuse an overlong request, while never making the claim
	// shorter than the renewable lease beneath it.
	const board = normalizeBoardKey(request.board);
	const forMs = Math.min(Math.max(request.forMs ?? CLAIM_DEFAULT_MS, CLAIM_LEASE_MS), CLAIM_MAX_MS);
	const existing = liveClaim(board);
	const id = existing === null ? `claim-${newToken()}` : existing.holder.id;
	const hold = await holdBoard({
		board,
		holder: { id, kind: "agent", reason: request.reason, claimed: true },
		leaseMs: CLAIM_LEASE_MS,
		...(request.waitMs !== undefined ? { waitMs: request.waitMs } : {}),
		...(request.signal !== undefined ? { signal: request.signal } : {}),
	});
	const entry: ClaimEntry = {
		holder: hold.holder,
		expires: Date.now() + forMs,
		timer: existing === null ? null : existing.timer,
	};
	processClaims.set(board, entry);
	entry.timer ??= startRenewing(board);
	return { claim: claimOf(board, entry), created: existing === null };
}

/**
 * Release this canvas's claim without treating an already-ended claim as an error.
 *
 * @param board Board key or alias.
 * @returns The released process claim, or null when this canvas retained no claim for the board.
 */
function releaseClaim(board: string): Claim | null {
	// A late release after expiry or take-back is harmless and reports null.
	const key = normalizeBoardKey(board);
	const entry = processClaims.get(key);
	if (entry === undefined) {
		return null;
	}
	dropClaim(key, entry);
	releaseHold(key, entry.holder.id);
	return claimOf(key, entry);
}

/**
 * Read this canvas's live claim, expiring it first when its campaign deadline passed.
 *
 * @param board Board key or alias.
 * @returns The live claim, or null.
 */
function claimOn(board: string): Claim | null {
	const key = normalizeBoardKey(board);
	const entry = liveClaim(key);
	return entry === null ? null : claimOf(key, entry);
}

/**
 * Resolve the holder identity an agent write should reenter for this board.
 *
 * @param board Board key or alias.
 * @returns The live claim holder id, or null for an ordinary per-write acquisition.
 */
function claimWriterId(board: string): string | null {
	// The canvas supplies this id across command-lived agent requests. If the
	// vault lease was lost, ordinary acquisition must not silently rebuild the
	// claim; the renewal/revocation owner resolves that state.
	const entry = liveClaim(normalizeBoardKey(board));
	return entry === null ? null : entry.holder.id;
}

/**
 * Consume the one-shot notice that this canvas's claim was taken back.
 *
 * @param board Board key or alias.
 * @returns The revocation once, or null after it has been consumed.
 */
function takeClaimRevocation(board: string): ClaimRevocation | null {
	// Told once: the next agent act learns what was interrupted and that nothing
	// was undone; after that, work is ordinary rather than permanently refused.
	const key = normalizeBoardKey(board);
	const lost = processRevocations.get(key);
	if (lost === undefined) {
		return null;
	}
	processRevocations.delete(key);
	return lost;
}

export { claimBoard, claimOn, claimWriterId, releaseClaim, takeClaimRevocation };
