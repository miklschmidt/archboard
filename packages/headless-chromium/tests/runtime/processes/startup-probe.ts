import { launchHeadlessChromium } from "#runtime/processes/launch.ts";
import { HeadlessChromiumError } from "#runtime/processes/errors.ts";

try {
	const chromium = await launchHeadlessChromium({
		chromiumPath: process.argv[2] ?? "",
		startupTimeoutMs: 30_000,
		cleanupTimeoutMs: 1000,
	});
	await chromium.stop();
	process.exitCode = 1;
} catch (error) {
	if (!(error instanceof HeadlessChromiumError)) throw error;
	process.stdout.write(`${JSON.stringify({ code: error.code, cleanup: error.cleanup })}\n`);
}
