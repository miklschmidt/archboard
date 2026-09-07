import type { ApprovalSettlement } from "@/runtime/codex-approvals";
import type { DynamicToolRefusalReason } from "@/runtime/codex-coordinator-tool-contract";
import { createTurnStartParams, type TurnStartParams } from "@/runtime/codex-instructions";
import type { SessionParams, SessionResponse } from "@/runtime/codex-session";
import type { RealtimeTranscriptRecord } from "@/shared/codex-realtime-host";
import { type IdentityAuthority, type TurnId } from "@/shared/codex-workbench-identity";
import type {
	CodexSpokenApprovalGateOptions,
	SpokenApprovalFallbackReason,
	SpokenApprovalSnapshot,
	SpokenApprovalToolResult,
} from "@/runtime/codex-spoken-approval/lib/contract";
import type { ActiveSlot, TurnReadyControls } from "@/runtime/codex-spoken-approval/lib/state";
import { sameBinding } from "@/runtime/codex-spoken-approval/lib/validation";
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
 * The promise a resolver call waits on when it arrives before the classifier turn has an identity, together with the controls that settle it exactly once.
 * @returns The readiness controls.
 * @throws {Error} When the promise executor did not run synchronously.
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
 * A refused resolver call, in the reviewed tool refusal vocabulary.
 * @param reason - The refusal reason.
 * @param message - The diagnostic for the caller.
 * @returns The tool result.
 */
function refusal(reason: DynamicToolRefusalReason, message: string): SpokenApprovalToolResult {
	return Object.freeze({ tag: "refused", reason, message });
}

/**
 * A settled resolver call, reporting the verdict the person gave and how the approval settled.
 * @param verdict - What the person said.
 * @param settlement - How the broker settled it.
 * @returns The tool result.
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
 * A message from any thrown value, for a refusal diagnostic.
 * @param error - Whatever was thrown.
 * @returns Its message, or its string form.
 */
function safeMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

/**
 * Fail the classifier turn: settle the readiness promise so a waiting resolver call stops waiting, then fall the gate back to the visual surface.
 * @param host - The classifier host.
 * @param slot - The armed gate.
 * @param ready - The readiness controls.
 * @param error - What went wrong.
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
 * Whether the turn that just started is still the classifier turn this gate can use: the gate is
 * live, no other turn has started on the thread, and the turn has not already completed without a
 * resolver call.
 * @param host - The classifier host.
 * @param slot - The armed gate.
 * @param turnId - The turn the session returned.
 * @returns True when the gate may adopt the turn.
 */
function isUsableClassifierTurn(
	host: ClassifierTurnHost,
	slot: ActiveSlot,
	turnId: TurnId,
): boolean {
	if (!host.isLive(slot)) {
		return false;
	}
	if (slot.startedTurnId !== null && slot.startedTurnId !== turnId) {
		return false;
	}
	return !(slot.turnCompleted && slot.pendingResolverRequest === null);
}

/**
 * Whether the host's current coordinator is the one this gate was armed on.
 * @param coordinator - The host's current coordinator, or null when there is none.
 * @param slot - The armed gate.
 * @returns True when it is the same coordinator on the same child and epoch.
 */
function isSameCoordinator(
	coordinator: ReturnType<ClassifierTurnHost["currentCoordinator"]>,
	slot: ActiveSlot,
): boolean {
	return (
		coordinator !== null &&
		coordinator.child === slot.child &&
		coordinator.epoch === slot.epoch &&
		coordinator.threadId === slot.coordinatorThreadId
	);
}

/**
 * Whether the host's current voice session is the one this gate was armed on.
 * @param realtime - The host's current voice correlation, or null when there is none.
 * @param slot - The armed gate.
 * @returns True when it is the same session and connection.
 */
function isSameRealtimeSession(
	realtime: ReturnType<ClassifierTurnHost["currentRealtime"]>,
	slot: ActiveSlot,
): boolean {
	return (
		realtime !== null &&
		realtime.sessionId === slot.realtime.sessionId &&
		realtime.correlationId === slot.realtime.correlationId
	);
}

/**
 * Why the classifier must not be started: the conversation moved on, the approval changed, or the
 * gate has expired. Everything the arm captured is re-checked here, because the person has only
 * just spoken and the world may have changed while they did.
 * @param host - The classifier host.
 * @param slot - The armed gate.
 * @returns The fallback reason, or null when the classifier may start.
 */
function classifierStartRefusal(
	host: ClassifierTurnHost,
	slot: ActiveSlot,
): SpokenApprovalFallbackReason | null {
	if (!isSameCoordinator(host.currentCoordinator(), slot)) {
		return "stale_state";
	}
	if (!isSameRealtimeSession(host.currentRealtime(), slot)) {
		return "stale_realtime_session";
	}
	if (!isUnchangedApproval(host, slot)) {
		return "changed_effect";
	}
	const time = host.currentTime();
	return time === null || time >= slot.expiresAtMs ? "timeout" : null;
}

/**
 * Whether the approval is still exactly the one the person was read: pending, the same approval,
 * the same binding, and still eligible for a spoken answer.
 * @param host - The classifier host.
 * @param slot - The armed gate.
 * @returns True when nothing about the approval has changed.
 */
function isUnchangedApproval(host: ClassifierTurnHost, slot: ActiveSlot): boolean {
	let approval;
	let eligibility;
	try {
		approval = host.approvalBroker.get(slot.requestId);
		eligibility = host.approvalBroker.spokenEligibility(slot.requestId);
	} catch {
		return false;
	}
	if (approval === undefined) {
		return false;
	}
	const checks = [
		approval.state === "pending",
		approval.approvalId === slot.approvalId,
		sameBinding(approval.binding, slot.approvalBinding),
		eligibility.eligible,
	];
	return checks.every((matched) => matched);
}

/**
 * Adopt the classifier turn once the session has confirmed it, and let any resolver call that is
 * already waiting on its identity proceed.
 * @param host - The classifier host.
 * @param slot - The armed gate.
 * @param ready - The turn-identity promise the resolver may be waiting on.
 * @param response - The turn/start response.
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
	if (!isUsableClassifierTurn(host, slot, turnId)) {
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
 * The turn body that asks the coordinator to classify what the person said: the effect they were
 * read, their exact utterance, and the classifier's own context.
 * @param slot - The armed gate.
 * @param record - The person's final utterance.
 * @returns The turn/start parameters, or null when they cannot be built.
 */
function classifierTurnParams(
	slot: ActiveSlot,
	record: RealtimeTranscriptRecord,
): SessionParams<"turn/start"> | null {
	let params: TurnStartParams;
	try {
		params = createTurnStartParams({
			threadId: slot.coordinatorThreadId,
			clientUserMessageId: slot.classifier.clientUserMessageId,
			prompt: createSpokenApprovalClassifierPrompt({
				effectSummary: slot.effectSummary,
				finalUserItemId: record.itemId,
				finalUserSequence: record.sequence,
				finalUserText: record.text,
			}),
			context: slot.classifier.context,
		});
	} catch {
		return null;
	}
	return Object.freeze({ ...params, threadId: slot.coordinatorThreadId });
}

/**
 * Start the classifier turn for what the person just said. The gate re-checks everything it was
 * armed on first, then asks the coordinator to classify the utterance as an acceptance or a
 * refusal; the turn's identity settles the promise a resolver call may already be waiting on.
 * @param host - The classifier host.
 * @param slot - The armed gate.
 * @param record - The person's final utterance.
 */
function startClassifier(
	host: ClassifierTurnHost,
	slot: ActiveSlot,
	record: RealtimeTranscriptRecord,
): void {
	if (!host.isLive(slot) || slot.phase !== "awaiting_user") {
		return;
	}
	const reason = classifierStartRefusal(host, slot);
	if (reason !== null) {
		host.enterFallback(slot, reason);
		return;
	}
	slot.finalUser = Object.freeze({ ...record });
	slot.phase = "classifying";
	host.publish(slot);
	if (!host.isLive(slot)) {
		return;
	}
	const turnParams = classifierTurnParams(slot, record);
	if (turnParams === null) {
		host.enterFallback(slot, "classifier_lost");
		return;
	}
	dispatchClassifierTurn(host, slot, turnParams);
}

/**
 * Send the classifier turn and settle its readiness promise when the session answers. The promise
 * is what a resolver call waits on, so it is settled whether the turn starts or fails.
 * @param host - The classifier host.
 * @param slot - The armed gate.
 * @param turnParams - The turn/start body.
 */
function dispatchClassifierTurn(
	host: ClassifierTurnHost,
	slot: ActiveSlot,
	turnParams: SessionParams<"turn/start">,
): void {
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

export { type ClassifierTurnHost, refusal, safeMessage, startClassifier, success };
export { resolveSpokenApproval } from "@/runtime/codex-spoken-approval/lib/resolver-turn";
