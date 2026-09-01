import { describe, expect, test } from "bun:test";
import { emptyCodexWorkbenchRetainedState } from "../../../src/server/canvas/codex-workbench.js";

describe("production Codex workbench composition policy", () => {
	test("starts with only scalar state, a process slot, and lifecycle closure slots", () => {
		expect(emptyCodexWorkbenchRetainedState()).toEqual({
			owner: null,
			generation: 0,
			state: "idle",
			failure: null,
			process: null,
			startCurrentGeneration: null,
			reloadCurrentGeneration: null,
			shutdownCurrentGeneration: null,
			readCurrentSnapshot: null,
		});
	});
});
