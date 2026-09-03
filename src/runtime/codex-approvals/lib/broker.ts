import type {
	ApprovalBinding,
	ApprovalDecision,
	ApprovalOwnerView,
	ApprovalRequest,
	ApprovalResponse,
	ApprovalResolveInput,
	ApprovalSettlement,
	ApprovalSnapshot,
	ApprovalState,
	ApprovalOutcome,
	ApprovalTerminalDelivery,
	CodexApprovalBroker,
	CodexApprovalBrokerOptions,
	SpokenApprovalEffectPresentation,
	SpokenEligibility,
	TerminalApprovalState,
} from "./contract.js";
import { CodexApprovalError as ApprovalError } from "./contract.js";
import { completeBinding, normalizeApprovalRequest, rebindApprovalRequest } from "./request.js";
import {
	classifyResponseFailure,
	fallbackResponse,
	failedSettlement,
	spokenEligibility as assessSpokenEligibility,
	toSpokenEffectPresentation,
	toServerResponse,
	validateApprovalResponse,
} from "./response.js";
import { CODEX_APPROVAL_EXPIRY_MS } from "../../../shared/timing/timing.js";
import type {
	ChildEpoch,
	ChildId,
	JsonRpcRequestId,
} from "../../../shared/codex-workbench-identity/index.js";
import type { TransportServerRequest } from "../../codex-transport/server-requests.js";

interface ApprovalRecord {
	readonly request: ApprovalRequest;
	readonly sourceRequest: TransportServerRequest;
	readonly spokenEffectPresentation: SpokenApprovalEffectPresentation | null;
	state: ApprovalState;
	outcome: ApprovalOutcome | null;
	reason: string | null;
	decision: ApprovalDecision | null;
	timer?: ReturnType<typeof setTimeout>;
	settlementPromise?: Promise<ApprovalSettlement>;
	settlementResolve?: (settlement: ApprovalSettlement) => void;
	terminalClaimed: boolean;
	terminalDelivery: ApprovalTerminalDelivery;
}

function isTerminal(state: ApprovalState): state is TerminalApprovalState {
	return state !== "staged" && state !== "pending";
}

function sameBinding(left: ApprovalBinding, right: ApprovalBinding): boolean {
	return (
		left.child === right.child &&
		left.epoch === right.epoch &&
		left.link === right.link &&
		left.target === right.target &&
		left.effect === right.effect
	);
}

function toError(error: unknown): Error {
	return error instanceof Error ? error : new Error(String(error));
}

function approvalDecision(response: ApprovalResponse): ApprovalDecision {
	switch (response.approvalKind) {
		case "command_execution":
		case "file_change":
			if (response.decision === "decline") return "declined";
			if (response.decision === "cancel") return "cancelled";
			return "approved";
		case "elicitation":
			return response.action === "accept"
				? "approved"
				: response.action === "decline"
					? "declined"
					: "cancelled";
		case "apply_patch":
		case "exec_command":
			if (typeof response.decision === "object" && "denied" in response.decision) return "declined";
			if (response.decision === "timed_out" || response.decision === "abort") return "cancelled";
			return "approved";
		case "user_input":
		case "permissions":
			return "approved";
	}
}

function snapshotOf(record: ApprovalRecord): ApprovalSnapshot {
	return Object.freeze({
		kind: "approval" as const,
		family: record.request.family,
		method: record.request.method,
		requestId: record.request.requestId,
		child: record.request.child,
		epoch: record.request.epoch,
		threadId: record.request.threadId,
		turnId: record.request.turnId,
		itemId: record.request.itemId,
		approvalId: record.request.approvalId,
		identity: record.request.identity,
		binding: record.request.binding,
		expiresAtMs: record.request.expiresAtMs,
		state: record.state,
		outcome: record.outcome,
		decision: record.decision,
		reason: record.reason,
	});
}

export function createCodexApprovalBroker(
	options: CodexApprovalBrokerOptions,
): CodexApprovalBroker {
	const identity = options.identity;
	const now = options.now ?? Date.now;
	const records = new Map<JsonRpcRequestId, ApprovalRecord>();
	const unsubscribers: Array<() => void> = [];
	let disposed = false;

	const reportError = (error: unknown, request?: TransportServerRequest): void => {
		try {
			options.onError?.(toError(error), request);
		} catch {
			// Observability must not turn a safe refusal into an unhandled listener error.
		}
	};

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

	const notify = (record: ApprovalRecord): void => {
		try {
			options.onChange?.(snapshotOf(record));
		} catch (error) {
			reportError(error, record.request.request);
		}
	};

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

	const bindingEvidenceMatches = (record: ApprovalRecord, input: ApprovalResolveInput): boolean => {
		if (input.binding === undefined) return true;
		try {
			return sameBinding(record.request.binding, completeBinding(record.request, input.binding));
		} catch {
			return false;
		}
	};

	const settleTransport = (
		record: ApprovalRecord,
		requestedState: TerminalApprovalState,
		reason: string,
		response: ApprovalResponse,
		terminalDelivery: Exclude<ApprovalTerminalDelivery, null>,
	): Promise<ApprovalSettlement> => {
		if (record.settlementPromise !== undefined) return record.settlementPromise;
		if (isTerminal(record.state) || record.terminalClaimed)
			throw new ApprovalError(
				"invalid_state",
				"The approval has already entered terminal settlement without a reusable result.",
				record.request.requestId,
			);

		record.terminalClaimed = true;
		record.terminalDelivery = terminalDelivery === "authored_response" ? "authored_response" : null;
		if (record.timer !== undefined) clearTimeout(record.timer);
		record.timer = undefined;

		let finalState = requestedState;
		let finalReason = reason;
		let finalResponse = response;
		const liveBinding = currentBinding(record);
		if (liveBinding === null || !sameBinding(liveBinding, record.request.binding)) {
			finalState = "stale";
			finalReason = "The approval target or effect is stale; visual fallback was sent.";
			finalResponse = fallbackResponse(record.request, finalState);
		}

		record.state = finalState;
		record.reason = finalReason;
		record.decision = finalState === "settled" ? approvalDecision(finalResponse) : "cancelled";
		const settlementPromise = new Promise<ApprovalSettlement>((resolve) => {
			record.settlementResolve = resolve;
		});
		record.settlementPromise = settlementPromise;
		if (terminalDelivery === "authored_response") notify(record);

		let serverResponse: ReturnType<typeof toServerResponse>;
		try {
			const validated = validateApprovalResponse(record.request, finalResponse, {
				respectAvailableDecisions: finalState === "settled",
			});
			serverResponse = toServerResponse(record.request, validated);
		} catch (error) {
			finish("not_delivered", error);
			return settlementPromise;
		}

		let responsePromise: Promise<void>;
		let writeAttempted = false;
		try {
			writeAttempted = true;
			responsePromise = Promise.resolve(
				options.transport.respond(record.sourceRequest, "codex-approvals", serverResponse),
			);
		} catch (error) {
			responsePromise = Promise.reject(error);
		}

		void responsePromise.then(
			() => finish("delivered"),
			(error) => finish(classifyResponseFailure(error, writeAttempted), error),
		);
		return settlementPromise;

		function finish(outcome: ApprovalOutcome, error?: unknown): void {
			if (record.outcome !== null) return;
			record.outcome = outcome;
			record.terminalDelivery = terminalDelivery;
			if (outcome === "outcome_unknown") {
				record.state = "outcome_unknown";
				record.reason = `${finalReason} The response write outcome is unknown.`;
			} else if (outcome === "not_delivered") {
				record.reason = `${finalReason} The response was not delivered.`;
			}
			const result =
				outcome === "delivered"
					? Object.freeze({
							requestId: record.request.requestId,
							family: record.request.family,
							state: record.state as TerminalApprovalState,
							outcome,
							reason: record.reason ?? finalReason,
						})
					: failedSettlement(
							record.request,
							record.state as TerminalApprovalState,
							outcome,
							record.reason ?? (error instanceof Error ? error.message : finalReason),
						);
			notify(record);
			record.settlementResolve?.(result);
			record.settlementResolve = undefined;
		}
	};

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

	const stage = (request: TransportServerRequest): ApprovalSnapshot => {
		if (disposed) throw new ApprovalError("disposed", "The approval broker has been disposed.");
		if (request.owner !== "codex-approvals")
			throw new ApprovalError(
				"unsupported_request",
				`The ${request.method} request is owned by ${request.owner}, not codex-approvals.`,
			);
		const existing = records.get(request.requestId);
		if (existing !== undefined) {
			if (existing.sourceRequest === request) return snapshotOf(existing);
			throw new ApprovalError(
				"duplicate_request",
				"A different approval request reused an existing JSON-RPC request identity.",
				request.requestId,
			);
		}
		const expiresAtMs = now() + CODEX_APPROVAL_EXPIRY_MS;
		const provisional = normalizeApprovalRequest(identity, request, expiresAtMs);
		const bindingInput = options.getCurrentBinding?.(provisional);
		const normalized =
			bindingInput === undefined ? provisional : rebindApprovalRequest(provisional, bindingInput);
		let spokenEffectPresentation: SpokenApprovalEffectPresentation | null = null;
		if (normalized.family === "command_execution") {
			try {
				spokenEffectPresentation = toSpokenEffectPresentation(normalized);
			} catch {
				// A command without a safe spoken presentation remains visual-only.
			}
		}
		const record: ApprovalRecord = {
			request: normalized,
			sourceRequest: request,
			spokenEffectPresentation,
			state: "staged",
			outcome: null,
			reason: null,
			decision: null,
			terminalClaimed: false,
			terminalDelivery: null,
		};
		records.set(normalized.requestId, record);
		const delay = Math.max(0, normalized.expiresAtMs - now());
		record.timer = setTimeout(() => {
			void terminal(
				normalized.requestId,
				"expired",
				"The approval expired before it was resolved.",
			).catch((error) => reportError(error, normalized.request));
		}, delay);
		if (typeof record.timer.unref === "function") record.timer.unref();
		notify(record);
		return snapshotOf(record);
	};

	const receive = (request: TransportServerRequest): ApprovalSnapshot => {
		const staged = stage(request);
		return pending(staged.requestId);
	};

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
			const suppliedApprovalId = input.approvalId;
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

	const get = (requestId: JsonRpcRequestId): ApprovalSnapshot | undefined => {
		try {
			const record = records.get(requireRequestId(requestId));
			return record === undefined ? undefined : snapshotOf(record);
		} catch {
			return undefined;
		}
	};

	const inspect = (): readonly ApprovalSnapshot[] =>
		Object.freeze(Array.from(records.values(), snapshotOf));

	const acknowledge = (requestId: JsonRpcRequestId): void => {
		const record = requireRecord(requestId);
		if (!isTerminal(record.state))
			throw new ApprovalError(
				"invalid_state",
				"Only a terminal approval may be acknowledged.",
				requestId,
			);
		if (record.timer !== undefined) clearTimeout(record.timer);
		records.delete(requestId);
	};

	const spokenForRecord = (record: ApprovalRecord): SpokenEligibility => {
		if (record.state !== "pending") return { eligible: false, reason: "not_pending" };
		const live = currentBinding(record);
		let facts;
		try {
			facts = options.getSpokenEligibilityFacts?.(record.request) ?? {};
		} catch {
			facts = { unsupportedSchema: true };
		}
		return assessSpokenEligibility(
			record.request,
			live !== null && sameBinding(live, record.request.binding),
			facts,
			record.spokenEffectPresentation,
		);
	};

	const view = (requestId: JsonRpcRequestId): ApprovalOwnerView => {
		const record = requireRecord(requestId);
		return Object.freeze({
			kind: "approval_owner" as const,
			request: record.request,
			snapshot: snapshotOf(record),
			spoken: spokenForRecord(record),
			terminalDelivery: record.terminalDelivery,
		});
	};

	const inspectViews = (): readonly ApprovalOwnerView[] =>
		Object.freeze(Array.from(records.values(), (record) => view(record.request.requestId)));

	const spokenPresentation = (requestId: JsonRpcRequestId) => {
		const record = requireRecord(requestId);
		if (record.spokenEffectPresentation === null)
			throw new ApprovalError(
				"unsupported_schema",
				"The approval has no safe one-line spoken effect presentation.",
				requestId,
			);
		return record.spokenEffectPresentation;
	};

	const spoken = (requestId: JsonRpcRequestId): SpokenEligibility => {
		const record = requireRecord(requestId);
		return spokenForRecord(record);
	};

	const childExit = async (exit: {
		readonly child: ChildId;
		readonly epoch: ChildEpoch;
	}): Promise<readonly ApprovalSettlement[]> => {
		const settlements: Promise<ApprovalSettlement>[] = [];
		for (const record of records.values()) {
			if (record.request.child !== exit.child || record.request.epoch !== exit.epoch) continue;
			if (record.settlementPromise !== undefined) {
				if (record.outcome === null) settlements.push(record.settlementPromise);
				continue;
			}
			if (record.state === "staged" || record.state === "pending") {
				settlements.push(
					terminal(
						record.request.requestId,
						"stale",
						"The Codex child exited before the approval settled.",
					),
				);
			}
		}
		return Promise.all(settlements);
	};

	const dispose = (): void => {
		if (disposed) return;
		disposed = true;
		for (const unsubscribe of unsubscribers.splice(0)) unsubscribe();
		for (const record of records.values()) {
			if (record.timer !== undefined) clearTimeout(record.timer);
			if (record.state === "staged" || record.state === "pending") {
				void terminal(
					record.request.requestId,
					"cancelled",
					"The approval broker was disposed before the approval settled.",
				).catch((error) => reportError(error, record.request.request));
			}
		}
	};

	if (
		(options.listenerOwnership ?? "self") === "self" &&
		options.transport.onServerRequest !== undefined
	) {
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
	if ((options.listenerOwnership ?? "self") === "self" && options.transport.onExit !== undefined) {
		unsubscribers.push(
			options.transport.onExit((exit) => {
				void childExit(exit).catch((error) => reportError(error));
			}),
		);
	}

	return Object.freeze({
		stage,
		receive,
		pending,
		get,
		inspect,
		view,
		inspectViews,
		acknowledge,
		spokenEffectPresentation: spokenPresentation,
		spokenEligibility: spoken,
		resolve,
		cancel: (requestId: JsonRpcRequestId, reason = "The approval was cancelled.") =>
			terminal(requestId, "cancelled", reason),
		expire: (requestId: JsonRpcRequestId) =>
			terminal(requestId, "expired", "The approval expired before it was resolved."),
		markStale: (requestId: JsonRpcRequestId, reason = "The approval ownership is stale.") =>
			terminal(requestId, "stale", reason),
		childExit,
		dispose,
	});
}
