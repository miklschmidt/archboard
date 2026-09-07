import { CodexExecutableError } from "@/runtime/codex-process/executable";
import { CodexProcessError } from "@/runtime/codex-process";

/**
 * Every error inside one thrown value: itself, an aggregate's members and
 * whatever each of them was caused by.
 * @param error Whatever startup threw.
 * @returns The errors, outermost first.
 */
function failures(error: unknown): readonly Error[] {
	if (!(error instanceof Error)) {
		return [];
	}
	return [
		error,
		...(error instanceof AggregateError ? error.errors.flatMap(failures) : []),
		...failures(error.cause),
	];
}

/**
 * The Codex failure inside a startup failure, which is the one worth naming
 * to whoever started the canvas.
 * @param error Whatever startup threw.
 * @returns The Codex failure, or null when startup failed for another reason.
 */
function codexFailure(error: unknown): CodexExecutableError | CodexProcessError | null {
	return (
		failures(error).find(
			(candidate): candidate is CodexExecutableError | CodexProcessError =>
				candidate instanceof CodexExecutableError || candidate instanceof CodexProcessError,
		) ?? null
	);
}

/** The Codex process failures that are a refusal to start rather than a fault. */
const CODEX_STARTUP_REFUSALS = new Set([
	"binary_invalid",
	"binary_missing",
	"binary_wrong_version",
	"storage_refused",
	"startup_timeout",
]);

/** The Codex process failures a reinstall is the answer to. */
const CODEX_INSTALL_FAILURES = new Set(["early_exit", "spawn_failed", "strict_config_rejected"]);

/**
 * What a Codex process failure says to whoever started the canvas.
 * @param codex The failure.
 * @returns The line.
 */
function codexProcessLine(codex: CodexProcessError): string {
	if (CODEX_STARTUP_REFUSALS.has(codex.code)) {
		return `Codex startup refused. ${codex.message}`;
	}
	if (CODEX_INSTALL_FAILURES.has(codex.code)) {
		return (
			"Codex app-server exited before the canvas became ready. " +
			"Run bun install to restore @openai/codex 0.151.0, then retry. " +
			codex.message
		);
	}
	return `Codex startup failed. ${codex.message}`;
}

/**
 * One bounded, actionable line for the public canvas startup boundary.
 * @param error Whatever startup threw.
 * @returns The line.
 */
export function canvasStartupFailureMessage(error: unknown): string {
	const codex = codexFailure(error);
	if (codex instanceof CodexExecutableError) {
		return `Codex startup refused. ${codex.message}`;
	}
	if (codex instanceof CodexProcessError) {
		return codexProcessLine(codex);
	}
	return error instanceof Error ? error.message : "Canvas startup failed for an unknown reason.";
}
