import { isMainModule } from "@/runtime/engine/entry";
import application, { canvasStartupFailureMessage, startServer } from "@/server/canvas";

export { startServer };
export default application;

if (isMainModule(import.meta.url)) {
	void startServer().catch((error: unknown) => {
		process.stderr.write(`${canvasStartupFailureMessage(error)}\n`);
		process.exitCode = 1;
	});
}
