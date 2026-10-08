import { expect, test } from "bun:test";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { HeadlessChromiumError, launchHeadlessChromium } from "@/runtime/headless-chromium/index";
import {
	SEMANTIC_RASTER_STARTUP_TIMEOUT_MS,
	SEMANTIC_RASTER_CLEANUP_MS,
} from "@/shared/timing/timing";

test("an executable that exits before listening keeps its failure and cleans its process and profile", async () => {
	const directory = mkdtempSync(join(tmpdir(), "archboard-startup-test-"));
	try {
		const executable = join(directory, "browser");
		writeFileSync(executable, "#!/bin/sh\nexit 17\n", { mode: 0o700 });
		let failure: unknown;
		try {
			const chromium = await launchHeadlessChromium({
				chromiumPath: executable,
				startupTimeoutMs: SEMANTIC_RASTER_STARTUP_TIMEOUT_MS,
				cleanupTimeoutMs: SEMANTIC_RASTER_CLEANUP_MS,
			});
			await chromium.stop();
		} catch (error) {
			failure = error;
		}
		expect(failure).toBeInstanceOf(HeadlessChromiumError);
		const error = failure as HeadlessChromiumError;
		expect(error).toMatchObject({
			code: "unavailable",
			cleanup: { clean: true, processGone: true, tempRootRemoved: true, errors: [] },
		});
		expect(error.cleanup?.pid).toBeGreaterThan(0);
		expect(error.cause).toBeInstanceOf(Error);
	} finally {
		rmSync(directory, { recursive: true, force: true });
	}
});

test.skipIf(process.platform !== "darwin")(
	"a macOS sandbox refuses startup before the executable runs or a profile exists",
	async () => {
		const directory = mkdtempSync(join(tmpdir(), "archboard-startup-test-"));
		try {
			const marker = join(directory, "started");
			const executable = join(directory, "browser");
			writeFileSync(executable, '#!/bin/sh\ntouch "$ARCHBOARD_TEST_START_MARKER"\nexit 17\n', {
				mode: 0o700,
			});
			const child = Bun.spawn(
				[
					"/usr/bin/sandbox-exec",
					"-p",
					'(version 1)(allow default)(deny mach-lookup (global-name "com.apple.coreservices.launchservicesd"))',
					process.execPath,
					join(import.meta.dir, "startup-probe.ts"),
					executable,
				],
				{
					env: { ...process.env, CODEX_SANDBOX: undefined, ARCHBOARD_TEST_START_MARKER: marker },
					stdout: "pipe",
					stderr: "pipe",
				},
			);
			const [status, stdout, stderr] = await Promise.all([
				child.exited,
				new Response(child.stdout).text(),
				new Response(child.stderr).text(),
			]);
			expect({ status, stderr }).toEqual({ status: 0, stderr: "" });
			expect(JSON.parse(stdout)).toEqual({
				code: "unavailable",
				cleanup: {
					clean: true,
					pid: null,
					processGone: true,
					tempRootRemoved: true,
					errors: [],
				},
			});
			expect(existsSync(marker)).toBe(false);
		} finally {
			rmSync(directory, { recursive: true, force: true });
		}
	},
);
