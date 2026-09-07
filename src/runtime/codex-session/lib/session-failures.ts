import { ProtocolDecodeError } from "@/runtime/codex-protocol";
import {
	CodexSessionError,
	CodexSessionMutationError,
	type SessionMutationOutcome,
} from "@/runtime/codex-session/lib/contract";

/**
 * Whether a value is a plain JSON object, the only shape request parameters may take.
 * @param value - Any value.
 * @returns True for a non-null, non-array object.
 */
function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}

/**
 * Accept the parameters of one request, treating an absent value as the empty object and
 * refusing anything that is not a JSON object before it reaches the wire decoder.
 * @param value - The caller's parameters.
 * @returns The parameters as a record.
 */
function requestParams(value: unknown): Readonly<Record<string, unknown>> {
	if (value === undefined) {
		return {};
	}
	if (!isRecord(value)) {
		throw new CodexSessionError(
			"invalid_request",
			"Codex session request parameters must be a JSON object.",
		);
	}
	return value;
}

/**
 * Whether a thrown value already carries a settled delivery outcome, the fact the session needs
 * before it can say anything about a mutation.
 * @param value - The thrown value.
 * @returns True when it names `not_delivered` or `outcome_unknown`.
 */
function hasOutcome(
	value: unknown,
): value is { readonly outcome: "not_delivered" | "outcome_unknown" } {
	return (
		isRecord(value) &&
		(value["outcome"] === "not_delivered" || value["outcome"] === "outcome_unknown")
	);
}

/**
 * Wrap whatever a mutation threw as a session mutation error that states the delivery outcome.
 * A decode failure means the answer arrived but could not be read, so the remote effect may well
 * have happened; anything else that names no outcome is treated as never delivered.
 * @param method - The protocol method that failed.
 * @param error - The thrown value.
 * @returns The mutation error to surface to the caller.
 */
function mutationFailure(method: string, error: unknown): CodexSessionMutationError {
	if (error instanceof CodexSessionMutationError) {
		return error;
	}
	const outcome: SessionMutationOutcome = hasOutcome(error)
		? error.outcome
		: error instanceof ProtocolDecodeError
			? "outcome_unknown"
			: "not_delivered";
	const message =
		outcome === "outcome_unknown"
			? `Codex mutation ${method} has an unknown outcome; inspect authoritative state before retrying.`
			: `Codex mutation ${method} was not delivered.`;
	return new CodexSessionMutationError(method, outcome, message, error);
}

/**
 * The delivery outcome a thrown value asserts, if it asserts one.
 * @param error - The thrown value.
 * @returns The outcome, or undefined when nothing was asserted.
 */
function mutationOutcome(error: unknown): SessionMutationOutcome | undefined {
	if (error instanceof CodexSessionMutationError) {
		return error.outcome;
	}
	return hasOutcome(error) ? error.outcome : undefined;
}

export { isRecord, requestParams, hasOutcome, mutationFailure, mutationOutcome };
