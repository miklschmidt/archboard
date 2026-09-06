// The board's mutex, from the pane's side (ADR 0016, ADR 0022).
//
// Taking it is the pane's job, on the leading edge of a content edit: the
// change is already local, and the report follows. Renewal is the same call,
// rate-limited to `LOCK_RENEW_MS` so a drag costs one request per second and
// a long gesture's lease stays alive. Releasing happens once the gesture is
// over and its write has landed. The person's edit is optimistic and the note
// decides: a hold refused because an agent's claim stands withdraws the edit,
// and the pane shows the board as the note holds it. A hold refused by a
// passing write, or one that failed on the wire, is retried while content is
// pending, and the edit stays visible meanwhile.

import { LOCK_RENEW_MS } from "@/shared/timing/timing";
import type { HoldReply } from "@/ui/canvas/api";
import type { HoldRenewalDeadline } from "@/ui/canvas/canvas-deadlines";
import {
	ownsHoldAttempt,
	scheduleRenewalForOwnedHoldAttempt,
	type HoldAttempt,
} from "@/ui/canvas/hold-attempt";
import { agentClaim, type LockHolder } from "@/ui/types";

/** What the keeper needs from its pane. */
interface HoldKeeperOptions {
	clientId: string;
	/** The board this pane holds now, or null. */
	boardKey: () => string | null;
	/** Whether the person's edits have not all reached the server yet. */
	pending: () => boolean;
	deadline: HoldRenewalDeadline;
	holdBoard: (board: string, clientId: string) => Promise<HoldReply>;
	releaseBoard: (board: string | null, clientId: string) => void;
	/** Who holds the board when it is not this pane, or null when it is free or ours. */
	onHolder: (holder: LockHolder | null) => void;
	/** An agent's claim stands where the person just edited: withdraw the edit (ADR 0022). */
	onClaimRefused: (reply: HoldReply) => void;
	/** The holder assumed until the server says otherwise. */
	unknownHolder: LockHolder;
	now?: () => number;
}

/** One pane's side of the board mutex. */
interface HoldKeeper {
	/** Take the board, or say again that we still have it. */
	takeHold: () => void;
	/** Whether this pane believes it holds the board. */
	holding: () => boolean;
	/** The server said who holds the board; `mine` when it is this pane. */
	learnHolder: (mine: boolean) => void;
	/** Give the board back once every report has settled. */
	releaseIfIdle: (settled: boolean) => void;
	/** The pane stopped looking at its board: release, and invalidate answers in flight. */
	boardLeft: () => void;
	/** A hold recovery ended the gesture: cancel renewal and release. */
	recover: () => void;
	/** The pane is closing. */
	dispose: () => void;
}

/**
 * Keep one pane's human hold on its board.
 * @param options The pane's identity, its api and its deadline.
 * @returns The keeper.
 */
function createHoldKeeper(options: HoldKeeperOptions): HoldKeeper {
	const now = options.now ?? Date.now;
	let holding = false;
	let lastHoldAt = 0;
	let attempt: HoldAttempt | null = null;
	let generation = 0;

	/** Forget the hold and tell the server, when this pane had it. */
	function release(): void {
		if (!holding) {
			return;
		}
		holding = false;
		options.releaseBoard(options.boardKey(), options.clientId);
	}

	/**
	 * Whether an attempt's answer is still about this pane's board.
	 * @param owned The attempt.
	 * @param promise The promise it was made with.
	 * @param target The board it was made for.
	 * @returns True when the answer may be believed.
	 */
	function stillOwned(owned: HoldAttempt, promise: Promise<unknown>, target: string): boolean {
		return ownsHoldAttempt(attempt, owned, promise, generation) && options.boardKey() === target;
	}

	/**
	 * Renew or retry later, while content is still pending on the same board.
	 * @param delayMs How long to wait.
	 * @param target The board the hold is for.
	 */
	function retryOrRenew(delayMs: number, target: string): void {
		if (!options.pending() || options.boardKey() !== target) {
			return;
		}
		options.deadline.schedule(delayMs, takeHold);
	}

	/**
	 * Whether a hold request is already in flight for this board and generation.
	 * @param target The board.
	 * @returns True when the answer is still awaited.
	 */
	function inFlight(target: string): boolean {
		return (
			attempt?.board === target && attempt.generation === generation && attempt.promise !== null
		);
	}

	/**
	 * Ask the server for the board, believing the answer only while it is still ours.
	 * @param target The board.
	 */
	function request(target: string): void {
		const owned: HoldAttempt = { board: target, generation, promise: null };
		const promise = options
			.holdBoard(target, options.clientId)
			.then((reply) => {
				// A board switch landed while this was in flight: the answer is about
				// a board this pane is no longer holding.
				if (stillOwned(owned, promise, target)) {
					holding = reply.held;
					options.onHolder(reply.held ? null : (reply.holder ?? options.unknownHolder));
					// A claim is not waited out: the board is read-only to people while
					// it stands, and what was drawn before the pane knew is withdrawn.
					if (!reply.held && agentClaim(reply.holder) !== null) {
						options.onClaimRefused(reply);
					}
				}
				return reply;
			})
			.catch(() => {
				// The wire failed, not the note: the local edit remains pending and
				// the hold is retried while there is content to save.
				if (stillOwned(owned, promise, target)) {
					holding = false;
				}
				return null;
			})
			.finally(() => {
				scheduleRenewalForOwnedHoldAttempt(attempt, owned, promise, generation, () => {
					attempt = null;
					retryOrRenew(LOCK_RENEW_MS, target);
				});
			});
		owned.promise = promise;
		attempt = owned;
	}

	/** Take the board, or say again that we still have it. */
	function takeHold(): void {
		const target = options.boardKey();
		if (target === null || inFlight(target)) {
			return;
		}
		const elapsed = now() - lastHoldAt;
		if (holding && elapsed < LOCK_RENEW_MS) {
			retryOrRenew(LOCK_RENEW_MS - elapsed, target);
			return;
		}
		lastHoldAt = now();
		request(target);
	}

	/**
	 * Give the board back once the gesture is over and its write has landed.
	 * @param settled Whether every report has been answered and nothing waits.
	 */
	function releaseIfIdle(settled: boolean): void {
		if (!holding || !settled) {
			return;
		}
		options.deadline.cancel();
		release();
	}

	/** The pane stopped looking at its board. */
	function boardLeft(): void {
		options.deadline.cancel();
		// Invalidate the attempt by generation rather than erasing its identity.
		// If this board name returns before the old promise settles, the older
		// attempt must remain distinguishable from the new one.
		generation += 1;
		release();
	}

	/** A hold recovery ended the gesture. */
	function recover(): void {
		options.deadline.cancel();
		generation += 1;
		holding = false;
		options.releaseBoard(options.boardKey(), options.clientId);
	}

	/** The pane is closing. */
	function dispose(): void {
		options.deadline.cancel();
		generation += 1;
		attempt = null;
		release();
	}

	/**
	 * Whether this pane believes it holds the board.
	 * @returns True while held.
	 */
	function isHolding(): boolean {
		return holding;
	}

	/**
	 * The server said who holds the board.
	 * @param mine Whether it is this pane.
	 */
	function learnHolder(mine: boolean): void {
		holding = mine;
	}

	return {
		takeHold,
		holding: isHolding,
		learnHolder,
		releaseIfIdle,
		boardLeft,
		recover,
		dispose,
	};
}

export { createHoldKeeper, type HoldKeeper, type HoldKeeperOptions };
