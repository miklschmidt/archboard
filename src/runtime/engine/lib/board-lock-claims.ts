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

async function claimBoard(request: {
	board: string;
	reason: string;
	forMs?: number;
	waitMs?: number;
	signal?: AbortSignal;
}): Promise<{ claim: Claim; created: boolean }> {
	// Claiming again extends the campaign while keeping its holder id. Writes
	// under the claim renew only the lease; this explicit act alone moves expiry.
	// Clamp rather than refuse an overlong request, while never making the claim
	// shorter than the renewable lease beneath it.
	const board = normalizeBoardKey(request.board);
	const forMs = Math.min(Math.max(request.forMs ?? CLAIM_DEFAULT_MS, CLAIM_LEASE_MS), CLAIM_MAX_MS);
	const existing = liveClaim(board);
	const id = existing?.holder.id ?? `claim-${newToken()}`;
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
		timer: existing?.timer ?? null,
	};
	processClaims.set(board, entry);
	if (!entry.timer) {
		entry.timer = startRenewing(board);
	}
	return { claim: claimOf(board, entry), created: existing === null };
}

function releaseClaim(board: string): Claim | null {
	// A late release after expiry or takeover is harmless and reports null.
	const key = normalizeBoardKey(board);
	const entry = processClaims.get(key);
	if (!entry) {
		return null;
	}
	dropClaim(key, entry);
	releaseHold(key, entry.holder.id);
	return claimOf(key, entry);
}

function claimOn(board: string): Claim | null {
	const key = normalizeBoardKey(board);
	const entry = liveClaim(key);
	return entry ? claimOf(key, entry) : null;
}

function claimWriterId(board: string): string | null {
	// The canvas supplies this id across command-lived agent requests. If the
	// vault lease was lost, ordinary acquisition must not silently rebuild the
	// claim; the renewal/revocation owner resolves that state.
	return liveClaim(normalizeBoardKey(board))?.holder.id ?? null;
}

function takeClaimRevocation(board: string): ClaimRevocation | null {
	// Told once: the next agent act learns what was interrupted and that nothing
	// was undone; after that, work is ordinary rather than permanently refused.
	const key = normalizeBoardKey(board);
	const lost = processRevocations.get(key);
	if (!lost) {
		return null;
	}
	processRevocations.delete(key);
	return lost;
}

export { claimBoard, claimOn, claimWriterId, releaseClaim, takeClaimRevocation };
