import { expect, test } from "bun:test";
import {
	chmodSync,
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { GIT_PROCESS_GROUP_CLEANUP_MS } from "../../../shared/timing/timing.ts";
import { git } from "../git.js";

const FAKE_GIT = `#!/bin/sh
mode="$1"
marker="$2"
echo "$$" > "$marker.leader"
case "$mode" in
  wait) sleep 60 ;;
  stdout) head -c 70000 /dev/zero | tr '\\0' x; sleep 60 ;;
  stderr) head -c 70000 /dev/zero | tr '\\0' y >&2; sleep 60 ;;
  both)
    (head -c 70000 /dev/zero | tr '\\0' x) &
    (head -c 70000 /dev/zero | tr '\\0' y >&2) &
    wait
    sleep 60
    ;;
  descendant)
    sleep 60 &
    echo "$!" > "$marker.descendant"
    exit 0
    ;;
  signal) kill -TERM "$$" ;;
  exit) echo "expected failure" >&2; exit 17 ;;
esac
`;

async function waitForFile(file: string): Promise<void> {
	const deadline = Date.now() + 1_000;
	while (!existsSync(file)) {
		if (Date.now() >= deadline) throw new Error(`Timed out waiting for ${file}.`);
		await Bun.sleep(5);
	}
}

function recordedPid(file: string): number {
	return Number(readFileSync(file, "utf8").trim());
}

async function expectPidAbsent(pid: number): Promise<void> {
	const deadline = Date.now() + 1_000;
	while (existsSync(`/proc/${pid}`) && Date.now() < deadline) await Bun.sleep(5);
	expect(existsSync(`/proc/${pid}`), `pid ${pid} must be reaped`).toBeFalse();
}

async function withFaultingFirstReader<T>(delayMs: number, work: () => Promise<T>): Promise<T> {
	const prototype = ReadableStream.prototype;
	const original = prototype.getReader as () => ReadableStreamDefaultReader<unknown>;
	let injected = false;
	prototype.getReader = function (this: ReadableStream<unknown>) {
		const reader = original.call(this);
		if (injected) return reader;
		injected = true;
		let first = true;
		return {
			get closed() {
				return reader.closed;
			},
			async read() {
				if (first) {
					first = false;
					await Bun.sleep(delayMs);
					throw new Error("injected Git output read failure");
				}
				return reader.read();
			},
			cancel: (reason?: unknown) => reader.cancel(reason),
			releaseLock: () => reader.releaseLock(),
		} as ReadableStreamDefaultReader<unknown>;
	} as typeof prototype.getReader;
	try {
		return await work();
	} finally {
		prototype.getReader = original;
	}
}

function withStalledFirstReader<T>(work: () => Promise<T>): {
	readonly result: Promise<T>;
	readonly release: () => void;
} {
	const prototype = ReadableStream.prototype;
	const original = prototype.getReader as () => ReadableStreamDefaultReader<unknown>;
	let injected = false;
	let release!: () => void;
	const gate = new Promise<void>((resolve) => {
		release = resolve;
	});
	prototype.getReader = function (this: ReadableStream<unknown>) {
		const reader = original.call(this);
		if (injected) return reader;
		injected = true;
		return {
			get closed() {
				return reader.closed;
			},
			async read() {
				await gate;
				return { done: true, value: undefined };
			},
			async cancel() {
				await gate;
			},
			releaseLock: () => reader.releaseLock(),
		} as ReadableStreamDefaultReader<unknown>;
	} as typeof prototype.getReader;
	try {
		return { result: work(), release };
	} finally {
		prototype.getReader = original;
	}
}

test("real Git commands settle for success and nonzero exit", async () => {
	const root = mkdtempSync(join(tmpdir(), "archboard-git-real-"));
	try {
		expect(await git(root, ["init", "-q"])).toBeUndefined();
		expect(await git(root, ["rev-parse", "--show-toplevel"])).toBe(root);
		await expect(git(root, ["cat-file", "-e", "missing^{commit}"])).rejects.toMatchObject({
			failure: "exit",
		});
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

test("Git lifecycle owns overflow, cancellation, signals, descendants, and spawn failure", async () => {
	const root = mkdtempSync(join(tmpdir(), "archboard-git-lifecycle-"));
	const bin = join(root, "bin");
	try {
		mkdirSync(bin);
		const executable = join(bin, "git");
		writeFileSync(executable, FAKE_GIT);
		chmodSync(executable, 0o700);

		for (const mode of ["stdout", "stderr", "both"] as const) {
			const marker = join(root, mode);
			const started = performance.now();
			await expect(git(root, [mode, marker], { executable })).rejects.toMatchObject({
				failure: "output",
			});
			expect(performance.now() - started).toBeLessThan(1_000);
			await expectPidAbsent(recordedPid(`${marker}.leader`));
		}

		const abortMarker = join(root, "abort");
		const controller = new AbortController();
		const aborted = git(root, ["wait", abortMarker], {
			signal: controller.signal,
			executable,
		});
		await waitForFile(`${abortMarker}.leader`);
		controller.abort();
		await expect(aborted).rejects.toMatchObject({ failure: "aborted" });
		await expectPidAbsent(recordedPid(`${abortMarker}.leader`));
		await expect(
			git(root, ["wait", join(root, "pre-abort")], {
				signal: AbortSignal.abort(),
				executable,
			}),
		).rejects.toMatchObject({ failure: "aborted" });

		const descendantMarker = join(root, "descendant");
		const descendantStarted = performance.now();
		await expect(git(root, ["descendant", descendantMarker], { executable })).rejects.toMatchObject(
			{ failure: "cleanup" },
		);
		expect(performance.now() - descendantStarted).toBeLessThan(1_000);
		await waitForFile(`${descendantMarker}.descendant`);
		await expectPidAbsent(recordedPid(`${descendantMarker}.leader`));
		await expectPidAbsent(recordedPid(`${descendantMarker}.descendant`));

		for (const [name, delayMs, timeoutMs, abortFirst, failure] of [
			["read-failure", 25, 5_000, false, "cleanup"],
			["abort-before-read-failure", 50, 5_000, true, "aborted"],
			["timeout-before-read-failure", 50, 10, false, "timeout"],
		] as const) {
			const marker = join(root, name);
			const faultController = new AbortController();
			const started = performance.now();
			const failed = withFaultingFirstReader(delayMs, () =>
				git(root, ["wait", marker], {
					executable,
					timeoutMs,
					signal: faultController.signal,
				}),
			);
			await waitForFile(`${marker}.leader`);
			if (abortFirst) faultController.abort();
			await expect(failed).rejects.toMatchObject({ failure });
			expect(performance.now() - started).toBeLessThan(1_000);
			await expectPidAbsent(recordedPid(`${marker}.leader`));
		}

		await expect(git(root, ["signal", join(root, "signal")], { executable })).rejects.toMatchObject(
			{ failure: "signal" },
		);
		await expect(git(join(root, "absent"), ["anything"], { executable })).rejects.toMatchObject({
			failure: "spawn",
		});
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

test("Git cleanup remains bounded when reader cancellation never settles", async () => {
	const root = mkdtempSync(join(tmpdir(), "archboard-git-stalled-cancel-"));
	const executable = join(root, "git");
	const marker = join(root, "stalled");
	writeFileSync(executable, FAKE_GIT);
	chmodSync(executable, 0o700);
	const stalled = withStalledFirstReader(() =>
		git(root, ["wait", marker], { executable, timeoutMs: 10 }),
	);
	try {
		await waitForFile(`${marker}.leader`);
		const outcome = await Promise.race([
			stalled.result.then(
				() => ({ kind: "resolved" as const }),
				(error: unknown) => ({ kind: "rejected" as const, error }),
			),
			Bun.sleep(3 * GIT_PROCESS_GROUP_CLEANUP_MS).then(() => ({ kind: "deadline" as const })),
		]);
		expect(outcome.kind).toBe("rejected");
		if (outcome.kind === "rejected") expect(outcome.error).toMatchObject({ failure: "timeout" });
		await expectPidAbsent(recordedPid(`${marker}.leader`));
	} finally {
		stalled.release();
		await stalled.result.catch(() => undefined);
		rmSync(root, { recursive: true, force: true });
	}
}, 10_000);
