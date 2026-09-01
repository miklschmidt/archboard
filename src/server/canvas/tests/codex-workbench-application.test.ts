import { expect, test } from "bun:test";

import { createCanvasCodexWorkbenchApplication } from "../codex-workbench-application.js";
import {
	emptyCodexWorkbenchRetainedState,
	installCodexWorkbenchOwner,
	type CodexWorkbenchGenerationInput,
} from "../codex-workbench-owner.js";
import { fakeGeneration, fakeProcess } from "./support/codex-workbench-owner-fake.js";

test("the canvas awaits initial graph readiness, replaces hooks on reload, and shuts down once", async () => {
	const events: string[] = [];
	const state = { installed: false, shutdown: null };
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
		load: async () => module,
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
	const state = { installed: false, shutdown: null };
	const application = createCanvasCodexWorkbenchApplication({
		state,
		load: async () => ({
			installProductionCodexWorkbench: () =>
				({
					start: () => Promise.reject(new Error("initialization failed")),
				}) as never,
			reloadProductionCodexWorkbench: async () => ({}) as never,
			shutdownProductionCodexWorkbench: async () => ({}) as never,
		}),
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

test("shutdown invokes retained revocation before its first await", async () => {
	const state = { installed: false, shutdown: null };
	let revoked = false;
	let releaseCleanup!: () => void;
	const cleanupGate = new Promise<void>((resolve) => void (releaseCleanup = resolve));
	const module = {
		installProductionCodexWorkbench: () => ({ start: async () => ({ ready: true }) }) as never,
		reloadProductionCodexWorkbench: async () => ({ ready: true }) as never,
		shutdownProductionCodexWorkbench: () => {
			revoked = true;
			return cleanupGate.then(() => ({ ready: false }) as never);
		},
	};
	let loads = 0;
	let releaseSecondLoad!: () => void;
	const secondLoadGate = new Promise<void>((resolve) => void (releaseSecondLoad = resolve));
	const application = createCanvasCodexWorkbenchApplication({
		state,
		load: async () => {
			loads++;
			if (loads > 1) await secondLoadGate;
			return module;
		},
		installation: () => ({}) as never,
	});
	await application.prepare();

	const shutdown = application.shutdown();
	expect(revoked).toBeTrue();
	releaseSecondLoad();
	releaseCleanup();
	await shutdown;
});

test("application shutdown revokes every retained wrapper before deferred graph cleanup", async () => {
	const retained = emptyCodexWorkbenchRetainedState();
	let cleanupEntered!: () => void;
	const entered = new Promise<void>((resolve) => void (cleanupEntered = resolve));
	let releaseCleanup!: () => void;
	const cleanupGate = new Promise<void>((resolve) => void (releaseCleanup = resolve));
	const owner = installCodexWorkbenchOwner(retained, {
		createProcess: () => fakeProcess([]),
		createGeneration: async () =>
			fakeGeneration([], 1, {
				stop: async () => {
					cleanupEntered();
					await cleanupGate;
				},
			}),
	});
	const state = { installed: false, shutdown: null };
	const application = createCanvasCodexWorkbenchApplication({
		state,
		load: async () => ({
			installProductionCodexWorkbench: () => owner,
			reloadProductionCodexWorkbench: async () => ({}) as never,
			shutdownProductionCodexWorkbench: owner.shutdown,
		}),
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
