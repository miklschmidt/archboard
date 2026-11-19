import {
	CodexProcessError,
	type CodexProcessFailureCode,
} from "#runtime/processes/process-contract.ts";
import {
	CodexExecutableError,
	type CodexExecutableFailureCode,
} from "#runtime/services/executable.ts";
import {
	CodexSessionMutationError,
	type SessionMutationOutcome,
} from "#runtime/session/services/session-api.ts";
import {
	CodexTransportOwnershipError,
	CodexTransportRemoteError,
	CodexTransportUsageError,
} from "#runtime/transport/clients/transport-errors.ts";
import {
	IdentityValidationError,
	type IdentityValidationCode,
} from "#shared/schemas/identity-values.ts";

/** What went wrong in Codex, read from a thrown value. Every kind carries the error's message. */
export type CodexFailure =
	/** A session mutation failed; the outcome says whether Codex may have applied it. */
	| {
			readonly kind: "mutation";
			readonly method: string;
			readonly outcome: SessionMutationOutcome;
			readonly message: string;
	  }
	/** The transport refused a write, so nothing was sent. */
	| { readonly kind: "refused_write"; readonly message: string }
	/** Codex answered the request with a JSON-RPC error. */
	| {
			readonly kind: "remote";
			readonly method: string;
			readonly code: number;
			readonly message: string;
	  }
	/** The app-server process failed; a terminal failure ends its owner. */
	| {
			readonly kind: "process";
			readonly code: CodexProcessFailureCode;
			readonly terminal: boolean;
			readonly message: string;
	  }
	/** The Codex executable failed its proof. */
	| {
			readonly kind: "executable";
			readonly code: CodexExecutableFailureCode;
			readonly message: string;
	  }
	/** An identity was refused by the rule its code names. */
	| {
			readonly kind: "identity";
			readonly code: IdentityValidationCode;
			readonly message: string;
	  };

/** A failure a caller may make, such as a fake that fails the way Codex would. */
export type CodexFailureSpec = Extract<
	CodexFailure,
	{ readonly kind: "mutation" | "process" | "refused_write" | "remote" }
>;

/**
 * Gives an error the exact message its spec states, in place of the one its class composes.
 * @param error The error.
 * @param message The message.
 * @returns The same error.
 */
function stating<Failure extends Error>(error: Failure, message: string): Failure {
	error.message = message;
	return error;
}

/**
 * Makes the error Codex itself would throw for a failure, with the message the spec states, for
 * a fake that must fail the way Codex would or a caller that reports a Codex failure of its own.
 * @param spec The failure, with its message.
 * @param cause What it was caused by, if anything.
 * @returns The error to throw; readCodexFailure reads the spec back from it.
 */
export function createCodexFailure(spec: CodexFailureSpec, cause?: unknown): Error {
	if (spec.kind === "mutation")
		return new CodexSessionMutationError(spec.method, spec.outcome, spec.message, cause);
	if (spec.kind === "process") return new CodexProcessError({ ...spec, cause });
	if (spec.kind === "refused_write")
		return stating(new CodexTransportUsageError(spec.message, { cause }), spec.message);
	const rpcError = { code: spec.code, message: spec.message };
	return stating(
		new CodexTransportRemoteError({ method: spec.method, rpcError }, { cause }),
		spec.message,
	);
}

/**
 * The failure of a Codex session, transport or identity error, read from the value itself.
 * @param error The value.
 * @returns The failure, or null.
 */
function sessionFailure(error: unknown): CodexFailure | null {
	if (error instanceof CodexSessionMutationError) {
		const { method, outcome, message } = error;
		return { kind: "mutation", method, outcome, message };
	}
	if (error instanceof CodexTransportUsageError || error instanceof CodexTransportOwnershipError)
		return { kind: "refused_write", message: error.message };
	if (error instanceof CodexTransportRemoteError) {
		const { method, rpcError, message } = error;
		return { kind: "remote", method, code: rpcError.code, message };
	}
	if (error instanceof IdentityValidationError)
		return { kind: "identity", code: error.code, message: error.message };
	return null;
}

/**
 * Reads what went wrong in Codex from a thrown value. Only the value itself is read: an error it
 * was caused by, or an aggregate's members, are the caller's to walk.
 * @param error Whatever was thrown.
 * @returns The failure, or null when the value is no Codex failure.
 */
export function readCodexFailure(error: unknown): CodexFailure | null {
	if (error instanceof CodexProcessError) {
		const { code, terminal, message } = error;
		return { kind: "process", code, terminal, message };
	}
	if (error instanceof CodexExecutableError)
		return { kind: "executable", code: error.code, message: error.message };
	return sessionFailure(error);
}
