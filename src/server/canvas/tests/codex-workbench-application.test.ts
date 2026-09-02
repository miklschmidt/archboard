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
