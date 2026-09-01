import { expect, test } from "bun:test";

import {
	createCanvasCodexWorkbenchApplication,
	type CanvasCodexWorkbenchApplicationState,
} from "../codex-workbench-application.js";

function rejected(operation: Promise<unknown>): Promise<unknown> {
	return operation.then(
		() => null,
		(error: unknown) => error,
	);
}

async function runFailedRecoveryRace(teardownFailure: Error | null): Promise<void> {
	const state: CanvasCodexWorkbenchApplicationState = {
		installed: false,
		phase: "idle",
		shutdown: null,
	};
	const startupFailure = new Error("recovery startup rejected");
	let releaseRecoveryStart!: () => void;
	const recoveryStartGate = new Promise<void>((resolve) => void (releaseRecoveryStart = resolve));
	let releaseConcurrentTeardown!: () => void;
	const concurrentTeardownGate = new Promise<void>(
		(resolve) => void (releaseConcurrentTeardown = resolve),
	);
	let installs = 0;
	let starts = 0;
	let reloads = 0;
	let teardowns = 0;
	const module = {
		installProductionCodexWorkbench: () => {
			installs++;
			return {
				start: async () => {
					starts++;
					if (starts === 2) {
						await recoveryStartGate;
						throw startupFailure;
					}
					return { ready: true };
				},
			} as never;
		},
		reloadProductionCodexWorkbench: async () => {
			reloads++;
			return { ready: true } as never;
		},
		shutdownProductionCodexWorkbench: async () => {
			teardowns++;
			if (teardowns === 2) {
				await concurrentTeardownGate;
				if (teardownFailure !== null) throw teardownFailure;
			}
			return { ready: false } as never;
		},
	};
	const sourceA = createCanvasCodexWorkbenchApplication({
		state,
		module,
		installation: () => ({}) as never,
	});
	await sourceA.prepare();
	await sourceA.shutdown();

	const sourceB = createCanvasCodexWorkbenchApplication({
		state,
		module,
		installation: () => ({}) as never,
	});
	const failedRecovery = sourceB.prepare();
	expect(state).toMatchObject({ installed: false, phase: "preparing", shutdown: sourceB.shutdown });
	const concurrentTeardown = sourceB.shutdown();
	const sourceC = createCanvasCodexWorkbenchApplication({
		state,
		module,
		installation: () => ({}) as never,
	});
	expect(sourceC.shutdown()).toBe(concurrentTeardown);
	expect(state).toMatchObject({ installed: false, phase: "stopping", shutdown: sourceB.shutdown });

	releaseConcurrentTeardown();
	expect(await rejected(concurrentTeardown)).toBe(teardownFailure);
	expect(state.phase).toBe("stopping");
	releaseRecoveryStart();
	const terminalReason = await rejected(failedRecovery);
	if (teardownFailure === null) {
		expect(terminalReason).toBe(startupFailure);
	} else {
		expect(terminalReason).toBeInstanceOf(AggregateError);
		expect((terminalReason as AggregateError).errors).toEqual([startupFailure, teardownFailure]);
	}
	expect(state).toMatchObject({ installed: false, phase: "stopped", shutdown: sourceB.shutdown });

	const sourceD = createCanvasCodexWorkbenchApplication({
		state,
		module,
		installation: () => ({}) as never,
	});
	for (const replay of [sourceB.shutdown(), sourceC.shutdown(), sourceD.shutdown()]) {
		expect(replay as unknown).toBe(failedRecovery);
		expect(await rejected(replay)).toBe(terminalReason);
	}
	expect([installs, starts, reloads, teardowns]).toEqual([2, 2, 0, 2]);

	await sourceD.prepare();
	expect([installs, starts, reloads, teardowns]).toEqual([3, 3, 0, 2]);
	const laterShutdown = sourceD.shutdown();
	expect(laterShutdown as unknown).not.toBe(failedRecovery);
	await laterShutdown;
	expect([installs, starts, reloads, teardowns]).toEqual([3, 3, 0, 3]);
}

test("failed recovery supersedes its settled concurrent teardown result", async () => {
	await runFailedRecoveryRace(null);
	await runFailedRecoveryRace(new Error("concurrent teardown rejected"));
});
