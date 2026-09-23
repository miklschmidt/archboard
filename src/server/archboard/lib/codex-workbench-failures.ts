/**
 * What a failure says, for a message the workbench reports rather than throws.
 * @param error Whatever was thrown.
 * @returns Its message, or its string form for a non-Error.
 */
function failureMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

/**
 * Keep a second failure beside the first rather than losing either: teardown
 * runs every step it owes whatever any one of them does, and reports them all.
 * @param current What has failed so far, or null.
 * @param next What has just failed.
 * @param message What the two of them together mean.
 * @returns The failure to keep carrying.
 */
function appendFailure(current: Error | null, next: unknown, message: string): Error {
	const nextError = next instanceof Error ? next : new Error(String(next));
	return current === null ? nextError : new AggregateError([current, nextError], message);
}

export { appendFailure, failureMessage };
