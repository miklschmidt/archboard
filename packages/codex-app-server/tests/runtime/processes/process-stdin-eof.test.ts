import { describe, expect, test } from "bun:test";

import { CodexProcessError } from "#runtime/processes/process.ts";
import { createCodexProcessForTesting as createCodexProcess } from "#runtime/processes/process.ts";
import { CODEX_PROCESS_MS } from "@archboard/timing";
import {
	driveManual,
	expectKillAfterGrace,
	fakeLifecycle,
} from "#tests/runtime/support/process-lifecycle-support.ts";
import {
	fixture,
	processOptions,
	removeRoot,
	startReady,
	temporaryRoot,
} from "#tests/runtime/support/process-support.ts";

describe("Codex stdin EOF shutdown", () => {
	test("stdin EOF can close the child before the owner sends TERM", async () => {
		const root = temporaryRoot();
		const lifecycle = fakeLifecycle(true, false);
		const owner = createCodexProcess({
			...processOptions(root, fixture(root, `process.stdin.resume();`)),
			dependencies: lifecycle.dependencies,
		});
		try {
			await startReady(owner);
			const stopped = owner.stop();
			expect(lifecycle.child()!.stdin.writableEnded).toBe(true);
			lifecycle.quiesce();
			expect((await driveManual(stopped, lifecycle.clock)).state).toBe("stopped");
			expect(lifecycle.signals).toEqual([]);
		} finally {
			lifecycle.quiesce();
			await driveManual(owner.stop(), lifecycle.clock).catch(() => undefined);
			removeRoot(root);
		}
	});

	test("allows delayed natural EOF closure without consuming the whole grace", async () => {
		const root = temporaryRoot();
		const lifecycle = fakeLifecycle(true, false);
		const owner = createCodexProcess({
			...processOptions(root, fixture(root, `process.stdin.resume();`)),
			dependencies: lifecycle.dependencies,
		});
		try {
			await startReady(owner);
			const stopped = owner.stop();
			lifecycle.clock.schedule(() => {
				lifecycle.markGroupQuiescent();
				lifecycle.child()!.emit("close", 0, null);
			}, CODEX_PROCESS_MS.stdinEofGrace / 2);
			expect((await driveManual(stopped, lifecycle.clock)).state).toBe("stopped");
			expect(lifecycle.signals).toEqual([]);
			expect(lifecycle.clock.now()).toBe(CODEX_PROCESS_MS.stdinEofGrace / 2);
			expect(owner.snapshot().lastExit).toMatchObject({
				code: 0,
				signal: null,
				classification: "requested",
			});
		} finally {
			lifecycle.quiesce();
			await driveManual(owner.stop(), lifecycle.clock).catch(() => undefined);
			removeRoot(root);
		}
	});

	test("retains bounded EOF and TERM grace for a resistant child", async () => {
		const root = temporaryRoot();
		const lifecycle = fakeLifecycle();
		const owner = createCodexProcess({
			...processOptions(root, fixture(root, `process.stdin.resume();`)),
			dependencies: lifecycle.dependencies,
		});
		try {
			await startReady(owner);
			const stopped = owner.stop();
			expect(lifecycle.signals).toEqual([]);
			expect((await driveManual(stopped, lifecycle.clock)).state).toBe("stopped");
			expect(lifecycle.signals).toEqual(["SIGTERM", "SIGSTOP", "SIGKILL"]);
			expectKillAfterGrace(
				lifecycle.clock.now(),
				CODEX_PROCESS_MS.stdinEofGrace + CODEX_PROCESS_MS.termGrace,
			);
		} finally {
			lifecycle.quiesce();
			await driveManual(owner.stop(), lifecycle.clock).catch(() => undefined);
			removeRoot(root);
		}
	});

	test("skips EOF grace after stdin closure throws and permits a stop retry", async () => {
		const root = temporaryRoot();
		const lifecycle = fakeLifecycle();
		const owner = createCodexProcess({
			...processOptions(root, fixture(root, `process.stdin.resume();`)),
			dependencies: lifecycle.dependencies,
		});
		try {
			await startReady(owner);
			Object.assign(lifecycle.child()!.stdin, {
				end: () => {
					throw new Error("injected stdin closure failure");
				},
			});
			const stopped = owner.stop();
			expect(lifecycle.signals).toEqual(["SIGTERM"]);
			await expect(driveManual(stopped, lifecycle.clock)).rejects.toBeInstanceOf(CodexProcessError);
			expect(lifecycle.signals).toEqual(["SIGTERM", "SIGSTOP", "SIGKILL"]);
			expectKillAfterGrace(lifecycle.clock.now(), CODEX_PROCESS_MS.termGrace);
			expect(owner.snapshot().state).toBe("terminal_failure");
			expect((await driveManual(owner.stop(), lifecycle.clock)).state).toBe("stopped");
		} finally {
			lifecycle.quiesce();
			await driveManual(owner.stop(), lifecycle.clock).catch(() => undefined);
			removeRoot(root);
		}
	});

	test("EOF grace stays inside the original composed deadline", async () => {
		const root = temporaryRoot();
		const lifecycle = fakeLifecycle(true, false);
		const owner = createCodexProcess({
			...processOptions(root, fixture(root, `process.stdin.resume();`)),
			dependencies: lifecycle.dependencies,
		});
		try {
			await startReady(owner);
			await expect(driveManual(owner.stop(), lifecycle.clock)).rejects.toBeInstanceOf(
				CodexProcessError,
			);
			expect(lifecycle.signals).toEqual(["SIGTERM", "SIGSTOP", "SIGKILL"]);
			expect(lifecycle.clock.now()).toBe(CODEX_PROCESS_MS.composedShutdown);
			expect(owner.snapshot().state).toBe("terminal_failure");
			expect(owner.currentChild()).not.toBeNull();
			lifecycle.quiesce();
			expect((await driveManual(owner.stop(), lifecycle.clock)).state).toBe("stopped");
		} finally {
			lifecycle.quiesce();
			await driveManual(owner.stop(), lifecycle.clock).catch(() => undefined);
			removeRoot(root);
		}
	});
});
