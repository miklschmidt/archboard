import { isMainModule } from "@archboard/server-lifecycle/server-host";
import { startServer } from "#server/wiring/application/application.ts";
import { serverStartupFailureMessage } from "#server/lifecycle/startup/startup-error.ts";

if (isMainModule(import.meta.url)) {
	void startServer().catch((error: unknown) => {
		process.stderr.write(`${serverStartupFailureMessage(error)}\n`);
		process.exitCode = 1;
	});
}
