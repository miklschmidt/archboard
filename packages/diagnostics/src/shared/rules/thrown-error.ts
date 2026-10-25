// What a `catch` clause holds is `unknown`, and the runtime modules mostly want
// the message to put in front of a person from it. The `code` a system call
// attached is read by `errnoCode` of `./errno`. Narrowing lives here so the
// reading sites stay honest about what they know.

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
 * Build an Error with a code the CLI can branch on, without an unchecked cast.
 * @param message What went wrong, for a person.
 * @param code The machine-readable code, such as `SERVER_UNREACHABLE`.
 * @returns The error with the code attached as an own property.
 */
function codedError(message: string, code: string): CodedError {
	return Object.assign(new Error(message), { code });
}

export { errorMessage, asError, codedError };
