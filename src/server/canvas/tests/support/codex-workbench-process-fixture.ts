import type { CanvasReadinessProcessFacts } from "../../codex-workbench-adapters.js";

/** One typed owned-process fact set; each owner overrides only what it proves. */
export function processFacts(
	overrides: Partial<CanvasReadinessProcessFacts> = {},
): CanvasReadinessProcessFacts {
	return {
		state: "running",
		ready: true,
		restartAttempt: 0,
		nextRestartAtMs: null,
		failure: null,
		...overrides,
	};
}

/** The steady state: the child runs and its app-server session is initialized. */
export function runningProcessFacts(): CanvasReadinessProcessFacts {
	return processFacts();
}
