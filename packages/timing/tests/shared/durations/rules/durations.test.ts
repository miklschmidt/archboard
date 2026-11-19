import { describe, expect, test } from "bun:test";

import { codexRestartDelayMs, deadline, durationMs } from "#shared/constants/timing.ts";

describe("deadline", () => {
	test("ends a named duration after its start", () => {
		expect(deadline("pane.report", 1_000)).toBe(1_300);
	});

	test("never passes an outer cap", () => {
		expect(deadline("codexProcess.termGrace", 1_000, 3_000)).toBe(3_000);
		expect(deadline("codexProcess.termGrace", 1_000, 60_000)).toBe(6_000);
	});
});

describe("durationMs", () => {
	test("reads a duration that a stylesheet, a timer or a library takes", () => {
		expect(durationMs("voice.morph")).toBe(520);
		expect(durationMs("modelLock.poll")).toBe(50);
	});
});

describe("codexRestartDelayMs", () => {
	test("doubles the restart delay per failed attempt up to the cap", () => {
		expect(codexRestartDelayMs(0)).toBe(1000);
		expect(codexRestartDelayMs(1)).toBe(2000);
		expect(codexRestartDelayMs(2)).toBe(4000);
		expect(codexRestartDelayMs(1000)).toBe(30_000);
	});
});
