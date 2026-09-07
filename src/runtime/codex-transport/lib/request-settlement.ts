import { CODEX_APP_SERVER_CAPACITY } from "@/shared/codex-app-server-capacity";
import {
	CodexTransportRemoteError,
	CodexTransportRequestError,
	type CodexRemoteError,
	type CodexRequestFailureReason,
} from "@/runtime/codex-transport/lib/errors";
import type { PendingRequest, RequestTombstone } from "@/runtime/codex-transport/lib/internals";
import { cloneAndFreeze } from "@/runtime/codex-transport/lib/public-values";

interface RequestSettlementOptions {
	readonly pendingRequests: Map<string, PendingRequest>;
	readonly tombstones: Map<string, RequestTombstone>;
}

interface RequestSettlement {
	readonly settleFailure: (pending: PendingRequest, reason: CodexRequestFailureReason) => void;
	readonly settleDelivered: (pending: PendingRequest, result: unknown) => void;
	readonly settleRemoteError: (pending: PendingRequest, rpcError: CodexRemoteError) => void;
}

/**
 * The tombstone that records how a request settled, so a late response can be classified.
 * @param pending The settled request.
 * @param settlement How it settled.
 * @param retryEligible Whether the caller may retry it.
 * @param reason The failure reason, for unsuccessful settlements.
 * @returns The tombstone.
 */
function tombstoneOf(
	pending: PendingRequest,
	settlement: RequestTombstone["settlement"],
	retryEligible: boolean,
	reason?: CodexRequestFailureReason,
): RequestTombstone {
	return {
		key: pending.key,
		wireId: pending.wireId,
		method: pending.method,
		correlation: pending.correlation,
		retryEligible,
		accepted: pending.accepted,
		settlement,
		...(reason === undefined ? {} : { reason }),
	};
}

/**
 * Creates the three ways a pending request settles, each of which removes it from the
 * pending table exactly once and leaves a tombstone behind.
 * @param options The pending and tombstone tables.
 * @returns The settlement operations.
 */
function createRequestSettlement(options: RequestSettlementOptions): RequestSettlement {
	/**
	 * Retains a request tombstone, evicting the oldest past the retention bound.
	 * @param tombstone The tombstone.
	 */
	const retainTombstone = (tombstone: RequestTombstone): void => {
		if (options.tombstones.size >= CODEX_APP_SERVER_CAPACITY.retention.requestTombstones) {
			const oldest = options.tombstones.keys().next().value;
			if (oldest !== undefined) {
				options.tombstones.delete(oldest);
			}
		}
		options.tombstones.set(tombstone.key, tombstone);
	};

	/**
	 * Takes a request out of the pending table and disarms its timer and abort listener.
	 * @param pending The request.
	 * @returns False when the request was no longer pending, so it must not settle again.
	 */
	const removePending = (pending: PendingRequest): boolean => {
		if (options.pendingRequests.get(pending.key) !== pending) {
			return false;
		}
		options.pendingRequests.delete(pending.key);
		pending.settled = true;
		if (pending.timer !== undefined) {
			clearTimeout(pending.timer);
		}
		if (pending.signal && pending.abortListener) {
			pending.signal.removeEventListener("abort", pending.abortListener);
		}
		return true;
	};

	/**
	 * Settles a request without a Codex answer, recording whether Codex may have seen it.
	 * @param pending The request.
	 * @param reason Why it failed.
	 */
	const settleFailure = (pending: PendingRequest, reason: CodexRequestFailureReason): void => {
		if (!removePending(pending)) {
			return;
		}
		const outcome = pending.accepted ? "outcome_unknown" : "not_delivered";
		const retryEligible = outcome === "not_delivered" || pending.retryEligible;
		retainTombstone(tombstoneOf(pending, outcome, retryEligible, reason));
		pending.reject(
			new CodexTransportRequestError({
				method: pending.method,
				correlation: pending.correlation,
				outcome,
				reason,
				accepted: pending.accepted,
				retryEligible,
			}),
		);
	};

	/**
	 * Settles a request with its decoded result.
	 * @param pending The request.
	 * @param result The decoded result.
	 */
	const settleDelivered = (pending: PendingRequest, result: unknown): void => {
		if (!removePending(pending)) {
			return;
		}
		retainTombstone(tombstoneOf(pending, "delivered", pending.retryEligible));
		pending.resolve(
			Object.freeze({
				method: pending.method,
				correlation: pending.correlation,
				result: cloneAndFreeze(result),
			}),
		);
	};

	/**
	 * Settles a request with the JSON-RPC error Codex answered.
	 * @param pending The request.
	 * @param rpcError The error as received.
	 */
	const settleRemoteError = (pending: PendingRequest, rpcError: CodexRemoteError): void => {
		if (!removePending(pending)) {
			return;
		}
		retainTombstone(tombstoneOf(pending, "delivered", pending.retryEligible));
		pending.reject(
			new CodexTransportRemoteError({
				method: pending.method,
				correlation: pending.correlation,
				rpcError,
			}),
		);
	};

	return Object.freeze({ settleFailure, settleDelivered, settleRemoteError });
}

export { createRequestSettlement };
export type { RequestSettlement, RequestSettlementOptions };
