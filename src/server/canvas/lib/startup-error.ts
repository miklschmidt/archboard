import { CodexExecutableError } from "../../../runtime/codex-process/executable.js";
import { CodexProcessError } from "../../../runtime/codex-process/index.js";

function failures(error: unknown): readonly Error[] {
	if (!(error instanceof Error)) return [];
	return [
		error,
		...(error instanceof AggregateError ? error.errors.flatMap(failures) : []),
		...failures(error.cause),
	];
}

function codexFailure(error: unknown): CodexExecutableError | CodexProcessError | null {
	return (
		failures(error).find(
			(candidate): candidate is CodexExecutableError | CodexProcessError =>
				candidate instanceof CodexExecutableError || candidate instanceof CodexProcessError,
		) ?? null
	);
}

/** One bounded, actionable line for the public canvas startup boundary. */
export function canvasStartupFailureMessage(error: unknown): string {
	const codex = codexFailure(error);
	if (codex instanceof CodexExecutableError) return `Codex startup refused. ${codex.message}`;
	if (codex instanceof CodexProcessError) {
		switch (codex.code) {
			case "binary_invalid":
			case "binary_missing":
			case "binary_wrong_version":
			case "storage_refused":
			case "startup_timeout":
				return `Codex startup refused. ${codex.message}`;
			case "early_exit":
			case "spawn_failed":
			case "strict_config_rejected":
				return (
					"Codex app-server exited before the canvas became ready. " +
					"Run bun install to restore @openai/codex 0.151.0, then retry. " +
					codex.message
				);
			default:
				return `Codex startup failed. ${codex.message}`;
		}
	}
	return error instanceof Error ? error.message : "Canvas startup failed for an unknown reason.";
}
