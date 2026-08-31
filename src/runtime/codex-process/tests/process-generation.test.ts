import { describe, expect, test } from "bun:test";

import { createCodexProcessForTesting as createCodexProcess } from "../testing.js";
import { driveManual, fakeLifecycle, type ManualScheduler } from "./lifecycle-support.js";
import { fixture, processOptions, removeRoot, temporaryRoot, waitForState } from "./support.js";

async function flushMicrotasks(): Promise<void> {
	for (let turn = 0; turn < 6; turn += 1) await Promise.resolve();
}

async function startReplacement(root: string) {
	const lifecycle = fakeLifecycle();
	const executable = fixture(root, "process.stdin.resume();");
	const owner = createCodexProcess({
		...processOptions(root, executable),
		dependencies: lifecycle.dependencies,
	});
	const children: ReturnType<typeof owner.currentChild>[] = [];
	owner.onChild((child) => children.push(child));
	const started = owner.start();
	await flushMicrotasks();
	const first = children[0];
	if (!first) throw new Error("Expected the first fake Codex child.");
	first.lifecycle.markAppServerReady();
	await started;
	const backoff = waitForState(owner, (state) => state === "backoff");
	lifecycle.quiesce();
	await backoff;
	expect(lifecycle.clock.runNext()).toBe(true);
	await flushMicrotasks();
	const second = children[1];
	if (!second) throw new Error("Expected the replacement fake Codex child.");
	return { owner, lifecycle, first, second };
}

async function stopFake(
	owner: ReturnType<typeof createCodexProcess>,
	clock: ManualScheduler,
): Promise<void> {
	await driveManual(owner.stop(), clock);
}

describe("Codex process child-generation capabilities", () => {
	test("ignores readiness from child A after child B owns the process", async () => {
		const root = temporaryRoot();
		let owner: ReturnType<typeof createCodexProcess> | undefined;
		try {
			const replacement = await startReplacement(root);
			owner = replacement.owner;
			replacement.first.lifecycle.markAppServerReady();
			expect(owner.snapshot().ready).toBe(false);
			replacement.second.lifecycle.markAppServerReady();
			expect(owner.snapshot().ready).toBe(true);
			await stopFake(owner, replacement.lifecycle.clock);
		} finally {
			if (owner) await owner.stop().catch(() => undefined);
			removeRoot(root);
		}
	});

	test("ignores account readiness from child A after child B owns the process", async () => {
		const root = temporaryRoot();
		let owner: ReturnType<typeof createCodexProcess> | undefined;
		try {
			const replacement = await startReplacement(root);
			owner = replacement.owner;
			replacement.second.lifecycle.markAppServerReady();
			expect(owner.snapshot().restartAttempt).toBe(1);
			replacement.first.lifecycle.markAccountReady();
			expect(owner.snapshot().accountReady).toBe(false);
			expect(owner.snapshot().restartAttempt).toBe(1);
			replacement.second.lifecycle.markAccountReady();
			expect(owner.snapshot().accountReady).toBe(true);
			expect(owner.snapshot().restartAttempt).toBe(0);
			await stopFake(owner, replacement.lifecycle.clock);
		} finally {
			if (owner) await owner.stop().catch(() => undefined);
			removeRoot(root);
		}
	});

	test("ignores terminal failure from child A after child B owns the process", async () => {
		const root = temporaryRoot();
		let owner: ReturnType<typeof createCodexProcess> | undefined;
		try {
			const replacement = await startReplacement(root);
			owner = replacement.owner;
			replacement.second.lifecycle.markAppServerReady();
			const before = owner.snapshot();
			replacement.first.lifecycle.markTerminalFailure("late child A failure");
			expect(owner.snapshot().state).toBe("running");
			expect(owner.snapshot().pid).toBe(before.pid);
			expect(owner.snapshot().failure).toEqual(before.failure);

			const terminal = waitForState(owner, (state) => state === "terminal_failure");
			replacement.second.lifecycle.markTerminalFailure("current child failure");
			expect((await terminal).failure?.code).toBe("strict_config_rejected");
			await stopFake(owner, replacement.lifecycle.clock);
		} finally {
			if (owner) await owner.stop().catch(() => undefined);
			removeRoot(root);
		}
	});
});
