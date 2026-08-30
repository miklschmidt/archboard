import { describe, expect, test } from "bun:test";

import * as timing from "../timing.ts";

const REVIEWED_VALUES = {
	CODEX_PROCESS_RESTART_BASE_MS: 1_000,
	CODEX_PROCESS_RESTART_MAX_MS: 30_000,
	CODEX_REQUEST_SETTLEMENT_MS: 30_000,
	CODEX_BROWSER_COMMAND_LEASE_MS: 150_000,
	CODEX_APPROVAL_EXPIRY_MS: 90_000,
	CODEX_SPOKEN_GATE_EXPIRY_MS: 60_000,
	CODEX_SEMANTIC_FRESHNESS_MS: 30_000,
	CODEX_REALTIME_START_MS: 15_000,
	CODEX_REALTIME_STOP_MS: 3_000,
	CODEX_REALTIME_RECOVERY_MS: 45_000,
	CODEX_TERM_GRACE_MS: 5_000,
	CODEX_COMPOSED_SHUTDOWN_MS: 10_000,
} as const;

const CODEX_WORKBENCH_TIMING_NAMES = Object.keys(REVIEWED_VALUES);

describe("Codex workbench timing policy", () => {
	test("exports exactly the reviewed workbench names and retains injection names", () => {
		const exportedNames = Object.keys(timing)
			.filter((name) => name.startsWith("CODEX_"))
			.toSorted();
		expect(exportedNames).toEqual(CODEX_WORKBENCH_TIMING_NAMES.toSorted());
		expect(Object.hasOwn(timing, "DEFAULT_INJECT_DEBOUNCE_MS")).toBeTrue();
		expect(Object.hasOwn(timing, "DEFAULT_INJECT_MIN_INTERVAL_MS")).toBeTrue();
	});

	test("freezes every reviewed millisecond value", () => {
		expect({
			CODEX_PROCESS_RESTART_BASE_MS: timing.CODEX_PROCESS_RESTART_BASE_MS,
			CODEX_PROCESS_RESTART_MAX_MS: timing.CODEX_PROCESS_RESTART_MAX_MS,
			CODEX_REQUEST_SETTLEMENT_MS: timing.CODEX_REQUEST_SETTLEMENT_MS,
			CODEX_BROWSER_COMMAND_LEASE_MS: timing.CODEX_BROWSER_COMMAND_LEASE_MS,
			CODEX_APPROVAL_EXPIRY_MS: timing.CODEX_APPROVAL_EXPIRY_MS,
			CODEX_SPOKEN_GATE_EXPIRY_MS: timing.CODEX_SPOKEN_GATE_EXPIRY_MS,
			CODEX_SEMANTIC_FRESHNESS_MS: timing.CODEX_SEMANTIC_FRESHNESS_MS,
			CODEX_REALTIME_START_MS: timing.CODEX_REALTIME_START_MS,
			CODEX_REALTIME_STOP_MS: timing.CODEX_REALTIME_STOP_MS,
			CODEX_REALTIME_RECOVERY_MS: timing.CODEX_REALTIME_RECOVERY_MS,
			CODEX_TERM_GRACE_MS: timing.CODEX_TERM_GRACE_MS,
			CODEX_COMPOSED_SHUTDOWN_MS: timing.CODEX_COMPOSED_SHUTDOWN_MS,
		}).toEqual(REVIEWED_VALUES);
	});

	test("keeps the authored timing relationships", () => {
		expect(timing.CODEX_PROCESS_RESTART_BASE_MS).toBeLessThanOrEqual(
			timing.CODEX_PROCESS_RESTART_MAX_MS,
		);
		expect(timing.CODEX_REQUEST_SETTLEMENT_MS).toBeLessThanOrEqual(
			timing.CODEX_PROCESS_RESTART_MAX_MS,
		);
		expect(timing.CODEX_REQUEST_SETTLEMENT_MS).toBeLessThan(timing.CODEX_BROWSER_COMMAND_LEASE_MS);
		expect(timing.CODEX_APPROVAL_EXPIRY_MS).toBeLessThan(timing.CODEX_BROWSER_COMMAND_LEASE_MS);
		expect(timing.CODEX_SPOKEN_GATE_EXPIRY_MS).toBeLessThanOrEqual(timing.CODEX_APPROVAL_EXPIRY_MS);
		expect(timing.CODEX_SEMANTIC_FRESHNESS_MS).toBeLessThan(timing.CODEX_REALTIME_RECOVERY_MS);
		expect(timing.CODEX_REALTIME_STOP_MS).toBeLessThan(timing.CODEX_TERM_GRACE_MS);
		expect(timing.CODEX_REALTIME_STOP_MS + timing.CODEX_TERM_GRACE_MS).toBeLessThan(
			timing.CODEX_COMPOSED_SHUTDOWN_MS,
		);
	});

	test("rejects a restart max below settlement even when its golden changes", () => {
		const changedGolden = { ...REVIEWED_VALUES, CODEX_PROCESS_RESTART_MAX_MS: 29_999 };
		expect(changedGolden.CODEX_PROCESS_RESTART_MAX_MS).toBe(29_999);
		expect(() =>
			expect(changedGolden.CODEX_REQUEST_SETTLEMENT_MS).toBeLessThanOrEqual(
				changedGolden.CODEX_PROCESS_RESTART_MAX_MS,
			),
		).toThrow();
	});
});
