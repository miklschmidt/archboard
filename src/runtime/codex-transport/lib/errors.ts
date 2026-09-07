import { CODEX_APP_SERVER_CAPACITY } from "@/shared/codex-app-server-capacity";
import type { WireRequestCorrelation } from "@/shared/codex-workbench-identity";

type CodexRequestFailureReason =
	| "cancelled"
	| "timeout"
	| "child-exit"
	| "stdout-error"
	| "write-error"
	| "shutdown"
	| "backpressure"
	| "frame-too-large"
	| "transport-closed"
	| "malformed-response";

type CodexRequestOutcome = "not_delivered" | "outcome_unknown";

interface TransportRemoteErrorSummary {
	readonly code: number;
	readonly message: string;
	readonly dataPresent: boolean;
}

interface CodexRemoteError {
	readonly code: number;
	readonly message: string;
	readonly data?: unknown;
}

/**
 * Shortens a remote error message to the shared text bound so a hostile child cannot fill
 * Archboard's diagnostics.
 * @param message The message as received.
 * @returns The message, truncated with an ellipsis when it exceeds the bound.
 */
function truncateRemoteMessage(message: string): string {
	const maximum = CODEX_APP_SERVER_CAPACITY.text.maxChars;
	const suffix = "...";
	return message.length > maximum
		? `${message.slice(0, maximum - suffix.length)}${suffix}`
		: message;
}

/**
 * Reduces a JSON-RPC error to what Archboard retains: code, bounded message, and whether
 * data was attached, since the data itself is unbounded and untrusted.
 * @param error The JSON-RPC error as received.
 * @returns The frozen summary.
 */
function redactRemoteError(error: CodexRemoteError): TransportRemoteErrorSummary {
	return Object.freeze({
		code: error.code,
		message: truncateRemoteMessage(error.message),
		dataPresent: Object.prototype.hasOwnProperty.call(error, "data"),
	});
}

/** The base of every transport failure, so callers can catch the family at once. */
class CodexTransportError extends Error {
	/**
	 * Creates the failure.
	 * @param message What went wrong.
	 */
	constructor(message: string) {
		super(message);
		this.name = "CodexTransportError";
	}
}

/** An operation arrived after the transport stopped accepting work. */
class CodexTransportClosedError extends CodexTransportError {
	override readonly name = "CodexTransportClosedError";
	readonly reason: CodexRequestFailureReason;

	/**
	 * Names why the transport is closed.
	 * @param reason The failure reason the operation is charged to.
	 */
	constructor(reason: CodexRequestFailureReason = "transport-closed") {
		super(`The Codex transport is closed; it cannot accept another ${reason} operation.`);
		this.reason = reason;
	}
}

/** A frame could not be queued or written to Codex stdin. */
class CodexTransportWriteError extends CodexTransportError {
	override readonly name = "CodexTransportWriteError";
	readonly reason: Extract<
		CodexRequestFailureReason,
		"backpressure" | "frame-too-large" | "write-error" | "shutdown"
	>;

	/**
	 * Names the write failure.
	 * @param reason Which write bound or fault refused the frame.
	 * @param detail The specific bound or stream fault.
	 */
	constructor(
		reason: Extract<
			CodexRequestFailureReason,
			"backpressure" | "frame-too-large" | "write-error" | "shutdown"
		>,
		detail: string,
	) {
		super(`The Codex transport could not write a frame (${reason}): ${detail}`);
		this.reason = reason;
	}
}

/** The caller asked the transport for something the contract does not allow. */
class CodexTransportUsageError extends CodexTransportError {
	override readonly name = "CodexTransportUsageError";

	/**
	 * Names the misuse.
	 * @param detail What the caller got wrong.
	 */
	constructor(detail: string) {
		super(`Invalid Codex transport operation: ${detail}`);
	}
}

/** A reverse request was answered by someone other than its owner, or twice. */
class CodexTransportOwnershipError extends CodexTransportError {
	override readonly name = "CodexTransportOwnershipError";

	/**
	 * Names the ownership violation.
	 * @param detail Which owner or request was mismatched.
	 */
	constructor(detail: string) {
		super(`Codex reverse-request ownership error: ${detail}`);
	}
}

/** A request settled without a Codex answer; it says whether Codex may have seen it. */
class CodexTransportRequestError extends CodexTransportError {
	override readonly name = "CodexTransportRequestError";
	readonly method: string;
	readonly correlation: WireRequestCorrelation;
	readonly outcome: CodexRequestOutcome;
	readonly reason: CodexRequestFailureReason;
	readonly accepted: boolean;
	readonly retryEligible: boolean;

	/**
	 * Records the settlement so the caller can decide whether a retry is safe.
	 * @param input The request's method, correlation, outcome, reason, and retry facts.
	 */
	constructor(input: {
		readonly method: string;
		readonly correlation: WireRequestCorrelation;
		readonly outcome: CodexRequestOutcome;
		readonly reason: CodexRequestFailureReason;
		readonly accepted: boolean;
		readonly retryEligible: boolean;
	}) {
		const remoteStatus =
			input.outcome === "outcome_unknown" ? "outcome is unknown" : "was not delivered";
		super(
			`Codex request ${input.method} ${input.reason}; it ${remoteStatus}. ` +
				`Remote cancellation was not sent.`,
		);
		this.method = input.method;
		this.correlation = input.correlation;
		this.outcome = input.outcome;
		this.reason = input.reason;
		this.accepted = input.accepted;
		this.retryEligible = input.retryEligible;
	}
}

/** Codex answered a request with a JSON-RPC error. */
class CodexTransportRemoteError extends CodexTransportError {
	override readonly name = "CodexTransportRemoteError";
	readonly method: string;
	readonly correlation: WireRequestCorrelation;
	readonly rpcError: TransportRemoteErrorSummary;

	/**
	 * Retains the redacted remote error with the request it answered.
	 * @param input The request's method and correlation with the JSON-RPC error received.
	 */
	constructor(input: {
		readonly method: string;
		readonly correlation: WireRequestCorrelation;
		readonly rpcError: CodexRemoteError;
	}) {
		super(
			`Codex request ${input.method} returned JSON-RPC error ${input.rpcError.code}: ${truncateRemoteMessage(input.rpcError.message)}`,
		);
		this.method = input.method;
		this.correlation = input.correlation;
		this.rpcError = redactRemoteError(input.rpcError);
	}
}

export {
	type CodexRequestFailureReason,
	type CodexRequestOutcome,
	type TransportRemoteErrorSummary,
	CodexTransportError,
	CodexTransportClosedError,
	CodexTransportWriteError,
	CodexTransportUsageError,
	CodexTransportOwnershipError,
	CodexTransportRequestError,
	type CodexRemoteError,
	CodexTransportRemoteError,
	redactRemoteError,
};
