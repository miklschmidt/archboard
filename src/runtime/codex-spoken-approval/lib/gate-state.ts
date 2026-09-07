import type { RealtimeSemanticEvent, RealtimeTranscriptRecord } from "@/shared/codex-realtime-host";
import type { TurnId } from "@/shared/codex-workbench-identity";
import type { TransportServerNotification } from "@/runtime/codex-transport";
import type {
	SpokenApprovalArmInput,
	SpokenApprovalFallbackReason,
	SpokenApprovalSnapshot,
	SpokenApprovalToolResult,
} from "@/runtime/codex-spoken-approval/lib/contract";
import type { ActiveSlot } from "@/runtime/codex-spoken-approval/lib/state";
import { recordKey } from "@/runtime/codex-spoken-approval/lib/validation-primitives";
import type { ArmValidationResult } from "@/runtime/codex-spoken-approval/lib/validation";

/**
 * Why a voice session event means the gate can no longer be answered aloud: it belongs to
 * another session, the session reported a diagnostic, or it has left the phases in which a
 * person can still speak.
 * @param slot - The armed gate.
 * @param event - The session event.
 * @returns The fallback reason, or null when the session is still usable.
 */
function sessionEventRefusal(
	slot: ActiveSlot,
	event: Exclude<RealtimeSemanticEvent, { readonly kind: "transcript" }>,
): SpokenApprovalFallbackReason | null {
	if (
		event.sessionId !== slot.realtime.sessionId ||
		event.correlationId !== slot.realtime.correlationId
	) {
		return "stale_realtime_session";
	}
	if (event.kind === "diagnostic" || REALTIME_FALLBACK_PHASES.has(event.state.phase)) {
		return "realtime_unavailable";
	}
	return null;
}

/**
 * Cancel the gate's expiry timer, if it is still running.
 * @param slot - The armed gate.
 */
function clearTimer(slot: ActiveSlot): void {
	if (slot.timer === null) {
		return;
	}
	clearTimeout(slot.timer);
	slot.timer = null;
}

/**
 * Fail the classifier turn's readiness promise, so a resolver call waiting on the turn's identity
 * stops waiting instead of hanging until the gate expires.
 * @param slot - The armed gate.
 * @param error - Why the turn will never produce an identity.
 */
function rejectTurnReady(slot: ActiveSlot, error: unknown): void {
	const ready = slot.turnReady;
	if (ready === null || ready.settled) {
		return;
	}
	ready.settled = true;
	ready.reject(error);
}

/** The realtime phases in which a spoken gate can no longer be answered aloud. */
const REALTIME_FALLBACK_PHASES: ReadonlySet<string> = new Set([
	"closed",
	"recoverable_error",
	"terminal_error",
	"idle",
]);

/**
 * Whether a notification is a turn lifecycle event on the gate's own coordinator thread.
 * @param slot - The armed gate.
 * @param notification - The decoded notification.
 * @returns True when the gate is watching for it.
 */
function isWatchedTurnNotification(
	slot: ActiveSlot,
	notification: TransportServerNotification["notification"],
): notification is Extract<
	TransportServerNotification["notification"],
	{ readonly method: "turn/started" | "turn/completed" }
> {
	return (
		(notification.method === "turn/started" || notification.method === "turn/completed") &&
		notification.params.threadId === slot.coordinatorThreadId
	);
}

/**
 * Whether a turn is not the one this gate is watching: it has already seen a different started or
 * classifier turn on the same thread.
 * @param slot - The armed gate.
 * @param turnId - The turn the notification named.
 * @returns True when the turn belongs to somebody else's work.
 */
function isForeignTurn(slot: ActiveSlot, turnId: TurnId): boolean {
	return (
		(slot.startedTurnId !== null && slot.startedTurnId !== turnId) ||
		(slot.classifierTurnId !== null && slot.classifierTurnId !== turnId)
	);
}

/**
 * Whether a transcript record was already there when the gate was armed, or came before the
 * effect prompt: either way it is not the person's answer to it.
 * @param slot - The armed gate.
 * @param record - The transcript record.
 * @returns True when the record is part of the baseline.
 */
function isBaselineRecord(slot: ActiveSlot, record: RealtimeTranscriptRecord): boolean {
	return (
		slot.baselineRecordKeys.has(recordKey(record)) || record.sequence <= slot.effectPrompt.sequence
	);
}

/**
 * Why a transcript record after the effect prompt means the gate must fall back: the assistant
 * spoke again, so the person was asked something else, or the person's final utterance was empty,
 * so there is nothing for the classifier to read.
 * @param record - The transcript record.
 * @returns The fallback reason, or null when the record may be classified or ignored.
 */
function answerRefusal(record: RealtimeTranscriptRecord): SpokenApprovalFallbackReason | null {
	if (record.role === "assistant") {
		return "assistant_only";
	}
	if (record.status === "final" && record.text.length === 0) {
		return "missing_user_final";
	}
	return null;
}

/** What the person said, as the published snapshot reports it. */
type FinalUserFields = Pick<
	SpokenApprovalSnapshot,
	"finalUserItemId" | "finalUserSequence" | "finalUserText"
>;

/**
 * The person's answer as the snapshot carries it, all three fields absent until they have spoken.
 * @param slot - The armed gate.
 * @returns The snapshot's final-user fields.
 */
function finalUserFields(slot: ActiveSlot): FinalUserFields {
	const finalUser = slot.finalUser;
	return finalUser === null
		? { finalUserItemId: null, finalUserSequence: null, finalUserText: null }
		: {
				finalUserItemId: finalUser.itemId,
				finalUserSequence: finalUser.sequence,
				finalUserText: finalUser.text,
			};
}

/**
 * Build the armed gate from a validated arm: everything the gate will re-check later is captured
 * here, at the moment the person was read the effect, so a later change is visible as a change.
 * @param input - The arm request.
 * @param result - The validated arm.
 * @returns The armed slot.
 */
function armedSlot(
	input: SpokenApprovalArmInput,
	result: Extract<ArmValidationResult, { readonly ok: true }>,
): ActiveSlot {
	return {
		requestId: input.requestId,
		approvalId: result.approval.approvalId,
		approvalFamily: "command_execution",
		approvalBinding: result.approval.binding,
		approvalExpiresAtMs: result.approval.expiresAtMs,
		expiresAtMs: result.expiresAtMs,
		child: result.coordinator.child,
		epoch: result.coordinator.epoch,
		coordinatorThreadId: result.coordinator.threadId,
		realtime: result.realtime,
		effectSummary: result.effectSummary,
		effectPrompt: Object.freeze({ ...input.effectPrompt }),
		classifier: Object.freeze({
			operationId: result.operationId,
			clientUserMessageId: result.clientUserMessageId,
			context: result.context,
		}),
		baselineRecordKeys: result.baselineRecordKeys,
		phase: "awaiting_user",
		reason: null,
		finalUser: null,
		startedTurnId: null,
		classifierTurnId: null,
		resolverCallId: null,
		turnCompleted: false,
		turnReady: null,
		pendingResolverRequest: null,
		settlement: null,
		timer: null,
	};
}

/**
 * The refusal returned to a resolver call when there is nothing to resolve.
 * @param reason - The reviewed refusal reason.
 * @param message - The diagnostic for the caller.
 * @returns The tool result.
 */
function refusal(reason: "not_ready", message: string): SpokenApprovalToolResult {
	return Object.freeze({ tag: "refused", reason, message });
}

export {
	REALTIME_FALLBACK_PHASES,
	answerRefusal,
	armedSlot,
	clearTimer,
	finalUserFields,
	isBaselineRecord,
	isForeignTurn,
	isWatchedTurnNotification,
	sessionEventRefusal,
	refusal,
	rejectTurnReady,
};
