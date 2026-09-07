// The errno name of a thrown filesystem error, without asserting that
// whatever was caught is one.

import { isRecord } from "@/runtime/engine/lib/unknown-record";

/**
 * The `code` a Node filesystem error carries (`ENOENT`, `EEXIST`), so a caller
 * can tell "nothing there" from a real failure.
 * @param error Whatever was caught.
 * @returns The code, or undefined when the error carries none.
 */
function errnoCode(error: unknown): string | undefined {
	if (!isRecord(error)) {
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
