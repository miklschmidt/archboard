// What a headless Chromium could not do, and what its teardown proved.

/**
 * Why Chromium could not be used: `unavailable` when it could not be started
 * at all, `failed` when a started one did not do what it was asked.
 */
type HeadlessChromiumErrorCode = "unavailable" | "failed";

/** What a stopped Chromium proved about its own teardown. */
interface HeadlessChromiumCleanup {
	readonly clean: boolean;
	readonly pid: number | null;
	readonly processGone: boolean;
	readonly tempRootRemoved: boolean;
	readonly errors: readonly string[];
}

/** A headless Chromium that could not do something, with the stable half of why. */
class HeadlessChromiumError extends Error {
	/** Which failure this is. */
	readonly code: HeadlessChromiumErrorCode;
	/** What tearing down a start that failed part way proved, when this is one. */
	readonly cleanup: HeadlessChromiumCleanup | undefined;

	/**
	 * Fail, with a reason.
	 * @param code Which failure this is.
	 * @param message What a person should read.
	 * @param details What failed underneath and, for a failed start, its teardown.
	 * @param details.cause What failed underneath.
	 * @param details.cleanup What the teardown of a failed start proved.
	 */
	constructor(
		code: HeadlessChromiumErrorCode,
		message: string,
		details: { readonly cause?: unknown; readonly cleanup?: HeadlessChromiumCleanup } = {},
	) {
		super(message, details.cause === undefined ? undefined : { cause: details.cause });
		this.name = "HeadlessChromiumError";
		this.code = code;
		this.cleanup = details.cleanup;
	}
}

/**
 * The message of anything thrown.
 * @param error What was thrown.
 * @returns Its message.
 */
function messageOf(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

export {
	HeadlessChromiumError,
	messageOf,
	type HeadlessChromiumCleanup,
	type HeadlessChromiumErrorCode,
};
