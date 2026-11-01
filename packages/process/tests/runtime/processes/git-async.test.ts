import { expect, test } from "bun:test";
import {
	chmodSync,
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	realpathSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { GIT_MS } from "@archboard/timing";
import { listProcessObservations, readProcessObservation } from "#runtime/processes/observation.ts";
import {
	captureDetachedProcessGroup,
	processGroupExists,
	signalOwnedProcessGroup,
} from "#runtime/processes/group.ts";
import { git } from "#runtime/processes/git-command.ts";

/** Ceiling for the fake Git child to publish its startup marker; it normally does so at once. */
const TEST_GIT_FIXTURE_START_MS = 5000;
/**
 * Bun case bound for the composed lifecycle owner: the fixture's start, then
 * the cases, three times over for a slow hosted runner. A test number, not the
 * product's Git command timeout.
 */
const TEST_GIT_LIFECYCLE_CASE_TIMEOUT_MS = 30_000;

const GIT_COMMAND = fileURLToPath(import.meta.resolve("#runtime/processes/git-command.ts"));

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
	const deadline = Date.now() + TEST_GIT_FIXTURE_START_MS;
	while (!existsSync(file)) {
		if (Date.now() >= deadline) {
			throw new Error(`Timed out waiting for ${file}.`);
		}
		await Bun.sleep(5);
	}
}

async function expectGroupAbsent(group: number): Promise<void> {
	// Kernel delivery to every member needs real process observations, not a fake clock.
	const deadline = Date.now() + 3_000;
	while (processGroupExists(group) && Date.now() < deadline) {
		await Bun.sleep(5);
	}
	expect(processGroupExists(group), `group ${group} must be quiescent`).toBe(false);
}

function recordedPid(file: string): number {
	return Number(readFileSync(file, "utf8").trim());
}

async function expectPidAbsent(pid: number): Promise<void> {
	const deadline = Date.now() + GIT_MS.groupCleanup;
	while (readProcessObservation(pid) !== undefined && Date.now() < deadline) {
		await Bun.sleep(5);
	}
	expect(readProcessObservation(pid), `pid ${pid} must be reaped`).toBeUndefined();
}

async function withFaultingFirstReader<T>(
	ready: Promise<void>,
	delayMs: number,
	work: () => Promise<T>,
): Promise<T> {
	const prototype = ReadableStream.prototype;
	const original = prototype.getReader as () => ReadableStreamDefaultReader<unknown>;
	let injected = false;
	prototype.getReader = function (this: ReadableStream<unknown>) {
		const reader = original.call(this);
		if (injected) {
			return reader;
		}
		injected = true;
		let first = true;
		return {
			get closed() {
				return reader.closed;
			},
			async read() {
				if (first) {
					first = false;
					await ready;
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
		if (injected) {
			return reader;
		}
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

test("the death of the parent ends every Git in flight and its guard", async () => {
	const root = mkdtempSync(join(tmpdir(), "archboard-git-orphan-"));
	const executable = join(root, "git");
	writeFileSync(executable, FAKE_GIT);
	chmodSync(executable, 0o700);
	const markers = [join(root, "one"), join(root, "two")];
	// A finished command comes first, so that the guard also drops a group.
	const script = `
		const { git } = await import(${JSON.stringify(GIT_COMMAND)});
		const executable = ${JSON.stringify(executable)};
		await git("/", ["exit", ${JSON.stringify(join(root, "done"))}], { executable }).catch(() => {});
		for (const marker of ${JSON.stringify(markers)}) {
			void git("/", ["wait", marker], { executable, timeoutMs: null });
		}
		setInterval(() => {}, 1000);
	`;
	const parent = Bun.spawn([process.execPath, "-e", script], {
		stdout: "ignore",
		stderr: "ignore",
	});
	try {
		await Promise.all(markers.map((marker) => waitForFile(`${marker}.leader`)));
		const leaders = markers.map((marker) => recordedPid(`${marker}.leader`));
		const guard = listProcessObservations().find(
			({ pid, parentPid }) => parentPid === parent.pid && !leaders.includes(pid),
		);
		if (guard === undefined) throw new Error("The parent runs no guard.");
		parent.kill("SIGKILL");
		await parent.exited;
		await Promise.all(leaders.map((leader) => expectGroupAbsent(leader)));
		await expectPidAbsent(guard.pid);
	} finally {
		parent.kill("SIGKILL");
		rmSync(root, { recursive: true, force: true });
	}
});

test("a group whose leader pid names another process is never signalled", async () => {
	const child = Bun.spawn(["/bin/sh", "-c", "exec sleep 60"], { detached: true });
	try {
		const group = captureDetachedProcessGroup(child.pid);
		const recycled = { ...group, leader: { ...group.leader, startTime: "another-process" } };
		expect(() => signalOwnedProcessGroup(recycled, "SIGKILL")).toThrow();
		expect(child.exitCode).toBeNull();
		expect(readProcessObservation(child.pid)?.state).toBe("live");
	} finally {
		child.kill("SIGKILL");
		await child.exited;
	}
});

test("real detached Git commands settle for success and nonzero exit", async () => {
	const root = mkdtempSync(join(tmpdir(), "archboard-git-real-"));
	try {
		expect(await git(root, ["init", "-q"])).toBeUndefined();
		expect(await git(root, ["rev-parse", "--show-toplevel"])).toBe(realpathSync(root));
		await expect(git(root, ["cat-file", "-e", "missing^{commit}"])).rejects.toMatchObject({
			failure: "exit",
		});
		const source = "\uFEFF  exact model input Ω\n";
		const object = await git(root, ["hash-object", "-w", "--stdin"], {
			input: Buffer.from(source),
		});
		if (object === undefined) throw new Error("Git did not retain its input object.");
		expect(await git(root, ["cat-file", "blob", object], { trimOutput: false })).toBe(source);
		const invalid = await git(root, ["hash-object", "-w", "--stdin"], {
			input: Buffer.from([0xff]),
		});
		if (invalid === undefined) throw new Error("Git did not retain its invalid UTF-8 object.");
		await expect(git(root, ["cat-file", "blob", invalid])).rejects.toMatchObject({
			failure: "output",
		});
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

async function exerciseGitLifecycle(): Promise<void> {
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
			expect(performance.now() - started).toBeLessThan(GIT_MS.groupCleanup);
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
		expect(performance.now() - descendantStarted).toBeLessThan(GIT_MS.groupCleanup);
		await waitForFile(`${descendantMarker}.descendant`);
		await expectPidAbsent(recordedPid(`${descendantMarker}.leader`));
		await expectPidAbsent(recordedPid(`${descendantMarker}.descendant`));

		for (const [name, delayMs, timeoutMs, abortFirst, failure] of [
			["read-failure", 25, 5_000, false, "cleanup"],
			["abort-before-read-failure", 50, 5_000, true, "aborted"],
			["timeout-before-read-failure", 250, 100, false, "timeout"],
		] as const) {
			const marker = join(root, name);
			const childStarted = waitForFile(`${marker}.leader`);
			const faultController = new AbortController();
			const started = performance.now();
			const failed = withFaultingFirstReader(childStarted, delayMs, () =>
				git(root, ["wait", marker], {
					executable,
					timeoutMs,
					signal: faultController.signal,
				}),
			).then(
				(value) => ({ kind: "resolved" as const, value }),
				(error: unknown) => ({ kind: "rejected" as const, error }),
			);
			await childStarted;
			if (abortFirst) {
				faultController.abort();
			}
			const outcome = await failed;
			expect(outcome.kind).toBe("rejected");
			if (outcome.kind === "rejected") {
				expect(outcome.error).toMatchObject({ failure });
			}
			expect(performance.now() - started).toBeLessThan(GIT_MS.groupCleanup);
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
}

test(
	"Git lifecycle owns overflow, cancellation, signals, descendants, and spawn failure",
	exerciseGitLifecycle,
	TEST_GIT_LIFECYCLE_CASE_TIMEOUT_MS,
);

test("Git cleanup remains bounded when reader cancellation never settles", async () => {
	const root = mkdtempSync(join(tmpdir(), "archboard-git-stalled-cancel-"));
	const executable = join(root, "git");
	const marker = join(root, "stalled");
	writeFileSync(executable, FAKE_GIT);
	chmodSync(executable, 0o700);
	const stalled = withStalledFirstReader(() =>
		git(root, ["wait", marker], { executable, timeoutMs: 1_000 }),
	);
	const stalledOutcome = stalled.result.then(
		() => ({ kind: "resolved" as const }),
		(error: unknown) => ({ kind: "rejected" as const, error }),
	);
	try {
		const startup = await Promise.race([
			waitForFile(`${marker}.leader`).then(() => ({ kind: "started" as const })),
			stalledOutcome.then((outcome) => ({ kind: "settled" as const, outcome })),
		]);
		if (startup.kind === "settled") {
			throw startup.outcome.kind === "rejected"
				? startup.outcome.error
				: new Error("The stalled-reader Git command settled before its child started.");
		}
		const outcome = await Promise.race([
			stalledOutcome,
			Bun.sleep(3 * GIT_MS.groupCleanup).then(() => ({ kind: "deadline" as const })),
		]);
		expect(outcome.kind).toBe("rejected");
		if (outcome.kind === "rejected") {
			expect(outcome.error).toMatchObject({ failure: "timeout" });
		}
		await expectPidAbsent(recordedPid(`${marker}.leader`));
	} finally {
		stalled.release();
		await stalled.result.catch(() => undefined);
		rmSync(root, { recursive: true, force: true });
	}
}, 30_000);
