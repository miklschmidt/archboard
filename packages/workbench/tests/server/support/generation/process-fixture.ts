import type { ServerReadinessProcessFacts } from "#server/rules/generation/readiness.ts";

/** One typed owned-process fact set; each owner overrides only what it proves. */
function processFacts(
	overrides: Partial<ServerReadinessProcessFacts> = {},
): ServerReadinessProcessFacts {
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
function runningProcessFacts(): ServerReadinessProcessFacts {
	return processFacts();
}

export { processFacts, runningProcessFacts };
