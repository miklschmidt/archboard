import { expect, test } from "bun:test";

import {
	createCanvasCodexWorkbenchApplication,
	type CanvasCodexWorkbenchApplicationState,
} from "../codex-workbench-application.js";
import {
	emptyCodexWorkbenchRetainedState,
	installCodexWorkbenchOwner,
	type CodexWorkbenchGenerationInput,
} from "../codex-workbench-owner.js";
import {
	adoptFakeKernel,
	fakeGeneration,
	fakeKernelAcquisition,
	fakeProcess,
} from "./support/codex-workbench-owner-fake.js";

function applicationState(): CanvasCodexWorkbenchApplicationState {
	return { installed: false, phase: "idle", shutdown: null };
}

function rejected(operation: Promise<unknown>): Promise<unknown> {
	return operation.then(
		() => null,
		(error: unknown) => error,
	);
}

function expectStopped(
	state: CanvasCodexWorkbenchApplicationState,
	shutdown: () => Promise<void>,
): void {
	expect(state).toMatchObject({ installed: false, phase: "stopped", shutdown });
}

test("the canvas awaits initial graph readiness, replaces hooks on reload, and shuts down once", async () => {
	const events: string[] = [];
	const state = applicationState();
	let releaseStart!: () => void;
	const startGate = new Promise<void>((resolve) => {
		releaseStart = resolve;
	});
	const module = {
		installProductionCodexWorkbench: () =>
			({
				start: async () => {
					events.push("start:begin");
					await startGate;
					events.push("start:ready");
					return { ready: true } as never;
				},
			}) as never,
		reloadProductionCodexWorkbench: async (installation: {
			readonly hooks: (input: CodexWorkbenchGenerationInput) => unknown;
		}) => {
			installation.hooks({ generation: 1 } as CodexWorkbenchGenerationInput);
			events.push("reload");
			return { ready: true } as never;
		},
		shutdownProductionCodexWorkbench: async () => {
			events.push("shutdown");
			return { ready: false } as never;
		},
	};
	const application = createCanvasCodexWorkbenchApplication({
		state,
		module,
		installation: () => ({
			process: {} as never,
			bindings: () => ({}) as never,
			hooks: () => {
				events.push("hooks");
				return {} as never;
			},
		}),
	});

	const preparing = application.prepare();
	await Promise.resolve();
	expect(events).toEqual(["start:begin"]);
	expect(state.installed).toBeFalse();
	releaseStart();
	await preparing;
	expect(state.installed).toBeTrue();
	await application.prepare();
	expect(events).toContain("hooks");
	expect(events).toContain("reload");
	await Promise.all([application.shutdown(), application.shutdown()]);
	expect(events.filter((event) => event === "shutdown")).toHaveLength(1);
	expect(state.installed).toBeFalse();
});

test("failed startup never publishes an installed owner and delegates graph cleanup", async () => {
	const state = applicationState();
	const application = createCanvasCodexWorkbenchApplication({
		state,
		module: {
			installProductionCodexWorkbench: () =>
				({
					start: () => Promise.reject(new Error("initialization failed")),
				}) as never,
			reloadProductionCodexWorkbench: async () => ({}) as never,
			shutdownProductionCodexWorkbench: async () => ({}) as never,
		},
		installation: () => ({}) as never,
	});

	try {
		await application.prepare();
		expect.unreachable("startup should fail");
	} catch (error) {
		expect((error as Error).message).toContain("initialization failed");
	}
	expect(state.installed).toBeFalse();
	expect(state.shutdown).toBeNull();
});

test("shutdown during initial preparation revokes once before startup is released", async () => {
	const state = applicationState();
	let revoked = false;
	let shutdownCalls = 0;
	let releaseStart!: () => void;
	const startGate = new Promise<void>((resolve) => void (releaseStart = resolve));
	let releaseCleanup!: () => void;
	const cleanupGate = new Promise<void>((resolve) => void (releaseCleanup = resolve));
	const module = {
		installProductionCodexWorkbench: () =>
			({
				start: async () => {
					await startGate;
					return { ready: true };
				},
			}) as never,
		reloadProductionCodexWorkbench: async () => ({ ready: true }) as never,
		shutdownProductionCodexWorkbench: () => {
			revoked = true;
			shutdownCalls++;
			return cleanupGate.then(() => ({ ready: false }) as never);
		},
	};
	const application = createCanvasCodexWorkbenchApplication({
		state,
		module,
		installation: () => ({}) as never,
	});
	const preparing = application.prepare();
	expect(state.phase).toBe("preparing");
	expect(state.shutdown).toBe(application.shutdown);

	const shutdown = application.shutdown();
	expect(revoked).toBeTrue();
	expect(shutdownCalls).toBe(1);
	expect(state.phase).toBe("stopping");
	releaseCleanup();
	await shutdown;
	expect(state).toMatchObject({ installed: false, phase: "stopping" });
	expect(application.shutdown()).toBe(shutdown);
	const prepareBeforeReadinessSettles = rejected(application.prepare());
	releaseStart();
	expect(
		await preparing.then(
			() => null,
			(error: unknown) => error,
		),
	).toBeInstanceOf(Error);
	expect(await prepareBeforeReadinessSettles).toBeInstanceOf(Error);
	expectStopped(state, application.shutdown);
});

test("concurrent startup and shutdown failures are preserved together", async () => {
	const state = applicationState();
	let releaseStart!: () => void;
	const startGate = new Promise<void>((resolve) => void (releaseStart = resolve));
	let releaseShutdown!: () => void;
	const shutdownGate = new Promise<void>((resolve) => void (releaseShutdown = resolve));
	const application = createCanvasCodexWorkbenchApplication({
		state,
		module: {
			installProductionCodexWorkbench: () =>
				({
					start: async () => {
						await startGate;
						throw new Error("startup failed");
					},
				}) as never,
			reloadProductionCodexWorkbench: async () => ({}) as never,
			shutdownProductionCodexWorkbench: async () => {
				await shutdownGate;
				throw new Error("shutdown failed");
			},
		},
		installation: () => ({}) as never,
	});
	const preparing = application.prepare();
	const stopping = application.shutdown();
	releaseStart();
	releaseShutdown();
	expect(
		await stopping.then(
			() => null,
			(error: unknown) => error,
		),
	).toBeInstanceOf(Error);
	const failure = await preparing.then(
		() => null,
		(error: unknown) => error,
	);
	expect(failure).toBeInstanceOf(AggregateError);
	expect((failure as AggregateError).errors.map((error) => (error as Error).message)).toEqual([
		"startup failed",
		"shutdown failed",
	]);
	expectStopped(state, application.shutdown);

	const recovery = createCanvasCodexWorkbenchApplication({
		state,
		module: {
			installProductionCodexWorkbench: () => ({ start: async () => ({ ready: true }) }) as never,
			reloadProductionCodexWorkbench: async () => ({ ready: true }) as never,
			shutdownProductionCodexWorkbench: async () => ({ ready: false }) as never,
		},
		installation: () => ({}) as never,
	});
	await recovery.prepare();
	expect(state).toMatchObject({ installed: true, phase: "installed" });
	await recovery.shutdown();
});

test("prepare refuses while one installed shutdown owns the application", async () => {
	const state = applicationState();
	let installs = 0;
	let reloads = 0;
	let shutdownCalls = 0;
	let releaseCleanup!: () => void;
	const cleanupGate = new Promise<void>((resolve) => void (releaseCleanup = resolve));
	const module = {
		installProductionCodexWorkbench: () => {
			installs++;
			return { start: async () => ({ ready: true }) } as never;
		},
		reloadProductionCodexWorkbench: async () => {
			reloads++;
			return { ready: true } as never;
		},
		shutdownProductionCodexWorkbench: async () => {
			shutdownCalls++;
			await cleanupGate;
			return { ready: false } as never;
		},
	};
	const application = createCanvasCodexWorkbenchApplication({
		state,
		module,
		installation: () => ({}) as never,
	});
	await application.prepare();

	const shutdownA = application.shutdown();
	const replacementSource = createCanvasCodexWorkbenchApplication({
		state,
		module,
		installation: () => ({}) as never,
	});
	const prepareWhileStopping = rejected(replacementSource.prepare());
	const shutdownB = replacementSource.shutdown();
	expect(shutdownB).toBe(shutdownA);
	expect(shutdownCalls).toBe(1);
	expect(reloads).toBe(0);
	expect(state).toMatchObject({ installed: false, phase: "stopping" });
	expect(state.shutdown).toBe(application.shutdown);

	releaseCleanup();
	await shutdownA;
	const refusal = await prepareWhileStopping;
	expect(refusal).toBeInstanceOf(Error);
	expect((refusal as Error).message).toContain("shutdown to finish");
	expectStopped(state, application.shutdown);
	const settledReplacementSource = createCanvasCodexWorkbenchApplication({
		state,
		module,
		installation: () => ({}) as never,
	});
	const shutdownAfterReplacement = settledReplacementSource.shutdown();
	expect(shutdownAfterReplacement).toBe(shutdownA);
	await shutdownAfterReplacement;
	expect(shutdownCalls).toBe(1);
	expect(installs).toBe(1);
	expect(reloads).toBe(0);

	await settledReplacementSource.prepare();
	expect(installs).toBe(2);
	expect(reloads).toBe(0);
	expect(state).toMatchObject({ installed: true, phase: "installed" });
	const recoveredShutdown = settledReplacementSource.shutdown();
	expect(recoveredShutdown).not.toBe(shutdownA);
	await recoveredShutdown;
	expect(shutdownCalls).toBe(2);
});

test("rejecting shutdown remains exact under concurrent prepare and shutdown calls", async () => {
	const state = applicationState();
	const cleanupFailure = new Error("cleanup rejected");
	let installs = 0;
	let reloads = 0;
	let shutdownCalls = 0;
	let releaseCleanup!: () => void;
	const cleanupGate = new Promise<void>((resolve) => void (releaseCleanup = resolve));
	const applicationModule = {
		installProductionCodexWorkbench: () => {
			installs++;
			return { start: async () => ({ ready: true }) } as never;
		},
		reloadProductionCodexWorkbench: async () => {
			reloads++;
			return { ready: true } as never;
		},
		shutdownProductionCodexWorkbench: async () => {
			shutdownCalls++;
			if (shutdownCalls === 1) {
				await cleanupGate;
				throw cleanupFailure;
			}
			return { ready: false } as never;
		},
	};
	const application = createCanvasCodexWorkbenchApplication({
		state,
		module: applicationModule,
		installation: () => ({}) as never,
	});
	await application.prepare();

	const shutdownA = application.shutdown();
	const prepareA = rejected(application.prepare());
	const prepareB = rejected(application.prepare());
	const shutdownB = application.shutdown();
	expect(shutdownB).toBe(shutdownA);
	expect(shutdownCalls).toBe(1);
	expect(reloads).toBe(0);
	expect(state).toMatchObject({ installed: false, phase: "stopping" });
	releaseCleanup();

	expect(await rejected(shutdownA)).toBe(cleanupFailure);
	expect(await rejected(shutdownB)).toBe(cleanupFailure);
	for (const refusal of [await prepareA, await prepareB]) {
		expect(refusal).toBeInstanceOf(Error);
		expect((refusal as Error).message).toContain("shutdown to finish");
	}
	expectStopped(state, application.shutdown);
	expect(application.shutdown()).toBe(shutdownA);
	const settledReplacementSource = createCanvasCodexWorkbenchApplication({
		state,
		module: applicationModule,
		installation: () => ({}) as never,
	});
	const shutdownAfterReplacement = settledReplacementSource.shutdown();
	expect(shutdownAfterReplacement).toBe(shutdownA);
	expect(await rejected(shutdownAfterReplacement)).toBe(cleanupFailure);
	expect(shutdownCalls).toBe(1);
	expect(installs).toBe(1);
	expect(reloads).toBe(0);

	await settledReplacementSource.prepare();
	expect(installs).toBe(2);
	expect(reloads).toBe(0);
	expect(state).toMatchObject({ installed: true, phase: "installed" });
	const recoveredShutdown = settledReplacementSource.shutdown();
	expect(recoveredShutdown).not.toBe(shutdownA);
	await recoveredShutdown;
	expect(shutdownCalls).toBe(2);
});

test("a failed recovery prepare becomes the exact new stopped result", async () => {
	const state = applicationState();
	const recoveryFailure = new Error("recovery startup rejected");
	let failStartup = false;
	let installs = 0;
	let starts = 0;
	let reloads = 0;
	let shutdownCalls = 0;
	const module = {
		installProductionCodexWorkbench: () => {
			installs++;
			return {
				start: async () => {
					starts++;
					if (failStartup) throw recoveryFailure;
					return { ready: true };
				},
			} as never;
		},
		reloadProductionCodexWorkbench: async () => {
			reloads++;
			return { ready: true } as never;
		},
		shutdownProductionCodexWorkbench: async () => {
			shutdownCalls++;
			return { ready: false } as never;
		},
	};
	const sourceA = createCanvasCodexWorkbenchApplication({
		state,
		module,
		installation: () => ({}) as never,
	});
	await sourceA.prepare();
	const shutdownA = sourceA.shutdown();
	await shutdownA;

	failStartup = true;
	const sourceB = createCanvasCodexWorkbenchApplication({
		state,
		module,
		installation: () => ({}) as never,
	});
	const failedRecovery = sourceB.prepare();
	expect(state).toMatchObject({
		installed: false,
		phase: "preparing",
		shutdown: sourceB.shutdown,
	});
	expect(await rejected(failedRecovery)).toBe(recoveryFailure);
	expectStopped(state, sourceB.shutdown);
	expect(sourceB.shutdown() as unknown).toBe(failedRecovery);

	const sourceC = createCanvasCodexWorkbenchApplication({
		state,
		module,
		installation: () => ({}) as never,
	});
	const replayedFailure = sourceC.shutdown();
	expect(replayedFailure as unknown).toBe(failedRecovery);
	expect(await rejected(replayedFailure)).toBe(recoveryFailure);
	expect([installs, starts, reloads, shutdownCalls]).toEqual([2, 2, 0, 1]);

	failStartup = false;
	await sourceC.prepare();
	const recoveredShutdown = sourceC.shutdown();
	expect(recoveredShutdown).not.toBe(shutdownA);
	expect(recoveredShutdown).not.toBe(failedRecovery);
	await recoveredShutdown;
	expect([installs, starts, reloads, shutdownCalls]).toEqual([3, 3, 0, 2]);
});

test("application shutdown revokes every retained wrapper before deferred graph cleanup", async () => {
	const retained = emptyCodexWorkbenchRetainedState();
	let cleanupEntered!: () => void;
	const entered = new Promise<void>((resolve) => void (cleanupEntered = resolve));
	let releaseCleanup!: () => void;
	const cleanupGate = new Promise<void>((resolve) => void (releaseCleanup = resolve));
	const owner = installCodexWorkbenchOwner(retained, {
		createProcess: () => fakeProcess([]),
		createKernel: fakeKernelAcquisition,
		createGeneration: async (input) =>
			adoptFakeKernel(
				input,
				fakeGeneration([], 1, {
					stop: async () => {
						cleanupEntered();
						await cleanupGate;
					},
				}),
			),
	});
	const state = applicationState();
	const application = createCanvasCodexWorkbenchApplication({
		state,
		module: {
			installProductionCodexWorkbench: () => owner,
			reloadProductionCodexWorkbench: async () => ({}) as never,
			shutdownProductionCodexWorkbench: owner.shutdown,
		},
		installation: () => ({}) as never,
	});
	await application.prepare();
	const wrappers = retained.control.wrappers;

	const shutdown = application.shutdown();
	await entered;
	for (const dispatch of [
		() => wrappers.start(),
		() => wrappers.reload(async () => fakeGeneration([], 2)),
		() => wrappers.shutdown(),
		() => wrappers.snapshot(),
		() => wrappers.gateway(),
	])
		expect(dispatch).toThrow("no active retained owner dispatch");
	releaseCleanup();
	await shutdown;
});
