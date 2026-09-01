import { expect, test } from "bun:test";

import { createCanvasCodexWorkbenchApplication } from "../codex-workbench-application.js";
import type { CodexWorkbenchGenerationInput } from "../codex-workbench-owner.js";

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
		reloadProductionCodexWorkbench: async (
			hooks: (input: CodexWorkbenchGenerationInput) => unknown,
		) => {
			hooks({ generation: 1 } as CodexWorkbenchGenerationInput);
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
