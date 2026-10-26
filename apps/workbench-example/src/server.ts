import { runExample } from "#server/lifecycle/startup/run.ts";

if (import.meta.main) {
	void runExample().catch((error: unknown) => {
		console.error(error instanceof Error ? error.message : String(error));
		process.exitCode = 1;
	});
}
