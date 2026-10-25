import { CLAIM_MS } from "@archboard/timing";
import { boardMemoryKey, normalizeBoardKey } from "#runtime/store/address.ts";
import { holdBoard } from "#runtime/store/lock/acquisition.ts";
import {
	claimOf,
	dropClaim,
	liveClaim,
	processClaims,
	processRevocations,
	startRenewing,
} from "#runtime/store/lock/claim-state.ts";
import type {
	Claim,
	ClaimEntry,
	ClaimRevocation,
	LockHolder,
} from "#runtime/store/lock/contracts.ts";
import { boardLockState, newToken, releaseHold } from "#runtime/store/lock/lease-state.ts";

/** A claim this server lost, with the opening of the sentence its agent is told once. */
type LostClaim = ClaimRevocation & {
	/** Why the claim ended, without a full stop, such as `The user at the canvas took "payments" back`. */
	readonly ended: string;
};

/**
 * Claim a board for an agent campaign, or extend this server's existing claim.
 * @param request Board, reason, bounded campaign duration, wait, and cancellation evidence.
 * @returns The active claim and whether this call created its holder identity.
 */
async function claimBoard(
	request: Readonly<{
		vault: string;
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
	const forMs = campaignLength(request.forMs);
	const existing = liveClaim(request.vault, board);
	const id = existing === null ? `claim-${newToken()}` : existing.holder.id;
	const hold = await holdBoard({
		vault: request.vault,
		board,
		holder: { id, kind: "agent", reason: request.reason, claimed: true },
		leaseMs: CLAIM_MS.lease,
		...(request.waitMs !== undefined ? { waitMs: request.waitMs } : {}),
		...(request.signal !== undefined ? { signal: request.signal } : {}),
	});
	const entry: ClaimEntry = {
		vault: request.vault,
		board,
		holder: hold.holder,
		expires: Date.now() + forMs,
		timer: existing === null ? null : existing.timer,
	};
	processClaims.set(boardMemoryKey(request.vault, board), entry);
	entry.timer ??= startRenewing(request.vault, board);
	return { claim: claimOf(board, entry), created: existing === null };
}

/**
 * How long a campaign runs for. An overlong request is clamped rather than
 * refused, and a claim is never shorter than the renewable lease beneath it.
 * @param asked What the caller asked for, when it asked.
 * @returns The campaign's length in milliseconds.
 */
function campaignLength(asked: number | undefined): number {
	return Math.min(Math.max(asked ?? CLAIM_MS.default, CLAIM_MS.lease), CLAIM_MS.max);
}

/**
 * Release this server's claim without treating an already-ended claim as an error.
 * @param vault The vault root the board lives in.
 * @param board Board key or alias.
 * @returns The released process claim, or null when this server retained no claim for the board.
 */
function releaseClaim(vault: string, board: string): Claim | null {
	// A late release after expiry or take-back is harmless and reports null.
	const key = normalizeBoardKey(board);
	const entry = processClaims.get(boardMemoryKey(vault, key));
	if (entry === undefined) {
		return null;
	}
	dropClaim(entry);
	releaseHold(entry.vault, key, entry.holder.id);
	return claimOf(key, entry);
}

/**
 * Read this server's live claim, expiring it first when its campaign deadline passed.
 * @param vault The vault root the board lives in.
 * @param board Board key or alias.
 * @returns The live claim, or null.
 */
function claimOn(vault: string, board: string): Claim | null {
	const key = normalizeBoardKey(board);
	const entry = liveClaim(vault, key);
	return entry === null ? null : claimOf(key, entry);
}

/**
 * Resolve the holder identity an agent write should reenter for this board.
 * @param vault The vault root the board lives in.
 * @param board Board key or alias.
 * @returns The live claim holder id, or null for an ordinary per-write acquisition.
 */
function claimWriterId(vault: string, board: string): string | null {
	// The server supplies this id across command-lived agent requests. If the
	// vault lease was lost, ordinary acquisition must not silently rebuild the
	// claim; the renewal/revocation owner resolves that state.
	const entry = liveClaim(vault, normalizeBoardKey(board));
	return entry === null ? null : entry.holder.id;
}

/**
 * Consume the one-shot notice that this server's claim was taken back.
 * @param vault The vault root the board lives in.
 * @param board Board key or alias.
 * @returns The revocation and why it ended, once, or null after it has been consumed.
 */
function takeClaimRevocation(vault: string, board: string): LostClaim | null {
	// Told once: the next agent act learns what was interrupted and that nothing
	// was undone; after that, work is ordinary rather than permanently refused.
	const key = boardMemoryKey(vault, board);
	const lost = processRevocations.get(key);
	if (lost === undefined) {
		return null;
	}
	processRevocations.delete(key);
	return { ...lost, ended: claimEndReason(lost) };
}

/**
 * The person at the canvas takes a board back (ADR 0022).
 *
 * The lease is taken with any claim revoked and given straight back, so the
 * board goes to nobody and the next write takes it as any write does. Nothing
 * already written is undone. It does not wait: an unclaimed writer holding the
 * board at that instant refuses it by name, so the person can ask again (TASK-153).
 * @param request The board, the pane asking for it and the request's cancellation.
 * @param request.vault The vault root the board lives in.
 * @param request.board The board's canonical key.
 * @param request.by The client id of the pane asking.
 * @param request.signal Cancels waiting for the lease when the caller goes.
 * @returns The agent's claim that stood when the person asked, or null when none did.
 */
async function takeBackBoard(
	request: Readonly<{ vault: string; board: string; by: string; signal?: Readonly<AbortSignal> }>,
): Promise<LockHolder | null> {
	const { vault, board } = request;
	const standing = boardLockState(vault, board);
	const hold = await holdBoard({
		vault,
		board,
		holder: { id: request.by, kind: "human" },
		revokeClaim: true,
		...(request.signal !== undefined ? { signal: request.signal } : {}),
	});
	if (hold.created) {
		releaseHold(vault, board, hold.holder.id);
	}
	return standing?.kind === "agent" && standing.claimed ? standing : null;
}

/**
 * Why a claim ended, as the opening of the refusal its agent is told once.
 *
 * Only a take-back names a person: a claim that ended any other way says what
 * this server found where its lease should have been.
 * @param lost The claim that ended.
 * @returns The sentence's opening, without a full stop.
 */
function claimEndReason(lost: ClaimRevocation): string {
	const board = `"${lost.claim.board}"`;
	if (lost.cause === "taken-back") {
		return `The user at the canvas took ${board} back`;
	}
	if (lost.cause === "held-by-another" && lost.by) {
		return `Another writer (${lost.by.kind}, ${lost.by.process}) took the lease on ${board} while this server could not renew it, and holds it now`;
	}
	return `The lease on ${board} was given up or removed by another process, such as a take-back through another server, before this server renewed it`;
}

export {
	type LostClaim,
	claimBoard,
	claimOn,
	claimWriterId,
	releaseClaim,
	takeBackBoard,
	takeClaimRevocation,
};
