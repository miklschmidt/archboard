import type { WireRequestCorrelation } from "../../../shared/codex-workbench-identity/index.js";

export type CodexRequestFailureReason =
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

export type CodexRequestOutcome = "not_delivered" | "outcome_unknown";

export interface TransportRemoteErrorSummary {
	readonly code: number;
	readonly message: string;
	readonly dataPresent: boolean;
}

function redactRemoteError(error: CodexRemoteError): TransportRemoteErrorSummary {
	const message = error.message.length > 256 ? `${error.message.slice(0, 253)}...` : error.message;
	return Object.freeze({
		code: error.code,
		message,
		dataPresent: Object.prototype.hasOwnProperty.call(error, "data"),
	});
}

export class CodexTransportError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "CodexTransportError";
	}
}

export class CodexTransportClosedError extends CodexTransportError {
	override readonly name = "CodexTransportClosedError";
	readonly reason: CodexRequestFailureReason;

	constructor(reason: CodexRequestFailureReason = "transport-closed") {
		super(`The Codex transport is closed; it cannot accept another ${reason} operation.`);
		this.reason = reason;
	}
}

export class CodexTransportWriteError extends CodexTransportError {
	override readonly name = "CodexTransportWriteError";
	readonly reason: Extract<
		CodexRequestFailureReason,
		"backpressure" | "frame-too-large" | "write-error" | "shutdown"
	>;

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

export class CodexTransportUsageError extends CodexTransportError {
	override readonly name = "CodexTransportUsageError";

	constructor(detail: string) {
		super(`Invalid Codex transport operation: ${detail}`);
	}
}

export class CodexTransportOwnershipError extends CodexTransportError {
	override readonly name = "CodexTransportOwnershipError";

	constructor(detail: string) {
		super(`Codex reverse-request ownership error: ${detail}`);
	}
}

export class CodexTransportRequestError extends CodexTransportError {
	override readonly name = "CodexTransportRequestError";
	readonly method: string;
	readonly correlation: WireRequestCorrelation;
	readonly outcome: CodexRequestOutcome;
	readonly reason: CodexRequestFailureReason;
	readonly accepted: boolean;
	readonly retryEligible: boolean;

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

export interface CodexRemoteError {
	readonly code: number;
	readonly message: string;
	readonly data?: unknown;
}

export class CodexTransportRemoteError extends CodexTransportError {
	override readonly name = "CodexTransportRemoteError";
	readonly method: string;
	readonly correlation: WireRequestCorrelation;
	readonly rpcError: TransportRemoteErrorSummary;

	constructor(input: {
		readonly method: string;
		readonly correlation: WireRequestCorrelation;
		readonly rpcError: CodexRemoteError;
	}) {
		super(
			`Codex request ${input.method} returned JSON-RPC error ${input.rpcError.code}: ${
				input.rpcError.message.length > 256
					? `${input.rpcError.message.slice(0, 253)}...`
					: input.rpcError.message
			}`,
		);
		this.method = input.method;
		this.correlation = input.correlation;
		this.rpcError = redactRemoteError(input.rpcError);
	}
}
