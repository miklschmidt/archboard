import { launchHeadlessChromium, HeadlessChromiumError } from "@/runtime/headless-chromium/index";
import {
	SEMANTIC_RASTER_STARTUP_TIMEOUT_MS,
	SEMANTIC_RASTER_CLEANUP_MS,
} from "@/shared/timing/timing";

try {
	const chromium = await launchHeadlessChromium({
		chromiumPath: process.argv[2] ?? "",
		startupTimeoutMs: SEMANTIC_RASTER_STARTUP_TIMEOUT_MS,
		cleanupTimeoutMs: SEMANTIC_RASTER_CLEANUP_MS,
	});
	await chromium.stop();
	process.exitCode = 1;
} catch (error) {
	if (!(error instanceof HeadlessChromiumError)) throw error;
	console.log(JSON.stringify({ code: error.code, cleanup: error.cleanup }));
}
