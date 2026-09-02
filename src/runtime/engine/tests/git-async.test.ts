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
		await expect(
			git(root, ["descendant", descendantMarker], { timeoutMs: 50, executable }),
		).rejects.toMatchObject({ failure: "timeout" });
		await waitForFile(`${descendantMarker}.descendant`);
		await expectPidAbsent(recordedPid(`${descendantMarker}.leader`));
		await expectPidAbsent(recordedPid(`${descendantMarker}.descendant`));

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
