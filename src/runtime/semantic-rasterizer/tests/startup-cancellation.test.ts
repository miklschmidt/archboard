import { describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createSemanticRasterizer } from "@/runtime/semantic-rasterizer/index";
import { listProcessGroupObservations } from "@/shared/process-observation";
import {
	CLI_INTERRUPT_CLEANUP_MS,
	PROCESS_GROUP_OBSERVATION_POLL_MS,
} from "@/shared/timing/timing";

// Startup cancellation needs a process that never opens DevTools. The fake
// records its real pid/profile so the test can prove the interrupted owner
// settles and removes both before the CLI's forced-exit deadline.
describe("rasterizer startup ownership", () => {
	test.each(["cancel", "stop"] as const)(
		"%s during startup removes the owned group and profile",
		async (action) => {
			const root = mkdtempSync(join(tmpdir(), "archboard-raster-startup-"));
			const executable = join(root, "chromium");
			const evidence = join(root, "started");
			writeFileSync(
				executable,
				`#!/bin/sh\ntrap '' TERM\nprintf '%s\\n%s\\n' "$$" "$PWD" > '${evidence}'\nwhile :; do sleep 30; done\n`,
				{ mode: 0o700 },
			);
			const controller = new AbortController();
			const rasterizer = createSemanticRasterizer({ chromiumPath: executable });
			const capture = rasterizer
				.rasterize({ svg: "<svg/>", width: 10, height: 10, scale: 1 }, controller.signal)
				.catch((error: unknown) => error);
			let pid: number | undefined;
			try {
				const startedDeadline = Date.now() + CLI_INTERRUPT_CLEANUP_MS;
				while (!existsSync(evidence)) {
					if (Date.now() > startedDeadline) throw new Error("The startup fixture did not start.");
					await Bun.sleep(PROCESS_GROUP_OBSERVATION_POLL_MS);
				}
				const [pidText, profileRoot] = readFileSync(evidence, "utf8").trim().split("\n");
				pid = Number(pidText);
				const began = performance.now();
				if (action === "cancel") controller.abort(new Error("cancelled startup"));
				else await rasterizer.stop();
				expect(await capture).toBeInstanceOf(Error);
				expect((await rasterizer.stop()).clean).toBe(true);
				expect(performance.now() - began).toBeLessThan(CLI_INTERRUPT_CLEANUP_MS);
				expect(
					listProcessGroupObservations(pid).filter((member) => member.state !== "zombie"),
				).toEqual([]);
				expect(existsSync(profileRoot!)).toBe(false);
			} finally {
				await rasterizer.stop();
				if (pid !== undefined) {
					try {
						process.kill(-pid, "SIGKILL");
					} catch {
						/* The expected case is an absent group. */
					}
				}
				rmSync(root, { recursive: true, force: true });
			}
		},
	);
});
