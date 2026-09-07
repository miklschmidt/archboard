import { isMainModule } from "@/runtime/engine/entry";
import { app, canvasStartupFailureMessage, startServer } from "@/server/canvas";

export { app, startServer };

if (isMainModule(import.meta.url)) {
	void startServer().catch((error: unknown) => {
		process.stderr.write(`${canvasStartupFailureMessage(error)}\n`);
		process.exitCode = 1;
	});
}
