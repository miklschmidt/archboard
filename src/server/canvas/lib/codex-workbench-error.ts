export class CodexWorkbenchCompositionError extends Error {
	override readonly name = "CodexWorkbenchCompositionError";

	/**
	 *
	 */
	constructor(
		readonly code: "not_started" | "startup_failed" | "shutdown_failed",
		message: string,
		override readonly cause?: unknown,
	) {
		super(message);
	}
}
