import { isMainModule } from "@archboard/server-lifecycle/server-host";
import { startServer } from "#server/http/application/wiring/application.ts";
import { serverStartupFailureMessage } from "#server/start-stop/lifecycle/startup-error.ts";

if (isMainModule(import.meta.url)) {
	void startServer().catch((error: unknown) => {
		process.stderr.write(`${serverStartupFailureMessage(error)}\n`);
		process.exitCode = 1;
	});
}
