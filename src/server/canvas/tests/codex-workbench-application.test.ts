import { expect, test } from "bun:test";

import { createCanvasCodexWorkbenchApplication } from "../codex-workbench-application.js";

test("Codex application owns one install and one terminal shutdown", async () => {
	const events: string[] = [];
	const state = {
		installed: false,
		phase: "idle" as const as "idle" | "preparing" | "installed" | "stopping" | "stopped",
		shutdown: null as (() => Promise<void>) | null,
	};
	const application = createCanvasCodexWorkbenchApplication({
		state,
		installation: () => ({}) as never,
		module: {
			installProductionCodexWorkbench: () =>
				({
					start: async () => {
						events.push("start");
						return { state: "running" } as never;
					},
					shutdown: async () => {
						events.push("shutdown");
						return { state: "stopped" } as never;
					},
				}) as never,
		},
	});

	await application.prepare();
	expect(state).toMatchObject({ installed: true, phase: "installed" });
	await application.shutdown();
	await application.shutdown();
	expect(state).toMatchObject({ installed: false, phase: "stopped" });
	expect(events).toEqual(["start", "shutdown"]);
});

test("Codex shutdown cancels startup before readiness instead of waiting for it", async () => {
	const events: string[] = [];
	let releaseStart!: () => void;
	const startGate = new Promise<void>((resolve) => void (releaseStart = resolve));
	const state = {
		installed: false,
		phase: "idle" as const as "idle" | "preparing" | "installed" | "stopping" | "stopped",
		shutdown: null as (() => Promise<void>) | null,
	};
	const application = createCanvasCodexWorkbenchApplication({
		state,
		installation: () => ({}) as never,
		module: {
			installProductionCodexWorkbench: () =>
				({
					start: async () => {
						events.push("start");
						await startGate;
						return { state: "running" } as never;
					},
					shutdown: async () => {
						events.push("shutdown");
						releaseStart();
						return { state: "stopped" } as never;
					},
				}) as never,
		},
	});

	const preparing = application.prepare();
	const stopping = application.shutdown();
	await expect(preparing).rejects.toThrow("stopped during startup");
	await stopping;
	expect(events).toEqual(["start", "shutdown"]);
	expect(state).toMatchObject({ installed: false, phase: "stopped" });
});

test("Codex application retains a failed stop owner for a force retry", async () => {
	let shutdowns = 0;
	const state = {
		installed: false,
		phase: "idle" as const as "idle" | "preparing" | "installed" | "stopping" | "stopped",
		shutdown: null as (() => Promise<void>) | null,
	};
	const application = createCanvasCodexWorkbenchApplication({
		state,
		installation: () => ({}) as never,
		module: {
			installProductionCodexWorkbench: () =>
				({
					start: async () => ({ state: "running" }) as never,
					shutdown: async () => {
						shutdowns++;
						if (shutdowns === 1) throw new Error("first stop did not prove terminal state");
						return { state: "stopped" } as never;
					},
				}) as never,
		},
	});
	await application.prepare();

	await expect(application.shutdown()).rejects.toThrow("did not prove terminal state");
	expect(state.phase).toBe("stopping");
	await application.shutdown();
	expect(shutdowns).toBe(2);
	expect(state.phase).toBe("stopped");
});

test("Codex application retains a startup owner whose terminal cleanup failed", async () => {
	let shutdowns = 0;
	const state = {
		installed: false,
		phase: "idle" as const as "idle" | "preparing" | "installed" | "stopping" | "stopped",
		shutdown: null as (() => Promise<void>) | null,
	};
	const application = createCanvasCodexWorkbenchApplication({
		state,
		installation: () => ({}) as never,
		module: {
			installProductionCodexWorkbench: () =>
				({
					start: async () => {
						throw new Error("startup failed");
					},
					shutdown: async () => {
						shutdowns++;
						if (shutdowns === 1) throw new Error("startup cleanup was not terminal");
						return { state: "stopped" } as never;
					},
				}) as never,
		},
	});

	await expect(application.prepare()).rejects.toThrow(
		"Codex workbench startup and terminal cleanup both failed",
	);
	expect(state.phase).toBe("stopping");
	await application.shutdown();
	expect(shutdowns).toBe(2);
	expect(state.phase).toBe("stopped");
});
