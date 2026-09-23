import { isMainModule } from "@/runtime/engine/entry";
import { app, serverStartupFailureMessage, startServer } from "@/server/archboard";

export { app, startServer };

if (isMainModule(import.meta.url)) {
	void startServer().catch((error: unknown) => {
		process.stderr.write(`${serverStartupFailureMessage(error)}\n`);
		process.exitCode = 1;
	});
}
