import { deliverOne, makeDelivery } from "@/runtime/codex-coordinator-callbacks/lib/deliver";
import type { CallbackDeliveryEvidence } from "@/runtime/codex-coordinator-callbacks/lib/deliver";
import {
	createSettledLedger,
	type RealtimeGeneration,
} from "@/runtime/codex-coordinator-callbacks/lib/settled-ledger";
import { CODEX_SEMANTIC_FRESHNESS_MS } from "@/shared/timing/timing";
import {
	coordinatorCallbackCoalescingKey,
	coordinatorCallbackKey,
	normalizeCoordinatorCallback,
} from "@/runtime/codex-coordinator-callbacks/lib/normalize";
import type {
	CoordinatorCallback,
	CoordinatorCallbackDelivery,
	CoordinatorCallbackDeliveryOutcome,
	CoordinatorCallbackDeliveryReason,
	CoordinatorCallbackOptions,
	CoordinatorCallbacks,
	CoordinatorCallbacksRetainedState,
	CoordinatorCallbackSource,
} from "@/runtime/codex-coordinator-callbacks/lib/contract";

export const CALLBACK_BUFFER_LIMIT = 64;

interface PendingCallback {
	readonly key: string;
	readonly coalescingKey: string;
	readonly callback: CoordinatorCallback;
	readonly evidence: CallbackDeliveryEvidence;
	readonly promise: Promise<CoordinatorCallbackDelivery>;
	readonly resolve: (delivery: CoordinatorCallbackDelivery) => void;
	settled: boolean;
}

/**
 * Freeze one value in place; everything this module hands out is immutable.
 * @param value - The value to freeze.
 * @returns The same value, frozen.
 */
function freeze<T>(value: T): T {
	return Object.freeze(value);
}

/**
 * The delivery record for an event that could not even be normalized into a callback.
 * @param evidence - The ordering and freshness evidence.
 * @returns The frozen delivery record.
 */
function invalidDelivery(evidence: CallbackDeliveryEvidence): CoordinatorCallbackDelivery {
	return makeDelivery(null, evidence, {
		attemptedAtMs: null,
		path: "none",
		outcome: "not_delivered",
		reason: "invalid_callback",
	});
}

/**
 * How many settled deliveries the ledger keeps, refusing a limit that is not a positive whole
 * number rather than silently keeping an unbounded history.
 * @param options - The module options.
 * @returns The ledger limit.
 * @throws {TypeError} When the configured limit is not a positive integer.
 */
function settledLedgerLimitOf(options: CoordinatorCallbackOptions): number {
	const limit = options.settledLedgerLimit ?? CALLBACK_BUFFER_LIMIT;
	if (!Number.isSafeInteger(limit) || limit < 1) {
		throw new TypeError(
			"The coordinator callback settled ledger limit must be a positive integer.",
		);
	}
	return limit;
}

/**
 * Subscribe to every source of callbacks. If any subscription fails, the ones already made are
 * undone before the failure travels, so a half-installed module is never left behind.
 * @param options - The module options carrying the source ports.
 * @param enqueue - The step each source event is handed to.
 * @returns The cleanups, in subscription order.
 */
function subscribeSources(
	options: CoordinatorCallbackOptions,
	enqueue: (event: CoordinatorCallbackSource) => Promise<CoordinatorCallbackDelivery>,
): Array<() => void> {
	const cleanups: Array<() => void> = [];
	try {
		cleanups.push(options.operations.subscribe((event) => void enqueue(event)));
		cleanups.push(options.semantic.subscribeSettledChange((event) => void enqueue(event)));
		cleanups.push(options.semantic.subscribePaneFocus((event) => void enqueue(event)));
		cleanups.push(options.semantic.subscribePaneSelection((event) => void enqueue(event)));
	} catch (error) {
		for (const cleanup of cleanups) {
			try {
				cleanup();
			} catch {
				/* Preserve the registration failure. */
			}
		}
		throw error;
	}
	return cleanups;
}

/**
 * The freshness a semantic callback carries; a callback of any other kind has none, and is fresh
 * from the moment it arrives instead.
 * @param callback - The normalized callback, or null when normalization failed.
 * @returns The semantic freshness fields, or null.
 */
function semanticFreshnessOf(
	callback: CoordinatorCallback | null,
): { readonly capturedAtMs: number; readonly freshUntilMs: number } | null {
	return callback?.kind === "semantic" ? callback.semantic : null;
}

/**
 * Build the module that turns workhorse and semantic events into coordinator callbacks and
 * delivers each one at most once, in source order, down a single path. Callbacks with the same
 * identity share one delivery; a newer callback that supersedes a pending one replaces it in
 * place; and everything the buffer cannot hold settles as not delivered with the reason why.
 * @param options - The host authorities, source ports, delivery ports and clock.
 * @returns The callbacks module.
 */
export function createCodexCoordinatorCallbacks(
	options: CoordinatorCallbackOptions,
): CoordinatorCallbacks {
	const pending: PendingCallback[] = [];
	const pendingByKey = new Map<string, PendingCallback>();
	const settled = createSettledLedger(settledLedgerLimitOf(options));
	let disposed = false;
	let draining = false;
	let drainScheduled = false;
	let drainTail: Promise<void> = Promise.resolve();
	let nextSourceOrder = 0;
	const now = options.now ?? Date.now;

	/**
	 * Stamp one event with its arrival order and freshness window. A semantic callback keeps the
	 * time the person's gesture was captured; anything else is fresh from now.
	 * @param callback - The normalized callback, or null when normalization failed.
	 * @returns The frozen evidence.
	 */
	const captureEvidence = (callback: CoordinatorCallback | null): CallbackDeliveryEvidence => {
		const semantic = semanticFreshnessOf(callback);
		const capturedAtMs = semantic === null ? now() : semantic.capturedAtMs;
		return Object.freeze({
			sourceOrder: nextSourceOrder++,
			capturedAtMs,
			freshUntilMs:
				semantic === null ? capturedAtMs + CODEX_SEMANTIC_FRESHNESS_MS : semantic.freshUntilMs,
		});
	};

	/**
	 * Settle one pending callback exactly once and remember its delivery, so a repeat of the same
	 * callback is answered from the ledger rather than delivered again.
	 * @param entry - The pending callback.
	 * @param delivery - How it settled.
	 */
	const settle = (entry: PendingCallback, delivery: CoordinatorCallbackDelivery): void => {
		if (entry.settled) {
			return;
		}
		entry.settled = true;
		pendingByKey.delete(entry.key);
		settled.record(entry.key, delivery);
		options.onSettled?.();
		entry.resolve(delivery);
	};

	/**
	 * Settle a callback that was never attempted, naming why.
	 * @param entry - The pending callback.
	 * @param outcome - The outcome to record.
	 * @param reason - Why nothing was attempted.
	 */
	const settleWithoutAttempt = (
		entry: PendingCallback,
		outcome: CoordinatorCallbackDeliveryOutcome,
		reason: CoordinatorCallbackDeliveryReason,
	): void => {
		settle(
			entry,
			makeDelivery(entry.callback, entry.evidence, {
				attemptedAtMs: null,
				path: "none",
				outcome,
				reason,
			}),
		);
	};

	/**
	 * Deliver one callback, turning a delivery step that threw into a refusal rather than letting
	 * it stop the queue.
	 * @param entry - The pending callback.
	 * @returns Its delivery record.
	 */
	const deliverEntry = async (entry: PendingCallback): Promise<CoordinatorCallbackDelivery> => {
		try {
			return await deliverOne(entry.callback, options, () => disposed, entry.evidence);
		} catch {
			return makeDelivery(entry.callback, entry.evidence, {
				attemptedAtMs: null,
				path: "none",
				outcome: "not_delivered",
				reason: "invalid_callback",
			});
		}
	};

	/**
	 * Deliver the queue one callback at a time, in order. The awaits are sequential on purpose:
	 * two callbacks must never be in flight on the same coordinator at once, and each one's
	 * authority is re-checked against a host that the previous delivery may have changed.
	 */
	const drain = async (): Promise<void> => {
		if (draining) {
			return;
		}
		draining = true;
		try {
			for (let entry = pending.shift(); entry !== undefined; entry = pending.shift()) {
				if (!entry.settled) {
					// oxlint-disable-next-line no-await-in-loop -- one callback is delivered at a time by contract: deliveries are ordered, and each re-checks authority the previous delivery may have changed
					settle(entry, await deliverEntry(entry));
				}
			}
		} finally {
			draining = false;
			if (pending.length > 0 && !disposed) {
				schedule();
			}
		}
	};

	/**
	 * Ask for a drain, at most one at a time, on a tail that `flush` can be awaited on.
	 */
	function schedule(): void {
		if (draining || drainScheduled || disposed) {
			return;
		}
		drainScheduled = true;
		drainTail = drainTail.then(() => {
			drainScheduled = false;
			return drain();
		});
	}

	/**
	 * Normalize one source event against the host's current link and voice generation.
	 * @param event - The source event.
	 * @returns The callback, or null when there is no link or the event cannot be normalized.
	 */
	const normalizeOrNull = (event: CoordinatorCallbackSource): CoordinatorCallback | null => {
		try {
			const link = options.currentWorkhorseLink();
			return link === null
				? null
				: normalizeCoordinatorCallback(event, link, options.currentRealtimeGeneration());
		} catch {
			return null;
		}
	};

	/**
	 * Put one callback in the queue, in place of the pending callback it supersedes when there is
	 * one, and drop the oldest callbacks the buffer can no longer hold.
	 * @param entry - The pending callback to queue.
	 */
	const insertPending = (entry: PendingCallback): void => {
		const index = pending.findIndex((candidate) => candidate.coalescingKey === entry.coalescingKey);
		if (index >= 0) {
			const [replaced] = pending.splice(index, 1);
			if (replaced !== undefined) {
				settleWithoutAttempt(replaced, "not_delivered", "coalesced");
			}
			pending.splice(index, 0, entry);
		} else {
			pending.push(entry);
		}
		pendingByKey.set(entry.key, entry);
		while (pending.length > CALLBACK_BUFFER_LIMIT) {
			const dropped = pending.shift();
			if (dropped !== undefined) {
				settleWithoutAttempt(dropped, "not_delivered", "buffer_overflow");
			}
		}
	};

	/**
	 * Take one source event and promise how it settles. The same callback asked for twice gets
	 * the same promise, or the delivery already in the ledger, so nothing is delivered twice.
	 * @param event - The source event.
	 * @returns How the callback settled.
	 */
	const enqueue = (event: CoordinatorCallbackSource): Promise<CoordinatorCallbackDelivery> => {
		const callback = normalizeOrNull(event);
		if (callback === null) {
			return Promise.resolve(invalidDelivery(captureEvidence(null)));
		}
		const evidence = captureEvidence(callback);
		if (disposed) {
			return Promise.resolve(
				makeDelivery(callback, evidence, {
					attemptedAtMs: null,
					path: "none",
					outcome: "not_delivered",
					reason: "disposed",
				}),
			);
		}
		const key = coordinatorCallbackKey(callback);
		const existing = pendingByKey.get(key);
		if (existing !== undefined) {
			return existing.promise;
		}
		const recorded = settled.get(key);
		if (recorded !== undefined) {
			return Promise.resolve(recorded);
		}

		let resolve!: (delivery: CoordinatorCallbackDelivery) => void;
		const promise = new Promise<CoordinatorCallbackDelivery>((settlePromise) => {
			resolve = settlePromise;
		});
		insertPending({
			key,
			coalescingKey: coordinatorCallbackCoalescingKey(callback),
			callback,
			evidence,
			promise,
			resolve,
			settled: false,
		});
		schedule();
		return promise;
	};

	const cleanups = subscribeSources(options, enqueue);

	return freeze({
		enqueue,
		/**
		 * Wait for every scheduled drain to finish.
		 * @returns The drain tail.
		 */
		flush: () => drainTail,
		/**
		 * Every settled delivery still in the ledger, oldest first.
		 * @returns The frozen deliveries.
		 */
		inspect: () => settled.list(),
		/**
		 * What one voice generation heard: the deliveries still held for it, and how many earlier
		 * ones have aged out of the ledger.
		 * @param generation - The generation being asked about.
		 * @returns Its deliveries and the count of omitted earlier ones.
		 */
		inspectHistory: (generation: RealtimeGeneration) => settled.historyFor(generation),
		/**
		 * The settled delivery for one source event, if that event has already settled.
		 * @param event - The source event.
		 * @returns Its delivery, or undefined when it has not settled or cannot be normalized.
		 */
		get: (event: CoordinatorCallbackSource) => {
			const callback = normalizeOrNull(event);
			return callback === null ? undefined : settled.get(coordinatorCallbackKey(callback));
		},
		/**
		 * How many callbacks are waiting to be delivered.
		 * @returns The queue length.
		 */
		pendingCount: () => pending.length,
		/**
		 * Stop for good: unsubscribe from every source and settle everything still queued as not
		 * delivered. A cleanup that throws cannot reopen delivery or change a settled outcome.
		 */
		dispose: () => {
			if (disposed) {
				return;
			}
			disposed = true;
			for (const cleanup of cleanups) {
				try {
					cleanup();
				} catch {
					/* Source cleanup cannot reopen delivery or alter settled outcomes. */
				}
			}
			for (const entry of pending.splice(0)) {
				settleWithoutAttempt(entry, "not_delivered", "disposed");
			}
		},
	});
}

/**
 * Install the callbacks module once for a host: a second install returns the module already
 * retained, so two callers can never subscribe two modules to the same sources.
 * @param retained - Where the host keeps its module.
 * @param options - The module options, used only on the first install.
 * @returns The retained module.
 */
export function installCodexCoordinatorCallbacks(
	retained: CoordinatorCallbacksRetainedState,
	options: CoordinatorCallbackOptions,
): CoordinatorCallbacks {
	if (retained.current !== null) {
		return retained.current;
	}
	const callbacks = createCodexCoordinatorCallbacks(options);
	retained.current = callbacks;
	return callbacks;
}

export {
	coordinatorCallbackKey,
	normalizeCoordinatorCallback,
} from "@/runtime/codex-coordinator-callbacks/lib/normalize";
