import { expect, test } from "bun:test";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

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
