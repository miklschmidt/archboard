import type { OperationId } from "@/shared/codex-workbench-identity";
import type { DynamicDispatchErrorCode } from "@/runtime/codex-dynamic-tools/lib/vocabulary";

type DynamicOperationTerminalDisposition = "consumed" | "retired";

/** A refusal or failure of one dynamic call, carrying the wire refusal code. */
class CodexDynamicToolsError extends Error {
	override readonly name = "CodexDynamicToolsError";
	readonly code: DynamicDispatchErrorCode;
	override readonly cause: unknown;

	/**
	 * Build a dynamic-tools error with its wire code.
	 * @param code The refusal or delivery code returned to the caller.
	 * @param message Human-readable explanation.
	 * @param cause The underlying thrown value, if any.
	 */
	constructor(code: DynamicDispatchErrorCode, message: string, cause?: unknown) {
		super(message);
		this.code = code;
		this.cause = cause;
	}
}

/**
 * The host could not prove one issued operation identity terminal. It is never
 * retried by the dispatcher; the epoch is quarantined instead.
 */
class CodexDynamicOperationTerminalizationError extends CodexDynamicToolsError {
	readonly retryEligible = false;
	readonly operationId: OperationId;
	readonly disposition: DynamicOperationTerminalDisposition;

	/**
	 * Build a terminalization error for one operation identity.
	 * @param operationId The identity whose terminal state is unproven.
	 * @param disposition The disposition the caller asked the host for.
	 * @param message Human-readable explanation.
	 * @param cause The underlying thrown values, if any.
	 */
	constructor(
		operationId: OperationId,
		disposition: DynamicOperationTerminalDisposition,
		message: string,
		cause?: unknown,
	) {
		super("system_error", message, cause);
		this.operationId = operationId;
		this.disposition = disposition;
	}
}

/** The exact child epoch is quarantined and cannot deliver a dynamic response. */
class CodexDynamicEpochQuarantinedError extends CodexDynamicToolsError {
	readonly retryEligible = false;

	/**
	 * Build a quarantine error.
	 * @param message Human-readable explanation.
	 * @param cause The underlying thrown value, if any.
	 */
	constructor(message: string, cause?: unknown) {
		super("system_error", message, cause);
	}
}

export {
	type DynamicOperationTerminalDisposition,
	CodexDynamicEpochQuarantinedError,
	CodexDynamicOperationTerminalizationError,
	CodexDynamicToolsError,
};
