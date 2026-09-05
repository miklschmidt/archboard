import { expect, test } from "bun:test";

import { createCanvasCodexWorkbenchApplication } from "../codex-workbench-application.js";

test("Codex application owns one install and one terminal shutdown", async () => {
	const events: string[] = [];
	let installs = 0;
	const application = createCanvasCodexWorkbenchApplication({
		installation: () => ({}) as never,
		module: {
			installProductionCodexWorkbench: () => {
				installs += 1;
				return {
					start: async () => {
						events.push("start");
						return { state: "running" } as never;
					},
					shutdown: async () => {
						events.push("shutdown");
						return { state: "stopped" } as never;
					},
				} as never;
			},
		},
	});

	await application.prepare();
	await expect(application.prepare()).rejects.toThrow("already installed");
	await application.shutdown();
	await application.shutdown();
	expect(events).toEqual(["start", "shutdown"]);
	expect(installs).toBe(1);
});

test("Codex shutdown cancels startup before readiness instead of waiting for it", async () => {
	const events: string[] = [];
	let releaseStart!: () => void;
	const startGate = new Promise<void>((resolve) => void (releaseStart = resolve));
	const application = createCanvasCodexWorkbenchApplication({
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
});

test("Codex application retains a failed stop owner for a force retry", async () => {
	let shutdowns = 0;
	const application = createCanvasCodexWorkbenchApplication({
		installation: () => ({}) as never,
		module: {
			installProductionCodexWorkbench: () =>
				({
					start: async () => ({ state: "running" }) as never,
					shutdown: async () => {
						shutdowns++;
						if (shutdowns === 1) {
							throw new Error("first stop did not prove terminal state");
						}
						return { state: "stopped" } as never;
					},
				}) as never,
		},
	});
	await application.prepare();

	await expect(application.shutdown()).rejects.toThrow("did not prove terminal state");
	await application.shutdown();
	expect(shutdowns).toBe(2);
});

test("Codex application retains a startup owner whose terminal cleanup failed", async () => {
	let shutdowns = 0;
	let installs = 0;
	const application = createCanvasCodexWorkbenchApplication({
		installation: () => ({}) as never,
		module: {
			installProductionCodexWorkbench: () => {
				installs += 1;
				return {
					start: async () => {
						throw new Error("startup failed");
					},
					shutdown: async () => {
						shutdowns++;
						if (shutdowns === 1) {
							throw new Error("startup cleanup was not terminal");
						}
						return { state: "stopped" } as never;
					},
				} as never;
			},
		},
	});

	await expect(application.prepare()).rejects.toThrow(
		"Codex workbench startup and terminal cleanup both failed",
	);
	await expect(application.prepare()).rejects.toThrow("already installed");
	await application.shutdown();
	expect({ shutdowns, installs }).toEqual({ shutdowns: 2, installs: 1 });
});

test("a clean startup failure releases the stage for one later retry", async () => {
	const events: string[] = [];
	let installs = 0;
	const application = createCanvasCodexWorkbenchApplication({
		installation: () => ({}) as never,
		module: {
			installProductionCodexWorkbench: () => {
				const attempt = ++installs;
				return {
					start: async () => {
						events.push(`start:${attempt}`);
						if (attempt === 1) {
							throw new Error("startup failed");
						}
						return { state: "running" } as never;
					},
					shutdown: async () => void events.push(`shutdown:${attempt}`) as never,
				} as never;
			},
		},
	});

	await expect(application.prepare()).rejects.toThrow("startup failed");
	await application.prepare();
	await application.shutdown();
	expect(events).toEqual(["start:1", "shutdown:1", "start:2", "shutdown:2"]);
});
