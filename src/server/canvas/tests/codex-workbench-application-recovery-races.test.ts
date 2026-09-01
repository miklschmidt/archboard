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
	let rejectRecoveryStart!: (error: Error) => void;
	const recoveryStart = new Promise<never>((_, reject) => void (rejectRecoveryStart = reject));
	let releaseLaterStart!: () => void;
	const laterStart = new Promise<{ readonly ready: true }>(
		(resolve) => void (releaseLaterStart = () => resolve({ ready: true })),
	);
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
				start: () => {
					starts++;
					if (starts === 2) return recoveryStart;
					if (starts === 3) return laterStart;
					return Promise.resolve({ ready: true });
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
	const sourceD = createCanvasCodexWorkbenchApplication({
		state,
		module,
		installation: () => ({}) as never,
	});
	let queuedDPhase!: CanvasCodexWorkbenchApplicationState["phase"];
	let queuedDResult!: Promise<unknown>;
	void recoveryStart.catch(() => {
		queueMicrotask(() => {
			queuedDPhase = state.phase;
			queuedDResult = rejected(sourceD.prepare());
		});
	});

	releaseConcurrentTeardown();
	expect(await rejected(concurrentTeardown)).toBe(teardownFailure);
	expect(state.phase).toBe("stopping");
	rejectRecoveryStart(startupFailure);
	const terminalReason = await rejected(failedRecovery);
	if (teardownFailure === null) {
		expect(terminalReason).toBe(startupFailure);
	} else {
		expect(terminalReason).toBeInstanceOf(AggregateError);
		expect((terminalReason as AggregateError).errors).toEqual([startupFailure, teardownFailure]);
	}
	expect([installs, starts, reloads, teardowns]).toEqual([2, 2, 0, 2]);
	expect(queuedDPhase).toBe("stopping");
	const queuedDRefusal = await queuedDResult;
	expect(queuedDRefusal).toBeInstanceOf(Error);
	expect((queuedDRefusal as Error).message).toContain("shutdown to finish");
	expect(state).toMatchObject({ installed: false, phase: "stopped", shutdown: sourceB.shutdown });

	for (const replay of [sourceB.shutdown(), sourceC.shutdown(), sourceD.shutdown()]) {
		expect(replay as unknown).toBe(failedRecovery);
		expect(await rejected(replay)).toBe(terminalReason);
	}
	expect([installs, starts, reloads, teardowns]).toEqual([2, 2, 0, 2]);

	const laterRecovery = sourceD.prepare();
	expect(state).toMatchObject({ installed: false, phase: "preparing", shutdown: sourceD.shutdown });
	expect([installs, starts, reloads, teardowns]).toEqual([3, 3, 0, 2]);
	releaseLaterStart();
	await laterRecovery;
	expect(state).toMatchObject({ installed: true, phase: "installed", shutdown: sourceD.shutdown });
	const sourceE = createCanvasCodexWorkbenchApplication({
		state,
		module,
		installation: () => ({}) as never,
	});
	const laterShutdown = sourceE.shutdown();
	expect(laterShutdown as unknown).not.toBe(failedRecovery);
	expect(sourceD.shutdown()).toBe(laterShutdown);
	expect(state).toMatchObject({ installed: false, phase: "stopping", shutdown: sourceD.shutdown });
	await laterShutdown;
	expect(state).toMatchObject({ installed: false, phase: "stopped", shutdown: sourceD.shutdown });
	expect([installs, starts, reloads, teardowns]).toEqual([3, 3, 0, 3]);
}

test("failed recovery finalization cannot overwrite a queued later source", async () => {
	await runFailedRecoveryRace(null);
	await runFailedRecoveryRace(new Error("concurrent teardown rejected"));
});

test("synchronous recovery setup failure becomes the exact stopped result", async () => {
	const state: CanvasCodexWorkbenchApplicationState = {
		installed: false,
		phase: "idle",
		shutdown: null,
	};
	const setupFailure = new Error("recovery setup failed");
	let failSetup = false;
	let setups = 0;
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
			return { ready: false } as never;
		},
	};
	const installation = () => {
		setups++;
		if (failSetup) throw setupFailure;
		return {} as never;
	};
	const sourceA = createCanvasCodexWorkbenchApplication({ state, module, installation });
	await sourceA.prepare();
	await sourceA.shutdown();

	failSetup = true;
	const sourceB = createCanvasCodexWorkbenchApplication({ state, module, installation });
	const failedRecovery = sourceB.prepare();
	expect(state).toMatchObject({ installed: false, phase: "stopped", shutdown: sourceB.shutdown });
	expect(await rejected(failedRecovery)).toBe(setupFailure);
	expect(sourceB.shutdown() as unknown).toBe(failedRecovery);

	const sourceC = createCanvasCodexWorkbenchApplication({ state, module, installation });
	const replayedFailure = sourceC.shutdown();
	expect(replayedFailure as unknown).toBe(failedRecovery);
	expect(await rejected(replayedFailure)).toBe(setupFailure);
	expect([setups, installs, starts, reloads, teardowns]).toEqual([2, 1, 1, 0, 1]);

	failSetup = false;
	await sourceC.prepare();
	expect(state).toMatchObject({ installed: true, phase: "installed", shutdown: sourceC.shutdown });
	expect([setups, installs, starts, reloads, teardowns]).toEqual([3, 2, 2, 0, 1]);
	const cleanShutdown = sourceC.shutdown();
	expect(cleanShutdown as unknown).not.toBe(failedRecovery);
	await cleanShutdown;
	expect([setups, installs, starts, reloads, teardowns]).toEqual([3, 2, 2, 0, 2]);
});
