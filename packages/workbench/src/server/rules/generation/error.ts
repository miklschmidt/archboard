export class CodexWorkbenchCompositionError extends Error {
	override readonly name = "CodexWorkbenchCompositionError";

	/**
	 * Name a failure to compose or run the Codex workbench, so a caller can
	 * tell a workbench that never started from one that failed on the way up
	 * or down.
	 * @param code Which of the three it is.
	 * @param message What happened.
	 * @param cause The failure underneath, when there is one.
	 */
	constructor(
		readonly code: "not_started" | "startup_failed" | "shutdown_failed",
		message: string,
		override readonly cause?: unknown,
	) {
		super(message);
	}
}
