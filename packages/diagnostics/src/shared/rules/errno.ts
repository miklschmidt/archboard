// Reading what was caught, without asserting what it is.
//
// `catch` hands over `unknown`, and the honest thing to do with it is ask
// rather than assert. Two questions are asked often enough to be worth one
// owner: which errno a filesystem failure carries, so a caller can tell
// "nothing there" from a real failure, and what to put in a refusal a person
// reads.

/**
 * Whether a value can be read by property name.
 * @param value Anything.
 * @returns True when the value is a non-null object.
 */
function canReadProperties(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

/**
 * The `code` a Node filesystem error carries (`ENOENT`, `EEXIST`).
 * @param error Whatever was caught.
 * @returns The code, or undefined when the error carries none.
 */
function errnoCode(error: unknown): string | undefined {
	if (!canReadProperties(error)) {
		return undefined;
	}
	const code = error["code"];
	return typeof code === "string" ? code : undefined;
}

/**
 * The message of whatever was caught, for wrapping into a refusal.
 * @param error Whatever was caught.
 * @returns The error's message, the string itself, or a placeholder for anything else.
 */
function errorMessage(error: unknown): string {
	if (error instanceof Error) {
		return error.message;
	}
	return typeof error === "string" ? error : "unknown error";
}

export { errnoCode, errorMessage };
