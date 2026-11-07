import { startServer } from "#server/http/application/wiring/application.ts";
import { serverStartupFailureMessage } from "#server/start-stop/lifecycle/startup-error.ts";

// The server's entry, which nothing imports: a checkout runs this file with Bun, and the
// executable of a release imports it when it is started as its server (ADR 0076).
void startServer().catch((error: unknown) => {
	process.stderr.write(`${serverStartupFailureMessage(error)}\n`);
	process.exitCode = 1;
});
