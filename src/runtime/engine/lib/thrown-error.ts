// What a `catch` clause holds is `unknown`, and the runtime modules mostly want
// one of two things from it: the message to put in front of a person, or the
// `code` a system call or a canvas refusal attached. Narrowing lives here so
// the reading sites stay honest about what they know.

import { isRecord, stringAt } from "@/runtime/engine/lib/unknown-record";

/** An error that carries a machine-readable code beside its message. */
type CodedError = Error & { code: string };

/**
 * The human-readable message of anything thrown, without assuming it is an Error.
 * @param cause Whatever a catch clause received.
 * @returns The error's message, or the value stringified when it is not an Error.
 */
function errorMessage(cause: unknown): string {
	return cause instanceof Error ? cause.message : String(cause);
}

/**
 * Turn anything thrown into an Error, keeping the original when it already is one.
 * @param cause Whatever a catch clause received.
 * @returns The same Error, or a new one wrapping the stringified value.
 */
function asError(cause: unknown): Error {
	return cause instanceof Error ? cause : new Error(String(cause));
}

/**
 * The string `code` attached to a thrown value, such as a Node errno name.
 * @param cause Whatever a catch clause received.
 * @returns The code when the value carries a string one, otherwise undefined.
 */
function errorCode(cause: unknown): string | undefined {
	return isRecord(cause) ? stringAt(cause, "code") : undefined;
}

/**
 * Whether a thrown value carries the given errno-style code.
 * @param cause Whatever a catch clause received.
 * @param code The code to look for, such as `ESRCH`.
 * @returns True when the value's `code` is exactly that string.
 */
function hasErrorCode(cause: unknown, code: string): boolean {
	return errorCode(cause) === code;
}

/**
 * Build an Error with a code the CLI can branch on, without an unchecked cast.
 * @param message What went wrong, for a person.
 * @param code The machine-readable code, such as `CANVAS_UNREACHABLE`.
 * @returns The error with the code attached as an own property.
 */
function codedError(message: string, code: string): CodedError {
	return Object.assign(new Error(message), { code });
}

export { type CodedError, errorMessage, asError, errorCode, hasErrorCode, codedError };
