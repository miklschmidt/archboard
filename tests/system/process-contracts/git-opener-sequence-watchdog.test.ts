import { expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { readProcessObservation } from "@archboard/process/observation";

import {
	TEST_GIT_OPENER_CASE_TIMEOUT_MS,
	TEST_GIT_OPENER_CLEANUP_MS,
	TEST_GIT_OPENER_WATCHDOG_MS,
	TEST_PROCESS_GROUP_POLL_MS,
} from "../support/timing.ts";

const ROOT = resolve(import.meta.dir, "../../..");
const OWNERS = [
	"packages/process/tests/runtime/processes/git-async.test.ts",
	"tests/system/code-targets/settings-contract.test.ts",
	"tests/system/code-targets/activation-contract.test.ts",
	"tests/system/code-targets/opener-persistence.test.ts",
] as const;

function groupExists(pgid: number): boolean {
	try {
		process.kill(-pgid, 0);
		return true;
	} catch (cause) {
		if ((cause as NodeJS.ErrnoException).code === "ESRCH") {
			return false;
		}
		throw cause;
	}
}

async function waitForGroupAbsence(pgid: number, timeoutMs: number): Promise<void> {
	const deadline = Date.now() + timeoutMs;
	while (groupExists(pgid)) {
		if (Date.now() >= deadline) {
			throw new Error(`process group ${pgid} survived`);
		}
		await Bun.sleep(TEST_PROCESS_GROUP_POLL_MS);
	}
}

async function within<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
	let timer: ReturnType<typeof setTimeout> | undefined;
	try {
		return await Promise.race([
			promise,
			new Promise<never>((_resolve, reject) => {
				timer = setTimeout(() => reject(new Error(message)), timeoutMs);
			}),
		]);
	} finally {
		if (timer !== undefined) {
			clearTimeout(timer);
		}
	}
}

async function cleanupOwnedChild(
	child: ReturnType<typeof Bun.spawn>,
	streams: readonly Promise<unknown>[],
): Promise<void> {
	const failures: unknown[] = [];
	try {
		process.kill(-child.pid, "SIGKILL");
	} catch (cause) {
		if ((cause as NodeJS.ErrnoException).code !== "ESRCH") {
			failures.push(cause);
		}
	}
	try {
		child.kill("SIGKILL");
	} catch {
		// The exact leader may already have been reaped by the group signal.
	}
	try {
		await within(
			Promise.allSettled([child.exited, ...streams]).then(() => undefined),
			TEST_GIT_OPENER_CLEANUP_MS,
			`process group ${child.pid} pipes or leader did not settle`,
		);
	} catch (cause) {
		failures.push(cause);
	}
	try {
		await waitForGroupAbsence(child.pid, TEST_GIT_OPENER_CLEANUP_MS);
	} catch (cause) {
		failures.push(cause);
	}
	if (failures.length > 0) {
		throw new AggregateError(failures, `process group ${child.pid} cleanup failed`);
	}
}

async function runOwnedDetached(
	command: readonly string[],
	options: {
		env?: Record<string, string | undefined>;
		afterSpawn?: (child: ReturnType<typeof Bun.spawn>) => Promise<void> | void;
	} = {},
): Promise<{ exitCode: number; out: string; err: string }> {
	const child = Bun.spawn([...command], {
		cwd: ROOT,
		detached: true,
		stdin: "ignore",
		stdout: "pipe",
		stderr: "pipe",
		...(options.env ? { env: options.env } : {}),
	});
	let primaryFailure: unknown;
	let failed = false;
	let result: { exitCode: number; out: string; err: string } | undefined;
	let cleanupFailure: unknown;
	const streams: Promise<unknown>[] = [];
	try {
		const stdout = new Response(child.stdout).text();
		const stderr = new Response(child.stderr).text();
		streams.push(stdout, stderr);
		const lifecycle = Promise.all([child.exited, stdout, stderr]).then(([exitCode, out, err]) => ({
			exitCode,
			out,
			err,
		}));
		await options.afterSpawn?.(child);
		result = await within(
			lifecycle,
			TEST_GIT_OPENER_WATCHDOG_MS,
			`watchdog expired for process group ${child.pid}`,
		);
		if (groupExists(child.pid)) {
			throw new Error(`process group ${child.pid} survived normal completion`);
		}
	} catch (cause) {
		failed = true;
		primaryFailure = cause;
	} finally {
		try {
			await cleanupOwnedChild(child, streams);
		} catch (cause) {
			cleanupFailure = cause;
		}
	}
	if (failed) {
		if (cleanupFailure !== undefined) {
			throw new AggregateError(
				[primaryFailure, cleanupFailure],
				`process group ${child.pid} failed after its primary error`,
				{ cause: primaryFailure },
			);
		}
		throw primaryFailure;
	}
	if (cleanupFailure !== undefined) {
		throw cleanupFailure;
	}
	return result!;
}

/** Tests that ran per owner file, from the junit report: one top-level suite per file. Skipped tests are not counted. */
function testsPerOwner(junit: string): Map<string, number> {
	const ran = new Map<string, number>();
	for (const [, file, attributes] of junit.matchAll(
		/<testsuite name="([^"]+)" file="\1"([^>]*)>/g,
	)) {
		const tests = Number(/ tests="(\d+)"/.exec(attributes!)?.[1]);
		const skipped = Number(/ skipped="(\d+)"/.exec(attributes!)?.[1] ?? 0);
		ran.set(file!, tests - skipped);
	}
	return ran;
}

test(
	"Git lifecycle and the former opener deadlock sequence settle under an external watchdog",
	async () => {
		const root = mkdtempSync(join(tmpdir(), "archboard-watchdog-report-"));
		const report = join(root, "junit.xml");
		try {
			const settled = await runOwnedDetached(
				[
					process.execPath,
					"test",
					"--isolate",
					"--max-concurrency=1",
					"--reporter=junit",
					`--reporter-outfile=${report}`,
					...OWNERS,
				],
				{ env: { ...process.env, ARCHBOARD_REPOS: resolve(ROOT, ".absent-watchdog-repos.json") } },
			);
			expect(settled.exitCode, `stdout:\n${settled.out}\nstderr:\n${settled.err}`).toBe(0);
			// Exit 0 alone would also hold if an owner never ran, or only skipped: each must report a test that ran.
			const ran = testsPerOwner(readFileSync(report, "utf8"));
			for (const owner of OWNERS) {
				expect(ran.get(owner) ?? 0, owner).toBeGreaterThan(0);
			}
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	},
	TEST_GIT_OPENER_CASE_TIMEOUT_MS,
);

test("a rejected watchdog lifecycle preserves its error after reaping the exact group", async () => {
	const failure = new Error("forced watchdog lifecycle rejection");
	let pgid: number | undefined;
	let rejected: unknown;
	try {
		await runOwnedDetached([process.execPath, "-e", "setInterval(() => {}, 1000)"], {
			afterSpawn: (child) => {
				pgid = child.pid;
				throw failure;
			},
		});
	} catch (cause) {
		rejected = cause;
	}
	expect(rejected).toBe(failure);
	expect(pgid).toBeDefined();
	expect(groupExists(pgid!)).toBeFalse();
});

test("a normal-looking leader exit reports and reaps its redirected descendant", async () => {
	const root = mkdtempSync(join(tmpdir(), "archboard-watchdog-descendant-"));
	const marker = join(root, "descendant-pid");
	let rejected: unknown;
	try {
		await runOwnedDetached([
			"/bin/sh",
			"-c",
			'sleep 60 </dev/null >/dev/null 2>&1 & echo "$!" > "$0"; exit 0',
			marker,
		]);
	} catch (cause) {
		rejected = cause;
	}
	const descendant = Number(readFileSync(marker, "utf8").trim());
	expect(rejected).toBeInstanceOf(Error);
	expect(String(rejected)).toContain("survived normal completion");
	expect(readProcessObservation(descendant)).toBeUndefined();
	rmSync(root, { recursive: true, force: true });
});
