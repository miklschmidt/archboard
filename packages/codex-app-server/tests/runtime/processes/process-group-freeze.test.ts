import { afterEach, describe, expect, test, jest } from "bun:test";

import { createProcessOwner as createCodexProcess } from "#runtime/processes/process-owner.ts";
import {
	fixture,
	processOptions as options,
	removeRoot,
	startReady,
	temporaryRoot,
	waitForState,
} from "#tests/runtime/support/process-support.ts";
import {
	driveManual,
	fakeLifecycle,
	REVIEWED_SHUTDOWN_MS,
} from "#tests/runtime/support/process-lifecycle-support.ts";

afterEach(() => jest.useRealTimers());

describe("Codex process group KILL", () => {
	test("a child that forks into the group after it was stopped is stopped before KILL", async () => {
		// A fork that completes after a census joins the group outside the signals already sent
		// (TASK-470). KILL must therefore wait for two agreeing censuses of stopped members.
		const root = temporaryRoot();
		let owner: ReturnType<typeof createCodexProcess> | undefined;
		try {
			const lifecycle = fakeLifecycle();
			lifecycle.forkAtCensus(3);
			const executable = fixture(root, `process.on("SIGTERM", () => {}); process.stdin.resume();`);
			owner = createCodexProcess({
				...options(root, executable),
				dependencies: lifecycle.dependencies,
			});
			await startReady(owner);
			const stopped = await driveManual(owner.stop(), lifecycle.clock);
			expect(stopped.state).toBe("stopped");
			expect(lifecycle.signals[0]).toBe("SIGTERM");
			expect(lifecycle.signals.at(-1)).toBe("SIGKILL");
			const killed = lifecycle.membersAtKill();
			expect(killed).toHaveLength(2);
			expect(killed.every((member) => member.endsWith(":stopped"))).toBe(true);
		} finally {
			if (owner) {
				await owner.stop().catch(() => undefined);
			}
			removeRoot(root);
		}
	});

	test("a member that never stops is killed at the freeze bound, inside the composed deadline", async () => {
		// A member in a killable kernel wait never reads as stopped, yet KILL ends it. The freeze
		// must give up in time for KILL to clear the group before the composed deadline.
		const root = temporaryRoot();
		let owner: ReturnType<typeof createCodexProcess> | undefined;
		try {
			const lifecycle = fakeLifecycle();
			lifecycle.holdUnstoppableMember();
			const executable = fixture(root, `process.on("SIGTERM", () => {}); process.stdin.resume();`);
			owner = createCodexProcess({
				...options(root, executable),
				dependencies: lifecycle.dependencies,
			});
			await startReady(owner);
			const stopped = await driveManual(owner.stop(), lifecycle.clock);
			expect(stopped.state).toBe("stopped");
			expect(lifecycle.signals.at(-1)).toBe("SIGKILL");
			expect(lifecycle.clock.now()).toBeLessThanOrEqual(
				REVIEWED_SHUTDOWN_MS.stdinEofGrace +
					REVIEWED_SHUTDOWN_MS.termGrace +
					REVIEWED_SHUTDOWN_MS.groupFreeze,
			);
		} finally {
			if (owner) {
				await owner.stop().catch(() => undefined);
			}
			removeRoot(root);
		}
	});

	test("recovers when KILL proves the group gone at the cleanup bound", async () => {
		const root = temporaryRoot();
		const lifecycle = fakeLifecycle();
		const group = lifecycle.dependencies.processGroup;
		const owner = createCodexProcess({
			...options(root, fixture(root, `process.stdin.resume();`)),
			dependencies: {
				...lifecycle.dependencies,
				processGroup: {
					...group,
					signal: (identity, signal) => {
						if (signal === "SIGKILL") {
							// Let the bound expire while the kill and its proof are still in flight.
							jest.advanceTimersByTime(
								REVIEWED_SHUTDOWN_MS.composedShutdown - lifecycle.clock.now(),
							);
						}
						group.signal(identity, signal);
					},
				},
			},
		});
		try {
			await startReady(owner);
			const recovered = waitForState(
				owner,
				(state) => state === "backoff" || state === "terminal_failure",
			);
			lifecycle.closeChild();
			expect(owner.snapshot().state).toBe("group_cleanup");
			await driveManual(recovered, lifecycle.clock);
			expect(lifecycle.signals).toEqual(["SIGTERM", "SIGSTOP", "SIGKILL"]);
			expect(owner.snapshot().state).toBe("backoff");
		} finally {
			await driveManual(owner.stop(), lifecycle.clock).catch(() => undefined);
			removeRoot(root);
		}
	});
});
