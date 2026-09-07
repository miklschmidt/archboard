import { CodexSessionMutationError } from "@/runtime/codex-session";
import { CodexWorkhorseQueueError } from "@/runtime/codex-workhorse-queue";
import {
	CodexWorkhorseOperationsError,
	type WorkhorseOperationDelivery,
	type WorkhorseOperationErrorCode,
} from "@/runtime/codex-workhorse-operations/lib/contract";

type SettledDelivery = Exclude<WorkhorseOperationDelivery, "pending">;

/**
 * Thread-link refusal reasons that map to a specific operation error code; every other reason
 * means the link is simply not ready.
 */
const LINK_REASON_CODES: Readonly<Record<string, WorkhorseOperationErrorCode>> = Object.freeze({
	stale_child: "stale_child",
	prior_epoch: "prior_epoch",
	thread_status_not_loaded: "not_loaded",
	thread_status_system_error: "system_error",
	direct_input_false: "not_controllable",
	direct_input_unknown: "not_controllable",
	thread_start_outcome_unknown: "unknown_provenance",
	unknown_provenance: "unknown_provenance",
	thread_list_missing: "unknown_provenance",
	thread_list_ambiguous: "unknown_provenance",
	thread_loaded_list_ambiguous: "unknown_provenance",
	thread_source_custom: "unknown_provenance",
	thread_source_subagent: "unknown_provenance",
	thread_source_unknown: "unknown_provenance",
	thread_loaded_list_missing: "unknown_provenance",
});

/** Queue error codes that leave the remote effect's outcome undecidable once it has started. */
const UNDECIDABLE_QUEUE_CODES: ReadonlySet<CodexWorkhorseQueueError["code"]> = new Set([
	"reconciliation_failed",
	"stale_link",
]);

/**
 * Build an operations error; the one constructor call site keeps the option shape in one place.
 * @param code - The error code the caller can act on.
 * @param message - The human-readable reason.
 * @param options - Operation, outcome, identity and cause metadata.
 * @returns The error, not yet thrown.
 */
function operationError(
	code: ConstructorParameters<typeof CodexWorkhorseOperationsError>[0],
	message: string,
	options: ConstructorParameters<typeof CodexWorkhorseOperationsError>[2] = {},
): CodexWorkhorseOperationsError {
	return new CodexWorkhorseOperationsError(code, message, options);
}

/**
 * Read a message from any thrown value for event detail and error chaining.
 * @param error - The thrown value.
 * @returns Its message, or a placeholder for non-Error throws.
 */
function messageOf(error: unknown): string {
	return error instanceof Error ? error.message : "unknown error";
}

/**
 * Translate a thread-link refusal reason into the operation error code callers act on.
 * @param reason - The classifier's reason string.
 * @returns The matching operation error code, `not_ready` for unmapped reasons.
 */
function mapLinkReason(reason: string): WorkhorseOperationErrorCode {
	return LINK_REASON_CODES[reason] ?? "not_ready";
}

/**
 * Decide what a failed session mutation proved about delivery.
 * @param error - The thrown value from the session port.
 * @returns The outcome the session asserted, or unknown when it asserted nothing.
 */
function sessionMutationOutcome(error: unknown): SettledDelivery {
	return error instanceof CodexSessionMutationError ? error.outcome : "outcome_unknown";
}

/**
 * Decide what a failed queue mutation proved about delivery. Refusals raised by this module
 * or undecidable queue failures are unknown once the remote effect may have started, and
 * not delivered before that point.
 * @param error - The thrown value from the queue port or a pre-effect check.
 * @param effectStarted - Whether the remote effect had been issued when the error surfaced.
 * @returns The outcome to settle durably.
 */
function queueMutationOutcome(error: unknown, effectStarted = true): SettledDelivery {
	if (isUndecidableFailure(error)) {
		return effectStarted ? "outcome_unknown" : "not_delivered";
	}
	return assertedQueueOutcome(error) ?? "not_delivered";
}

/**
 * Recognise a failure that says nothing about the remote effect: a refusal raised by this module
 * after the effect may have started, or a queue error whose code is itself undecidable.
 * @param error - The thrown value.
 * @returns Whether the remote outcome is undecidable from this error alone.
 */
function isUndecidableFailure(error: unknown): boolean {
	return error instanceof CodexWorkhorseOperationsError || isUndecidableQueueError(error);
}

/**
 * The delivery outcome a queue error asserts, when it asserts one.
 * @param error - The thrown value.
 * @returns The asserted outcome, or null when the error asserts none.
 */
function assertedQueueOutcome(error: unknown): SettledDelivery | null {
	return error instanceof CodexWorkhorseQueueError ? error.outcome : null;
}

/**
 * Recognise a queue error whose code means the remote outcome cannot be decided.
 * @param error - The thrown value.
 * @returns Whether the error is a queue error with an undecidable code.
 */
function isUndecidableQueueError(error: unknown): boolean {
	return error instanceof CodexWorkhorseQueueError && UNDECIDABLE_QUEUE_CODES.has(error.code);
}

export { operationError, messageOf, mapLinkReason, sessionMutationOutcome, queueMutationOutcome };
