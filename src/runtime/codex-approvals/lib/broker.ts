import type {
	ApprovalBinding,
	ApprovalOutcome,
	ApprovalRequest,
	ApprovalResolveInput,
	ApprovalResponse,
	ApprovalSettlement,
	ApprovalSnapshot,
	ApprovalTerminalDelivery,
	CodexApprovalBroker,
	CodexApprovalBrokerOptions,
	TerminalApprovalState,
} from "@/runtime/codex-approvals/lib/contract";
import { CodexApprovalError as ApprovalError } from "@/runtime/codex-approvals/lib/contract";
import type { ApprovalRecord, ChildExit } from "@/runtime/codex-approvals/lib/approval-record";
import {
	approvalDecision,
	belongsToChild,
	settlementResult,
	snapshotOf,
	stagedRecord,
	toError,
} from "@/runtime/codex-approvals/lib/approval-record";
import { createApprovalViews } from "@/runtime/codex-approvals/lib/approval-views";
import {
	applyOutcomeReason,
	attemptWrite,
	bindingEvidenceMatches,
	claimTerminal,
	encodeServerResponse,
	provenSettlement,
} from "@/runtime/codex-approvals/lib/settlement";
import {
	completeBinding,
	normalizeApprovalRequest,
	rebindApprovalRequest,
} from "@/runtime/codex-approvals/lib/request";
import {
	classifyResponseFailure,
	fallbackResponse,
	validateApprovalResponse,
} from "@/runtime/codex-approvals/lib/response";
import { CODEX_APPROVAL_EXPIRY_MS } from "@/shared/timing/timing";
import type { JsonRpcRequestId } from "@/shared/codex-workbench-identity";
import type { TransportServerRequest } from "@/runtime/codex-transport/server-requests";

/**
 * Build the broker that owns every approval Codex asks for. It stages each request, publishes it, answers it exactly once, and settles it terminally: the answer is proven against the binding it was made under, and an approval that cannot be proven falls back to the narrowest response its family has rather than granting anything.
 * @param options - The transport, identity authority, binding source, clock and callbacks.
 * @returns The broker.
 */
export function createCodexApprovalBroker(
	options: CodexApprovalBrokerOptions,
): CodexApprovalBroker {
	const identity = options.identity;
	const now = options.now ?? Date.now;
	const records = new Map<JsonRpcRequestId, ApprovalRecord>();
	const unsubscribers: Array<() => void> = [];
	let disposed = false;

	/**
	 * Report a failure through the observer, which must never turn a safe refusal into an unhandled error.
	 * @param error - Whatever was thrown.
	 * @param request - The request it happened on, when there is one.
	 */
	const reportError = (error: unknown, request?: TransportServerRequest): void => {
		try {
			options.onError?.(toError(error), request);
		} catch {
			// Observability must not turn a safe refusal into an unhandled listener error.
		}
	};

	/**
	 * Prove a request identity is one this workbench session issued.
	 * @param value - The claimed identity.
	 * @returns The identity.
	 * @throws {ApprovalError} When the identity is not valid here.
	 */
	const requireRequestId = (value: JsonRpcRequestId): JsonRpcRequestId => {
		try {
			return identity.decoder.parseJsonRpcRequestId(value);
		} catch (error) {
			throw new ApprovalError(
				"invalid_identity",
				`The approval request identity is not valid in this workbench session: ${toError(error).message}`,
			);
		}
	};

	/**
	 * The record for one approval, refused when the broker does not know it.
	 * @param value - The claimed request identity.
	 * @returns The record.
	 * @throws {ApprovalError} When the approval is unknown.
	 */
	const requireRecord = (value: JsonRpcRequestId): ApprovalRecord => {
		const requestId = requireRequestId(value);
		const record = records.get(requestId);
		if (record === undefined)
			throw new ApprovalError(
				"unknown_request",
				"The approval request is not known to this broker.",
				requestId,
			);
		return record;
	};

	/**
	 * Publish an approval's snapshot. A listener that throws is reported, not allowed to change the approval.
	 * @param record - The record to publish.
	 */
	const notify = (record: ApprovalRecord): void => {
		try {
			options.onChange?.(snapshotOf(record));
		} catch (error) {
			reportError(error, record.request.request);
		}
	};

	/**
	 * The binding this approval would have right now, or null when it can no longer be built or does not belong to the current child epoch. This is what makes a stale answer detectable.
	 * @param record - The record.
	 * @returns The current binding, or null.
	 */
	const currentBinding = (record: ApprovalRecord): ApprovalBinding | null => {
		try {
			const input = options.getCurrentBinding?.(record.request) ?? record.request.binding;
			const binding = completeBinding(record.request, input);
			identity.validator.assertCurrentEpoch(binding.child, binding.epoch);
			return binding;
		} catch {
			return null;
		}
	};

	const views = createApprovalViews({
		records,
		requireRequestId,
		requireRecord,
		currentBinding,
		getSpokenEligibilityFacts: options.getSpokenEligibilityFacts,
	});

	/**
	 * Settle one approval exactly once and send the answer to Codex. The binding is re-checked immediately before the write: an approval whose target or effect changed is answered with its family's fallback instead, because the person answered a different question. Whatever the write does, the settlement records what it proved about delivery.
	 * @param record - The record being settled.
	 * @param requestedState - The state the caller asked for.
	 * @param reason - Why it is being settled.
	 * @param response - The answer to send.
	 * @param terminalDelivery - Whether this settlement carries an authored answer.
	 * @returns How the approval settled.
	 */
	const settleTransport = (
		record: ApprovalRecord,
		requestedState: TerminalApprovalState,
		reason: string,
		response: ApprovalResponse,
		terminalDelivery: Exclude<ApprovalTerminalDelivery, null>,
	): Promise<ApprovalSettlement> => {
		if (record.settlementPromise !== undefined) return record.settlementPromise;
		claimTerminal(record, terminalDelivery);

		const {
			state: finalState,
			reason: finalReason,
			response: finalResponse,
		} = provenSettlement(record, currentBinding(record), {
			state: requestedState,
			reason,
			response,
		});
		record.state = finalState;
		record.reason = finalReason;
		record.decision = finalState === "settled" ? approvalDecision(finalResponse) : "cancelled";
		const settlementPromise = new Promise<ApprovalSettlement>((resolve) => {
			record.settlementResolve = resolve;
		});
		record.settlementPromise = settlementPromise;
		if (terminalDelivery === "authored_response") notify(record);

		const encoded = encodeServerResponse(record, finalResponse, finalState);
		if (!encoded.ok) {
			finish("not_delivered", encoded.error);
			return settlementPromise;
		}
		const write = attemptWrite(options.transport, record, encoded.value);
		void write.promise.then(
			() => finish("delivered"),
			(error) => finish(classifyResponseFailure(error, write.attempted), error),
		);
		return settlementPromise;

		/**
		 * Record what the write proved and settle the promise, exactly once.
		 * @param outcome - What the write proved about delivery.
		 * @param error - What the write threw, when it threw.
		 */
		function finish(outcome: ApprovalOutcome, error?: unknown): void {
			if (record.outcome !== null) return;
			record.outcome = outcome;
			record.terminalDelivery = terminalDelivery;
			applyOutcomeReason(record, outcome, finalReason);
			const result = settlementResult(record, outcome, finalReason, error);
			notify(record);
			record.settlementResolve?.(result);
			record.settlementResolve = undefined;
		}
	};

	/**
	 * End an approval nobody answered, sending its family's fallback response.
	 * @param requestId - The approval.
	 * @param state - The terminal state it reached.
	 * @param reason - Why it ended.
	 * @returns How it settled.
	 * @throws {ApprovalError} When the approval is no longer awaiting a decision.
	 */
	const terminal = (
		requestId: JsonRpcRequestId,
		state: TerminalApprovalState,
		reason: string,
	): Promise<ApprovalSettlement> => {
		const record = requireRecord(requestId);
		if (record.settlementPromise !== undefined) return record.settlementPromise;
		if (record.state !== "staged" && record.state !== "pending")
			throw new ApprovalError(
				"invalid_state",
				"The approval is not awaiting a terminal decision.",
				requestId,
			);
		return settleTransport(
			record,
			state,
			reason,
			fallbackResponse(record.request, state),
			"after_publish",
		);
	};

	/**
	 * Prove this broker may stage this request at all.
	 * @param request - The transport request.
	 * @throws {ApprovalError} When the broker is disposed or does not own the request.
	 */
	const assertStageable = (request: TransportServerRequest): void => {
		if (disposed) throw new ApprovalError("disposed", "The approval broker has been disposed.");
		if (request.owner !== "codex-approvals")
			throw new ApprovalError(
				"unsupported_request",
				`The ${request.method} request is owned by ${request.owner}, not codex-approvals.`,
			);
	};

	/**
	 * The snapshot of an already staged request, when this exact request was staged before. A second
	 * request reusing a live JSON-RPC identity is refused: answering it would answer the first one.
	 * @param request - The transport request.
	 * @returns The staged snapshot, or null when the identity is free.
	 * @throws {ApprovalError} When a different request reused a live identity.
	 */
	const existingSnapshot = (request: TransportServerRequest): ApprovalSnapshot | null => {
		const existing = records.get(request.requestId);
		if (existing === undefined) return null;
		if (existing.sourceRequest === request) return snapshotOf(existing);
		throw new ApprovalError(
			"duplicate_request",
			"A different approval request reused an existing JSON-RPC request identity.",
			request.requestId,
		);
	};

	/**
	 * The normalized request, bound to the host's current binding when the host supplies one.
	 * @param request - The transport request.
	 * @returns The normalized request.
	 */
	const normalizedRequest = (request: TransportServerRequest): ApprovalRequest => {
		const provisional = normalizeApprovalRequest(
			identity,
			request,
			now() + CODEX_APPROVAL_EXPIRY_MS,
		);
		const bindingInput = options.getCurrentBinding?.(provisional);
		return bindingInput === undefined
			? provisional
			: rebindApprovalRequest(provisional, bindingInput);
	};

	/**
	 * Expire the approval when nobody has answered it in time. The timer is unreferenced so a
	 * pending approval never keeps the process alive on its own.
	 * @param record - The staged record.
	 * @param normalized - The normalized request, which carries the expiry.
	 */
	const armExpiry = (record: ApprovalRecord, normalized: ApprovalRequest): void => {
		record.timer = setTimeout(
			() => {
				void terminal(
					normalized.requestId,
					"expired",
					"The approval expired before it was resolved.",
				).catch((error) => reportError(error, normalized.request));
			},
			Math.max(0, normalized.expiresAtMs - now()),
		);
		if (typeof record.timer.unref === "function") record.timer.unref();
	};

	/**
	 * Take one approval request from the transport and record it, without publishing it as pending yet. The request is normalized, bound to the host's current binding, given its spoken presentation when it has one, and given the timer that expires it.
	 * @param request - The transport request.
	 * @returns The staged snapshot.
	 */
	const stage = (request: TransportServerRequest): ApprovalSnapshot => {
		assertStageable(request);
		const staged = existingSnapshot(request);
		if (staged !== null) return staged;
		const normalized = normalizedRequest(request);
		const record = stagedRecord(request, normalized);
		records.set(normalized.requestId, record);
		armExpiry(record, normalized);
		notify(record);
		return snapshotOf(record);
	};

	/**
	 * Stage one approval request and publish it as pending in one step, which is what the transport listener does.
	 * @param request - The transport request.
	 * @returns The pending snapshot.
	 */
	const receive = (request: TransportServerRequest): ApprovalSnapshot => {
		const staged = stage(request);
		return pending(staged.requestId);
	};

	/**
	 * Publish a staged approval as pending, so a person can be asked about it.
	 * @param requestId - The approval.
	 * @returns The pending snapshot.
	 * @throws {ApprovalError} When the broker is disposed or the approval is no longer pending.
	 */
	const pending = (requestId: JsonRpcRequestId): ApprovalSnapshot => {
		if (disposed) throw new ApprovalError("disposed", "The approval broker has been disposed.");
		const record = requireRecord(requestId);
		if (record.state === "staged") {
			record.state = "pending";
			notify(record);
		} else if (record.state !== "pending") {
			throw new ApprovalError("invalid_state", "The approval is no longer pending.", requestId);
		}
		return snapshotOf(record);
	};

	/**
	 * Prove an answer names the approval it claims to: a valid approval id, and the exact one this
	 * request carried. An answer to another approval must never settle this one.
	 * @param record - The record being answered.
	 * @param suppliedApprovalId - The approval id the caller supplied, if any.
	 * @throws {ApprovalError} When the identity is invalid or names another approval.
	 */
	const assertApprovalIdentity = (
		record: ApprovalRecord,
		suppliedApprovalId: ApprovalResolveInput["approvalId"],
	): void => {
		if (suppliedApprovalId !== undefined && suppliedApprovalId !== null) {
			try {
				identity.decoder.parseApprovalId(suppliedApprovalId);
			} catch (error) {
				throw new ApprovalError(
					"invalid_identity",
					`The approval id is not valid in this workbench session: ${toError(error).message}`,
					record.request.requestId,
				);
			}
		}
		if (record.request.approvalId !== (suppliedApprovalId ?? null)) {
			throw new ApprovalError(
				"identity_mismatch",
				"The approval id does not match the pending request.",
				record.request.requestId,
			);
		}
	};

	/**
	 * Answer one pending approval. The approval id must be the one the request carried, the response must answer its family, and the binding evidence must match; an answer whose evidence has moved on settles as stale with the family's fallback rather than being sent.
	 * @param input - The approval, its identity evidence and the response.
	 * @returns How the approval settled.
	 */
	const resolve = (input: ApprovalResolveInput): Promise<ApprovalSettlement> => {
		try {
			if (disposed) throw new ApprovalError("disposed", "The approval broker has been disposed.");
			const record = requireRecord(input.requestId);
			if (record.settlementPromise !== undefined) return record.settlementPromise;
			if (record.state !== "pending")
				throw new ApprovalError(
					"invalid_state",
					"Only a pending approval may be resolved.",
					record.request.requestId,
				);
			assertApprovalIdentity(record, input.approvalId);
			const response = validateApprovalResponse(record.request, input.response);
			if (!bindingEvidenceMatches(record, input)) {
				return settleTransport(
					record,
					"stale",
					"The approval evidence no longer matches the pending target or effect.",
					fallbackResponse(record.request, "stale"),
					"authored_response",
				);
			}
			return settleTransport(
				record,
				"settled",
				"The approval response was accepted.",
				response,
				"authored_response",
			);
		} catch (error) {
			return Promise.reject(error);
		}
	};

	/**
	 * How one approval settles when its child exits: an approval already settling is waited on, an
	 * unanswered one ends as stale, and one belonging to another child is left alone.
	 * @param record - The record.
	 * @param exit - The exited child and its epoch.
	 * @returns The settlement to wait on, or null when this approval is unaffected.
	 */
	const childExitSettlement = (
		record: ApprovalRecord,
		exit: ChildExit,
	): Promise<ApprovalSettlement> | null => {
		if (!belongsToChild(record, exit)) return null;
		if (record.settlementPromise !== undefined) {
			return record.outcome === null ? record.settlementPromise : null;
		}
		if (record.state !== "staged" && record.state !== "pending") return null;
		return terminal(
			record.request.requestId,
			"stale",
			"The Codex child exited before the approval settled.",
		);
	};

	/**
	 * Settle every approval belonging to a Codex child that has exited. Nothing can be answered on a child that is gone, so each unsettled approval ends as stale; one already settling is waited on rather than settled twice.
	 * @param exit - The exited child and its epoch.
	 * @returns How each of them settled.
	 */
	const childExit = async (exit: ChildExit): Promise<readonly ApprovalSettlement[]> => {
		const settlements: Promise<ApprovalSettlement>[] = [];
		for (const record of records.values()) {
			const settlement = childExitSettlement(record, exit);
			if (settlement !== null) settlements.push(settlement);
		}
		return Promise.all(settlements);
	};

	/**
	 * Cancel one approval the broker is abandoning, so Codex is never left waiting on it.
	 * @param record - The record.
	 */
	const cancelOnDispose = (record: ApprovalRecord): void => {
		if (record.timer !== undefined) clearTimeout(record.timer);
		if (record.state === "staged" || record.state === "pending") {
			void terminal(
				record.request.requestId,
				"cancelled",
				"The approval broker was disposed before the approval settled.",
			).catch((error) => reportError(error, record.request.request));
		}
	};

	/**
	 * Stop for good: unsubscribe from the transport and cancel every approval still awaiting an answer, so Codex is never left waiting on a broker that is gone.
	 */
	const dispose = (): void => {
		if (disposed) return;
		disposed = true;
		for (const unsubscribe of unsubscribers.splice(0)) unsubscribe();
		for (const record of records.values()) cancelOnDispose(record);
	};

	subscribeTransport();

	/**
	 * Subscribe to the transport, unless the caller owns the listeners itself. Every approval
	 * request the broker owns arrives here, and a child exit settles what it left behind.
	 */
	function subscribeTransport(): void {
		if ((options.listenerOwnership ?? "self") !== "self") return;
		if (options.transport.onServerRequest !== undefined) {
			unsubscribers.push(
				options.transport.onServerRequest((request) => {
					if (request.owner !== "codex-approvals") return;
					try {
						receive(request);
					} catch (error) {
						reportError(error, request);
					}
				}),
			);
		}
		if (options.transport.onExit !== undefined) {
			unsubscribers.push(
				options.transport.onExit((exit) => {
					void childExit(exit).catch((error) => reportError(error));
				}),
			);
		}
	}

	return Object.freeze({
		stage,
		receive,
		pending,
		get: views.get,
		inspect: views.inspect,
		view: views.view,
		inspectViews: views.inspectViews,
		acknowledge: views.acknowledge,
		spokenEffectPresentation: views.spokenPresentation,
		spokenEligibility: views.spoken,
		resolve,
		/**
		 * Cancel one approval, sending its family's cancelling fallback.
		 * @param requestId - The approval.
		 * @param reason - Why it was cancelled.
		 * @returns How it settled.
		 */
		cancel: (requestId: JsonRpcRequestId, reason = "The approval was cancelled.") =>
			terminal(requestId, "cancelled", reason),
		/**
		 * Expire one approval that was never answered.
		 * @param requestId - The approval.
		 * @returns How it settled.
		 */
		expire: (requestId: JsonRpcRequestId) =>
			terminal(requestId, "expired", "The approval expired before it was resolved."),
		/**
		 * End one approval whose ownership has moved on.
		 * @param requestId - The approval.
		 * @param reason - Why it is stale.
		 * @returns How it settled.
		 */
		markStale: (requestId: JsonRpcRequestId, reason = "The approval ownership is stale.") =>
			terminal(requestId, "stale", reason),
		childExit,
		dispose,
	});
}
