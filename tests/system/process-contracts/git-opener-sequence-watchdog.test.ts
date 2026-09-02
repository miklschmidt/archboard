import { expect, test } from "bun:test";
import { resolve } from "node:path";

import {
	GIT_PROCESS_GROUP_CLEANUP_MS,
	GIT_PROCESS_GROUP_POLL_MS,
	TEST_GIT_OPENER_CASE_TIMEOUT_MS,
	TEST_GIT_OPENER_WATCHDOG_MS,
} from "../../../src/shared/timing/timing.js";

const ROOT = resolve(import.meta.dir, "../../..");
const OWNERS = [
	"src/runtime/engine/tests/git-async.test.ts",
	"tests/system/code-targets/settings-contract.test.ts",
	"tests/system/code-targets/activation-contract.test.ts",
	"tests/system/code-targets/opener-persistence.test.ts",
] as const;

function groupExists(pgid: number): boolean {
	try {
		process.kill(-pgid, 0);
		return true;
	} catch (cause) {
		if ((cause as NodeJS.ErrnoException).code === "ESRCH") return false;
		throw cause;
	}
}

async function waitForGroupAbsence(pgid: number, timeoutMs: number): Promise<void> {
	const deadline = Date.now() + timeoutMs;
	while (groupExists(pgid)) {
		if (Date.now() >= deadline) throw new Error(`process group ${pgid} survived`);
		await Bun.sleep(GIT_PROCESS_GROUP_POLL_MS);
	}
}

test(
	"Git lifecycle and the former opener deadlock sequence settle under an external watchdog",
	async () => {
		const child = Bun.spawn(
			[process.execPath, "test", "--isolate", "--max-concurrency=1", ...OWNERS],
			{
				cwd: ROOT,
				detached: true,
				stdin: "ignore",
				stdout: "pipe",
				stderr: "pipe",
				env: { ...process.env, ARCHBOARD_REPOS: resolve(ROOT, ".absent-watchdog-repos.json") },
			},
		);
		const stdout = new Response(child.stdout).text();
		const stderr = new Response(child.stderr).text();
		const lifecycle = Promise.all([child.exited, stdout, stderr]).then(
			async ([exitCode, out, err]) => {
				await waitForGroupAbsence(child.pid, GIT_PROCESS_GROUP_CLEANUP_MS);
				return { exitCode, out, err };
			},
		);
		let timer: ReturnType<typeof setTimeout> | undefined;
		const result = await Promise.race([
			lifecycle.then((value) => ({ ...value, timedOut: false as const })),
			new Promise<{ timedOut: true }>((resolveTimeout) => {
				timer = setTimeout(() => resolveTimeout({ timedOut: true }), TEST_GIT_OPENER_WATCHDOG_MS);
			}),
		]);
		if (timer !== undefined) clearTimeout(timer);
		if (result.timedOut) {
			try {
				process.kill(-child.pid, "SIGKILL");
			} catch (cause) {
				if ((cause as NodeJS.ErrnoException).code !== "ESRCH") throw cause;
			}
			try {
				child.kill("SIGKILL");
			} catch {
				// The group signal remains authoritative when the leader already exited.
			}
			let cleanupTimer: ReturnType<typeof setTimeout> | undefined;
			const cleaned = await Promise.race([
				lifecycle.then(() => true),
				new Promise<false>((resolveCleanup) => {
					cleanupTimer = setTimeout(() => resolveCleanup(false), GIT_PROCESS_GROUP_CLEANUP_MS);
				}),
			]);
			if (cleanupTimer !== undefined) clearTimeout(cleanupTimer);
			expect(cleaned, `watchdog cleanup did not settle for process group ${child.pid}`).toBeTrue();
		}
		const settled = result.timedOut ? await lifecycle : result;
		const { out, err } = settled;
		const output = `${out}\n${err}`;
		expect(result.timedOut, `watchdog expired\nstdout:\n${out}\nstderr:\n${err}`).toBeFalse();
		expect(settled.exitCode, `stdout:\n${out}\nstderr:\n${err}`).toBe(0);
		for (const owner of OWNERS) expect(output).toContain(owner);
		await waitForGroupAbsence(child.pid, GIT_PROCESS_GROUP_CLEANUP_MS);
	},
	TEST_GIT_OPENER_CASE_TIMEOUT_MS,
);
