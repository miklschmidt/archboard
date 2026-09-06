import { CodexApprovalError, type ApprovalSettlement } from "@/runtime/codex-approvals";
import {
	ResolveSpokenApprovalInputSchema,
	type DynamicToolRefusalReason,
} from "@/runtime/codex-coordinator-tool-contract";
import { createTurnStartParams, type TurnStartParams } from "@/runtime/codex-instructions";
import type { SessionParams, SessionResponse } from "@/runtime/codex-session";
import type { DynamicServerRequest } from "@/runtime/codex-transport";
import type { RealtimeTranscriptRecord } from "@/shared/codex-realtime-host";
import { type IdentityAuthority, type TurnId } from "@/shared/codex-workbench-identity";
import type {
	CodexSpokenApprovalGateOptions,
	SpokenApprovalFallbackReason,
	SpokenApprovalSnapshot,
	SpokenApprovalToolResult,
} from "@/runtime/codex-spoken-approval/lib/contract";
import type { ActiveSlot, TurnReadyControls } from "@/runtime/codex-spoken-approval/lib/state";
import {
	sameBinding,
	validateResolverCall,
	type CallValidationFailure,
} from "@/runtime/codex-spoken-approval/lib/validation";
import { createSpokenApprovalClassifierPrompt } from "@/runtime/codex-spoken-approval/lib/classifier";

interface ClassifierTurnHost {
	readonly approvalBroker: CodexSpokenApprovalGateOptions["approvalBroker"];
	readonly session: CodexSpokenApprovalGateOptions["session"];
	readonly identity: IdentityAuthority;
	readonly currentCoordinator: () => {
		readonly child: ActiveSlot["child"];
		readonly epoch: ActiveSlot["epoch"];
		readonly threadId: ActiveSlot["coordinatorThreadId"];
	} | null;
	readonly currentRealtime: CodexSpokenApprovalGateOptions["currentRealtime"];
	readonly currentTime: () => number | null;
	readonly isLive: (slot: ActiveSlot | null) => slot is ActiveSlot;
	readonly publish: (slot: ActiveSlot) => SpokenApprovalSnapshot;
	readonly enterFallback: (slot: ActiveSlot, reason: SpokenApprovalFallbackReason) => void;
}

/**
 *
 */
function createTurnReady(): TurnReadyControls {
	let resolveTurn: ((turnId: TurnId) => void) | undefined;
	let rejectTurn: ((reason: unknown) => void) | undefined;
	const promise = new Promise<TurnId>((resolve, reject) => {
		resolveTurn = resolve;
		rejectTurn = reject;
	});
	if (resolveTurn === undefined || rejectTurn === undefined) {
		throw new Error("Classifier turn readiness controls were not initialized.");
	}
	return { promise, resolve: resolveTurn, reject: rejectTurn, settled: false };
}

/**
 *
 */
function refusal(reason: DynamicToolRefusalReason, message: string): SpokenApprovalToolResult {
	return Object.freeze({ tag: "refused", reason, message });
}

/**
 *
 */
function success(
	verdict: "accept" | "decline",
	settlement: ApprovalSettlement,
): SpokenApprovalToolResult {
	return Object.freeze({
		tag: "ok",
		value: Object.freeze({ verdict, settlement: settlement.outcome }),
	});
}

/**
 *
 */
function safeMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

/**
 *
 */
function failReady(
	host: ClassifierTurnHost,
	slot: ActiveSlot,
	ready: TurnReadyControls,
	error: unknown,
) {
	if (!ready.settled) {
		ready.settled = true;
		ready.reject(error);
	}
	if (host.isLive(slot)) {
		host.enterFallback(slot, "classifier_lost");
	}
}

/**
 *
 */
function finishTurn(
	host: ClassifierTurnHost,
	slot: ActiveSlot,
	ready: TurnReadyControls,
	response: SessionResponse<"turn/start">,
): void {
	let turnId: TurnId;
	try {
		turnId = host.identity.decoder.parseTurnId(response.turn.id);
		host.identity.validator.assertCurrentEpoch(slot.child, slot.epoch);
	} catch (error) {
		failReady(host, slot, ready, error);
		return;
	}
	if (
		!host.isLive(slot) ||
		(slot.startedTurnId !== null && slot.startedTurnId !== turnId) ||
		(slot.turnCompleted && slot.pendingResolverRequest === null)
	) {
		failReady(
			host,
			slot,
			ready,
			new Error("The classifier turn completed or changed before it was usable."),
		);
		return;
	}
	slot.classifierTurnId = turnId;
	slot.phase = "awaiting_resolver";
	host.publish(slot);
	if (!ready.settled) {
		ready.settled = true;
		ready.resolve(turnId);
	}
}

/**
 *
 */
function startClassifier(
	host: ClassifierTurnHost,
	slot: ActiveSlot,
	record: RealtimeTranscriptRecord,
): void {
	if (!host.isLive(slot) || slot.phase !== "awaiting_user") {
		return;
	}
	const coordinator = host.currentCoordinator();
	if (
		coordinator === null ||
		coordinator.child !== slot.child ||
		coordinator.epoch !== slot.epoch ||
		coordinator.threadId !== slot.coordinatorThreadId
	) {
		host.enterFallback(slot, "stale_state");
		return;
	}
	const realtime = host.currentRealtime();
	if (
		realtime === null ||
		realtime.sessionId !== slot.realtime.sessionId ||
		realtime.correlationId !== slot.realtime.correlationId
	) {
		host.enterFallback(slot, "stale_realtime_session");
		return;
	}
	let approval;
	let eligibility;
	try {
		approval = host.approvalBroker.get(slot.requestId);
		eligibility = host.approvalBroker.spokenEligibility(slot.requestId);
	} catch {
		host.enterFallback(slot, "changed_effect");
		return;
	}
	if (approval === undefined) {
		host.enterFallback(slot, "changed_effect");
		return;
	}
	if (
		approval.state !== "pending" ||
		approval.approvalId !== slot.approvalId ||
		!sameBinding(approval.binding, slot.approvalBinding) ||
		!eligibility.eligible
	) {
		host.enterFallback(slot, "changed_effect");
		return;
	}
	const time = host.currentTime();
	if (time === null || time >= slot.expiresAtMs) {
		host.enterFallback(slot, "timeout");
		return;
	}
	slot.finalUser = Object.freeze({ ...record });
	slot.phase = "classifying";
	host.publish(slot);
	if (!host.isLive(slot)) {
		return;
	}
	let params: TurnStartParams;
	try {
		const prompt = createSpokenApprovalClassifierPrompt({
			effectSummary: slot.effectSummary,
			finalUserItemId: record.itemId,
			finalUserSequence: record.sequence,
			finalUserText: record.text,
		});
		params = createTurnStartParams({
			threadId: slot.coordinatorThreadId,
			clientUserMessageId: slot.classifier.clientUserMessageId,
			prompt,
			context: slot.classifier.context,
		});
	} catch {
		host.enterFallback(slot, "classifier_lost");
		return;
	}
	const turnParams: SessionParams<"turn/start"> = Object.freeze({
		...params,
		threadId: slot.coordinatorThreadId,
	});
	const ready = createTurnReady();
	slot.turnReady = ready;
	void ready.promise.catch(() => undefined);
	let turn: Promise<SessionResponse<"turn/start">>;
	try {
		turn = host.session.turnStart(turnParams);
	} catch (error) {
		failReady(host, slot, ready, error);
		return;
	}
	void turn.then(
		(response) => finishTurn(host, slot, ready, response),
		(error) => failReady(host, slot, ready, error),
	);
}

/**
 *
 */
function validationRefusal(failure: CallValidationFailure): SpokenApprovalToolResult {
	return refusal(failure.refusal, failure.message);
}

/**
 *
 */
async function handleResolver(
	host: ClassifierTurnHost,
	slot: ActiveSlot,
	request: DynamicServerRequest,
	verdict: "accept" | "decline",
): Promise<SpokenApprovalToolResult> {
	if (!host.isLive(slot)) {
		return refusal("not_ready", "No spoken approval is awaiting this resolver call.");
	}
	const failure = validateResolverCall(host, slot, request, true);
	if (failure !== null) {
		host.enterFallback(slot, failure.fallback);
		return validationRefusal(failure);
	}
	if (slot.resolverCallId !== null) {
		if (slot.resolverCallId !== request.logicalCall.callId) {
			host.enterFallback(slot, "ambiguous");
			return refusal(
				"invalid_call",
				"A second resolver call cannot reuse the spoken approval slot.",
			);
		}
		return refusal("not_ready", "The resolver call is already being settled.");
	}
	if (slot.phase !== "awaiting_resolver" && slot.phase !== "classifying") {
		return refusal("not_ready", "The classifier turn is not awaiting a resolver call.");
	}
	slot.pendingResolverRequest = null;
	slot.resolverCallId = request.logicalCall.callId;
	slot.phase = "resolving";
	host.publish(slot);
	let settlement: ApprovalSettlement;
	try {
		settlement = await host.approvalBroker.resolve({
			requestId: slot.requestId,
			approvalId: slot.approvalId,
			binding: slot.approvalBinding,
			response: { approvalKind: "command_execution", decision: verdict },
		});
	} catch (error) {
		if (host.isLive(slot)) {
			host.enterFallback(slot, "resolver_lost");
		}
		const reason =
			error instanceof CodexApprovalError &&
			(error.code === "stale_ownership" || error.code === "identity_mismatch")
				? "unknown_provenance"
				: "not_ready";
		return refusal(reason, `The spoken resolver was not accepted: ${safeMessage(error)}`);
	}
	if (!host.isLive(slot)) {
		return refusal(
			"unknown_provenance",
			"The spoken approval state became stale during settlement.",
		);
	}
	slot.settlement = settlement;
	if (settlement.outcome === "delivered" && settlement.state === "settled") {
		slot.phase = "settled";
		slot.reason = null;
		if (slot.timer !== null) {
			clearTimeout(slot.timer);
			slot.timer = null;
		}
		host.publish(slot);
		return success(verdict, settlement);
	}
	host.enterFallback(slot, settlement.state === "stale" ? "changed_effect" : "resolver_lost");
	return success(verdict, settlement);
}

/**
 *
 */
async function resolveSpokenApproval(
	host: ClassifierTurnHost,
	slot: ActiveSlot,
	request: DynamicServerRequest,
): Promise<SpokenApprovalToolResult> {
	if (!host.isLive(slot)) {
		return refusal("not_ready", "There is no pending spoken approval to resolve.");
	}
	const parsed = ResolveSpokenApprovalInputSchema.safeParse(request.params.arguments);
	if (!parsed.success) {
		host.enterFallback(slot, "ambiguous");
		return refusal("invalid_call", "The resolver input must contain only accept or decline.");
	}
	const baseFailure = validateResolverCall(host, slot, request, false);
	if (baseFailure !== null) {
		host.enterFallback(slot, baseFailure.fallback);
		return validationRefusal(baseFailure);
	}
	if (slot.phase === "awaiting_user") {
		host.enterFallback(slot, "ambiguous");
		return refusal("not_ready", "The final user item has not produced a classifier turn yet.");
	}
	if (slot.phase === "classifying" && slot.classifierTurnId === null) {
		if (slot.turnReady === null) {
			host.enterFallback(slot, "classifier_lost");
			return refusal("not_ready", "The classifier turn was lost before its identity was issued.");
		}
		if (slot.pendingResolverRequest !== null && slot.pendingResolverRequest !== request) {
			host.enterFallback(slot, "ambiguous");
			return refusal("invalid_call", "Only one resolver call may wait for classifier identity.");
		}
		slot.pendingResolverRequest = request;
		try {
			await slot.turnReady.promise;
		} catch {
			if (slot.pendingResolverRequest === request) {
				slot.pendingResolverRequest = null;
			}
			return refusal("not_ready", "The classifier turn was lost before resolution.");
		}
		if (slot.pendingResolverRequest === request) {
			slot.pendingResolverRequest = null;
		}
	}
	return handleResolver(host, slot, request, parsed.data.verdict);
}

export { type ClassifierTurnHost, startClassifier, resolveSpokenApproval };
