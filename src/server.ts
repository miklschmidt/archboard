import { isMainModule } from "./runtime/engine/entry.js";
import application, { canvasStartupFailureMessage, startServer } from "./server/canvas/index.js";

export { startServer };
export default application;

if (isMainModule(import.meta.url)) {
	void startServer().catch((error: unknown) => {
		process.stderr.write(`${canvasStartupFailureMessage(error)}\n`);
		process.exitCode = 1;
	});
}
