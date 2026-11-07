import { CLAIM_MS } from "@archboard/timing";
import { modelMemoryKey, normalizePaneKey } from "#runtime/store/legacy-address.ts";
import { holdModel } from "#runtime/lock/store/acquisition.ts";
import {
	claimOf,
	dropClaim,
	liveClaim,
	processClaims,
	processRevocations,
	startRenewing,
} from "#runtime/lock/store/claim-state.ts";
import type { Claim, ClaimEntry, ClaimRevocation } from "#runtime/lock/store/contracts.ts";
import { newToken, releaseHold } from "#runtime/lock/store/lease-state.ts";

/** A claim this server lost, with the opening of the sentence its agent is told once. */
type LostClaim = ClaimRevocation & {
	/** Why the claim ended, without a full stop, such as `The user at the canvas took "payments" back`. */
	readonly ended: string;
};

/**
 * Claim a model for an agent campaign, or extend this server's existing claim.
 * @param request Model, reason, bounded campaign duration, wait, and cancellation evidence.
 * @returns The active claim and whether this call created its holder identity.
 */
async function claimModel(
	request: Readonly<{
		vault: string;
		model: string;
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
	const model = normalizePaneKey(request.model);
	const forMs = campaignLength(request.forMs);
	const existing = liveClaim(request.vault, model);
	const id = existing === null ? `claim-${newToken()}` : existing.holder.id;
	const hold = await holdModel({
		vault: request.vault,
		model,
		holder: { id, kind: "agent", reason: request.reason, claimed: true },
		leaseMs: CLAIM_MS.lease,
		...(request.waitMs !== undefined ? { waitMs: request.waitMs } : {}),
		...(request.signal !== undefined ? { signal: request.signal } : {}),
	});
	const entry: ClaimEntry = {
		vault: request.vault,
		model,
		holder: hold.holder,
		expires: Date.now() + forMs,
		timer: existing === null ? null : existing.timer,
	};
	processClaims.set(modelMemoryKey(request.vault, model), entry);
	entry.timer ??= startRenewing(request.vault, model);
	return { claim: claimOf(model, entry), created: existing === null };
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
 * @param vault The vault root the legacy board lives in.
 * @param model Legacy board key or alias.
 * @returns The released process claim, or null when this server retained no claim for the legacy board.
 */
function releaseClaim(vault: string, model: string): Claim | null {
	// A late release after expiry or take-back is harmless and reports null.
	const key = normalizePaneKey(model);
	const entry = processClaims.get(modelMemoryKey(vault, key));
	if (entry === undefined) {
		return null;
	}
	dropClaim(entry);
	releaseHold(entry.vault, key, entry.holder.id);
	return claimOf(key, entry);
}

/**
 * Read this server's live claim, expiring it first when its campaign deadline passed.
 * @param vault The vault root the legacy board lives in.
 * @param model Legacy board key or alias.
 * @returns The live claim, or null.
 */
function claimOn(vault: string, model: string): Claim | null {
	const key = normalizePaneKey(model);
	const entry = liveClaim(vault, key);
	return entry === null ? null : claimOf(key, entry);
}

/**
 * Resolve the holder identity an agent write should reenter for this legacy board.
 * @param vault The vault root the legacy board lives in.
 * @param model Legacy board key or alias.
 * @returns The live claim holder id, or null for an ordinary per-write acquisition.
 */
function claimWriterId(vault: string, model: string): string | null {
	// The server supplies this id across command-lived agent requests. If the
	// vault lease was lost, ordinary acquisition must not silently rebuild the
	// claim; the renewal/revocation owner resolves that state.
	const entry = liveClaim(vault, normalizePaneKey(model));
	return entry === null ? null : entry.holder.id;
}

/**
 * Consume the one-shot notice that this server's claim was taken back.
 * @param vault The vault root the legacy board lives in.
 * @param model Legacy board key or alias.
 * @returns The revocation and why it ended, once, or null after it has been consumed.
 */
function takeClaimRevocation(vault: string, model: string): LostClaim | null {
	// Told once: the next agent act learns what was interrupted and that nothing
	// was undone; after that, work is ordinary rather than permanently refused.
	const key = modelMemoryKey(vault, model);
	const lost = processRevocations.get(key);
	if (lost === undefined) {
		return null;
	}
	processRevocations.delete(key);
	return { ...lost, ended: claimEndReason(lost) };
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
	const model = `"${lost.claim.model}"`;
	if (lost.cause === "taken-back") {
		return `The user at the canvas took ${model} back`;
	}
	if (lost.cause === "held-by-another" && lost.by) {
		return `Another writer (${lost.by.kind}, ${lost.by.process}) took the lease on ${model} while this server could not renew it, and holds it now`;
	}
	return `The lease on ${model} was given up or removed by another process, such as a take-back through another server, before this server renewed it`;
}

export { claimModel, claimOn, claimWriterId, releaseClaim, takeClaimRevocation };
