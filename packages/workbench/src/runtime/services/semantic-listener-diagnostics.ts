const LISTENER_DIAGNOSTIC_FALLBACK_NAME = "ThrownValue";
const LISTENER_DIAGNOSTIC_FALLBACK_MESSAGE = "listener failure details unavailable";
const LISTENER_DIAGNOSTIC_ERROR_NAME_FALLBACK = "Error";

/**
 * Read one text field off a thrown value without trusting it: a listener's error may be a hostile
 * object whose own getters throw, and a diagnostic must never itself fail.
 * @param error - The thrown value.
 * @param field - The field to read.
 * @param fallback - What to report when the field cannot be read or is not usable text.
 * @returns The field's text, or the fallback.
 */
function errorTextField(error: Error, field: "name" | "message", fallback: string): string {
	let value: unknown;
	try {
		value = error[field];
	} catch {
		return fallback;
	}
	return typeof value === "string" && value.length > 0 ? value : fallback;
}

/**
 * Whether a thrown value is an Error, treating a proxy whose own `instanceof` throws as not one.
 * @param value - The thrown value.
 * @returns True when the value is an Error and says so safely.
 */
function isErrorInstance(value: unknown): value is Error {
	try {
		return value instanceof Error;
	} catch {
		return false;
	}
}

/**
 * The name and message to record for a listener failure, taken defensively: nothing a listener
 * throws can stop the publisher from recording that it failed.
 * @param error - The thrown value.
 * @returns The diagnostic name and message.
 */
function errorDetails(error: unknown): { errorName: string; message: string } {
	if (isErrorInstance(error)) {
		return {
			errorName: errorTextField(error, "name", LISTENER_DIAGNOSTIC_ERROR_NAME_FALLBACK),
			message: errorTextField(error, "message", LISTENER_DIAGNOSTIC_FALLBACK_MESSAGE),
		};
	}
	try {
		return { errorName: LISTENER_DIAGNOSTIC_FALLBACK_NAME, message: String(error) };
	} catch {
		return {
			errorName: LISTENER_DIAGNOSTIC_FALLBACK_NAME,
			message: LISTENER_DIAGNOSTIC_FALLBACK_MESSAGE,
		};
	}
}

export {
	LISTENER_DIAGNOSTIC_FALLBACK_NAME,
	LISTENER_DIAGNOSTIC_FALLBACK_MESSAGE,
	LISTENER_DIAGNOSTIC_ERROR_NAME_FALLBACK,
	errorDetails,
};
