import { deliverOne, makeDelivery } from "./deliver.js";
import type { CallbackDeliveryEvidence } from "./deliver.js";
import { CODEX_SEMANTIC_FRESHNESS_MS } from "../../../shared/timing/timing.js";
import {
	coordinatorCallbackCoalescingKey,
	coordinatorCallbackKey,
	normalizeCoordinatorCallback,
} from "./normalize.js";
import type {
	CoordinatorCallback,
	CoordinatorCallbackDelivery,
	CoordinatorCallbackDeliveryOutcome,
	CoordinatorCallbackDeliveryReason,
	CoordinatorCallbackOptions,
	CoordinatorCallbacks,
	CoordinatorCallbacksRetainedState,
	CoordinatorCallbackSource,
} from "./contract.js";

export const CALLBACK_BUFFER_LIMIT = 64;

function realtimeGenerationKey(
	generation: NonNullable<CoordinatorCallback["correlation"]["realtimeGeneration"]>,
): string {
	return JSON.stringify([
		generation.childId,
		generation.epoch,
		generation.coordinatorThreadId,
		generation.wireSessionId,
		generation.browserSessionId,
		generation.browserCorrelationId,
	]);
}

interface PendingCallback {
	readonly key: string;
	readonly coalescingKey: string;
	readonly callback: CoordinatorCallback;
	readonly evidence: CallbackDeliveryEvidence;
	readonly promise: Promise<CoordinatorCallbackDelivery>;
	readonly resolve: (delivery: CoordinatorCallbackDelivery) => void;
	settled: boolean;
}

function freeze<T>(value: T): T {
	return Object.freeze(value);
}

function invalidDelivery(evidence: CallbackDeliveryEvidence): CoordinatorCallbackDelivery {
	return makeDelivery(null, evidence, {
		attemptedAtMs: null,
		path: "none",
		outcome: "not_delivered",
		reason: "invalid_callback",
	});
}

export function createCodexCoordinatorCallbacks(
	options: CoordinatorCallbackOptions,
): CoordinatorCallbacks {
	const pending: PendingCallback[] = [];
	const pendingByKey = new Map<string, PendingCallback>();
	const settledByKey = new Map<string, CoordinatorCallbackDelivery>();
	const settledOrder: string[] = [];
	const omittedPrefixes = new Map<string, number>();
	const omittedPrefixOrder: string[] = [];
	let disposed = false;
	let draining = false;
	let drainScheduled = false;
	let drainTail: Promise<void> = Promise.resolve();
	let nextSourceOrder = 0;
	const now = options.now ?? Date.now;
	const settledLedgerLimit = options.settledLedgerLimit ?? CALLBACK_BUFFER_LIMIT;
	if (!Number.isSafeInteger(settledLedgerLimit) || settledLedgerLimit < 1) {
		throw new TypeError(
			"The coordinator callback settled ledger limit must be a positive integer.",
		);
	}
	const captureEvidence = (callback: CoordinatorCallback | null): CallbackDeliveryEvidence => {
		const capturedAtMs = callback?.kind === "semantic" ? callback.semantic.capturedAtMs : now();
		return Object.freeze({
			sourceOrder: nextSourceOrder++,
			capturedAtMs,
			freshUntilMs:
				callback?.kind === "semantic"
					? callback.semantic.freshUntilMs
					: capturedAtMs + CODEX_SEMANTIC_FRESHNESS_MS,
		});
	};
	const incrementOmittedPrefix = (
		generation: NonNullable<CoordinatorCallback["correlation"]["realtimeGeneration"]>,
	): void => {
		const key = realtimeGenerationKey(generation);
		if (!omittedPrefixes.has(key)) {
			omittedPrefixOrder.push(key);
		}
		omittedPrefixes.set(key, (omittedPrefixes.get(key) ?? 0) + 1);
		while (omittedPrefixOrder.length > settledLedgerLimit) {
			const expired = omittedPrefixOrder.shift();
			if (expired !== undefined) {
				omittedPrefixes.delete(expired);
			}
		}
	};

	const settle = (entry: PendingCallback, delivery: CoordinatorCallbackDelivery): void => {
		if (entry.settled) {
			return;
		}
		entry.settled = true;
		pendingByKey.delete(entry.key);
		settledByKey.set(entry.key, delivery);
		settledOrder.push(entry.key);
		while (settledOrder.length > settledLedgerLimit) {
			const expiredKey = settledOrder.shift();
			if (expiredKey === undefined) {
				continue;
			}
			const expired = settledByKey.get(expiredKey);
			settledByKey.delete(expiredKey);
			const generation = expired?.callback?.correlation.realtimeGeneration;
			if (generation !== null && generation !== undefined) {
				incrementOmittedPrefix(generation);
			}
		}
		options.onSettled?.();
		entry.resolve(delivery);
	};

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

	const drain = async (): Promise<void> => {
		if (draining) {
			return;
		}
		draining = true;
		try {
			while (pending.length > 0) {
				const entry = pending.shift();
				if (entry === undefined || entry.settled) {
					continue;
				}
				let delivery: CoordinatorCallbackDelivery;
				try {
					delivery = await deliverOne(entry.callback, options, () => disposed, entry.evidence);
				} catch {
					delivery = makeDelivery(entry.callback, entry.evidence, {
						attemptedAtMs: null,
						path: "none",
						outcome: "not_delivered",
						reason: "invalid_callback",
					});
				}
				settle(entry, delivery);
			}
		} finally {
			draining = false;
			if (pending.length > 0 && !disposed) {
				schedule();
			}
		}
	};

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

	const enqueue = (event: CoordinatorCallbackSource): Promise<CoordinatorCallbackDelivery> => {
		let callback: CoordinatorCallback;
		try {
			const link = options.currentWorkhorseLink();
			if (link === null) {
				return Promise.resolve(invalidDelivery(captureEvidence(null)));
			}
			callback = normalizeCoordinatorCallback(event, link, options.currentRealtimeGeneration());
		} catch {
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
		const settled = settledByKey.get(key);
		if (settled !== undefined) {
			return Promise.resolve(settled);
		}

		let resolve!: (delivery: CoordinatorCallbackDelivery) => void;
		const promise = new Promise<CoordinatorCallbackDelivery>((settlePromise) => {
			resolve = settlePromise;
		});
		const entry: PendingCallback = {
			key,
			coalescingKey: coordinatorCallbackCoalescingKey(callback),
			callback,
			evidence,
			promise,
			resolve,
			settled: false,
		};
		const replacement = pending.find(
			(candidate) => candidate.coalescingKey === entry.coalescingKey,
		);
		if (replacement !== undefined) {
			const index = pending.indexOf(replacement);
			if (index >= 0) {
				pending.splice(index, 1);
			}
			settleWithoutAttempt(replacement, "not_delivered", "coalesced");
			pending.splice(Math.max(index, 0), 0, entry);
		} else {
			pending.push(entry);
		}
		pendingByKey.set(key, entry);
		while (pending.length > CALLBACK_BUFFER_LIMIT) {
			const dropped = pending.shift();
			if (dropped !== undefined) {
				settleWithoutAttempt(dropped, "not_delivered", "buffer_overflow");
			}
		}
		schedule();
		return promise;
	};

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

	return freeze({
		enqueue,
		flush: () => drainTail,
		inspect: () =>
			freeze(
				settledOrder.flatMap((key) => {
					const delivery = settledByKey.get(key);
					return delivery === undefined ? [] : [delivery];
				}),
			),
		inspectHistory: (generation) => {
			const generationKey = realtimeGenerationKey(generation);
			return freeze({
				deliveries: freeze(
					settledOrder.flatMap((key) => {
						const delivery = settledByKey.get(key);
						if (delivery === undefined) {
							return [];
						}
						const captured = delivery?.callback?.correlation.realtimeGeneration;
						return captured !== null &&
							captured !== undefined &&
							realtimeGenerationKey(captured) === generationKey
							? [delivery]
							: [];
					}),
				),
				omittedPrefixCount: omittedPrefixes.get(generationKey) ?? 0,
			});
		},
		get: (event: CoordinatorCallbackSource) => {
			try {
				const link = options.currentWorkhorseLink();
				if (link === null) {
					return undefined;
				}
				return settledByKey.get(
					coordinatorCallbackKey(
						normalizeCoordinatorCallback(event, link, options.currentRealtimeGeneration()),
					),
				);
			} catch {
				return undefined;
			}
		},
		pendingCount: () => pending.length,
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

export { coordinatorCallbackKey, normalizeCoordinatorCallback } from "./normalize.js";
