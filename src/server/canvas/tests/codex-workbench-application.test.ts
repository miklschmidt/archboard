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
	releaseStart();
	releaseCleanup();
	await shutdown;
	expect(
		await preparing.then(
			() => null,
			(error: unknown) => error,
		),
	).toBeInstanceOf(Error);
	expect(state).toMatchObject({ installed: false, phase: "stopped", shutdown: null });
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
	expect(state).toMatchObject({ installed: false, phase: "stopped", shutdown: null });

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
