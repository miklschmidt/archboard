import type { ApprovalSnapshot, SpokenApprovalEffectPresentation } from "@/runtime/codex-approvals";
import type { DynamicToolRefusalReason } from "@/runtime/codex-coordinator-tool-contract";
import type { SpokenApprovalFallbackReason } from "@/runtime/codex-spoken-approval/lib/contract";
import { IdentityValidationError } from "@/shared/codex-workbench-identity";
import type { RealtimeCorrelation, RealtimeTranscriptRecord } from "@/shared/codex-realtime-host";

/** Why one spoken approval step refused, in both the person's and the tool call's vocabulary. */
interface CallValidationFailure {
	readonly fallback: SpokenApprovalFallbackReason;
	readonly refusal: DynamicToolRefusalReason;
	readonly message: string;
}

/**
 * Whether two voice correlations name the same session and the same connection to it.
 * @param left - One correlation.
 * @param right - The other correlation.
 * @returns True when both fields match.
 */
function sameRealtime(left: RealtimeCorrelation, right: RealtimeCorrelation): boolean {
	return left.sessionId === right.sessionId && left.correlationId === right.correlationId;
}

/**
 * A stable key for one transcript record, so the baseline can be compared later by identity rather than by position.
 * @param record - The transcript record.
 * @returns The key.
 */
function recordKey(record: RealtimeTranscriptRecord): string {
	return `${record.sessionId}\u0000${record.correlationId}\u0000${record.itemId}`;
}

/**
 * Whether two approval bindings name the same child, epoch, link, target and effect.
 * @param left - One binding.
 * @param right - The other binding.
 * @returns True when every field matches.
 */
function sameBinding(
	left: ApprovalSnapshot["binding"],
	right: ApprovalSnapshot["binding"],
): boolean {
	return (
		left.child === right.child &&
		left.epoch === right.epoch &&
		left.link === right.link &&
		left.target === right.target &&
		left.effect === right.effect
	);
}

/**
 * Whether the effect presentation describes exactly the approval it is supposed to: the same request, family, identities and binding. The presentation is what the person was read, so a mismatch means they were told about something else.
 * @param presentation - The presentation the broker produced.
 * @param approval - The pending approval.
 * @returns True when the presentation is this approval's.
 */
function sameSpokenEffectPresentation(
	presentation: SpokenApprovalEffectPresentation,
	approval: ApprovalSnapshot,
): boolean {
	const checks = [
		presentation.requestId === approval.requestId,
		presentation.family === approval.family,
		presentation.child === approval.child,
		presentation.epoch === approval.epoch,
		presentation.threadId === approval.threadId,
		presentation.turnId === approval.turnId,
		presentation.itemId === approval.itemId,
		presentation.approvalId === approval.approvalId,
		sameBinding(presentation.binding, approval.binding),
	];
	return checks.every((matched) => matched);
}

/**
 * A message from any thrown value, for a refusal diagnostic.
 * @param error - Whatever was thrown.
 * @returns Its message, or its string form.
 */
function safeErrorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

/**
 * Prove a value is a bounded, single-line string. These fields are spoken aloud and compared by exact value, so a multi-line or oversized one is refused rather than trimmed.
 * @param value - The claimed value.
 * @param label - The field being checked, for the refusal message.
 * @returns The value.
 * @throws {TypeError} When the value is empty, multi-line or too long.
 */
function oneLine(value: unknown, label: string): string {
	if (
		typeof value !== "string" ||
		value.length === 0 ||
		value.includes("\r") ||
		value.includes("\n")
	) {
		throw new TypeError(`${label} must be a non-empty one-line value.`);
	}
	if (Buffer.byteLength(value, "utf8") > 256) {
		throw new TypeError(`${label} must be at most 256 UTF-8 bytes.`);
	}
	return value;
}

/**
 * Whether a transcript sequence number is usable for ordering.
 * @param value - The claimed sequence.
 * @returns True for a non-negative whole number.
 */
function validSequence(value: unknown): value is number {
	return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

interface CallValidationFailure {
	readonly fallback: SpokenApprovalFallbackReason;
	readonly refusal: DynamicToolRefusalReason;
	readonly message: string;
}

/**
 * A refused resolver call: the fallback reason for the person and the refusal reason for the tool call, which are not the same vocabulary.
 * @param fallback - What the person is told to do instead.
 * @param refusal - The reviewed tool refusal reason.
 * @param message - The diagnostic for the caller.
 * @returns The failure.
 */
function failure(
	fallback: SpokenApprovalFallbackReason,
	refusal: DynamicToolRefusalReason,
	message: string,
): CallValidationFailure {
	return { fallback, refusal, message };
}

/**
 * The refusal for an identity that is no longer current, distinguishing another child from a prior epoch of this one, because they mean different things to the person.
 * @param error - What the identity authority threw.
 * @returns The failure.
 */
function failureForIdentity(error: unknown): CallValidationFailure {
	if (error instanceof IdentityValidationError) {
		if (error.code === "wrong-child") {
			return failure(
				"stale_realtime_session",
				"stale_child",
				"The spoken approval belongs to another Codex child.",
			);
		}
		if (error.code === "stale-epoch") {
			return failure(
				"stale_state",
				"prior_epoch",
				"The spoken approval belongs to a prior Codex child epoch.",
			);
		}
	}
	return failure(
		"stale_state",
		"unknown_provenance",
		`The spoken approval identity is no longer current: ${safeErrorMessage(error)}`,
	);
}

export {
	type CallValidationFailure,
	sameRealtime,
	recordKey,
	sameBinding,
	sameSpokenEffectPresentation,
	safeErrorMessage,
	oneLine,
	validSequence,
	failure,
	failureForIdentity,
};
