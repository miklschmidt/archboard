import { describe, expect, test } from "bun:test";

import { backoff } from "#shared/constants/timing.ts";
import { WAITS } from "#shared/constants/waits.ts";

/** The Codex workbench durations as they were reviewed. A change to one is a reviewed change. */
const REVIEWED = {
	"codex.restart": { ms: 1000, max: 30_000 },
	"codex.readiness": { ms: 30_000 },
	"codex.stdinEofGrace": { ms: 1000 },
	"codex.termGrace": { ms: 5000 },
	"codex.groupFreeze": { ms: 500 },
	"codex.killDrain": { ms: 10_000 },
	"codex.composedShutdown": { ms: 10_000 },
	"codex.transportShutdown": { ms: 10_000 },
	"codex.startupCleanup": { ms: 10_000 },
	"codex.startupGrace": { ms: 5000 },
	"codex.explanationTurnStart": { ms: 15_000 },
	"codex.explanationText": { ms: 150 },
	"codex.requestSettlement": { ms: 30_000 },
	"codex.versionProof": { ms: 30_000 },
	"codex.dynamicWait": { ms: 120_000 },
	"codex.dynamicWaitLook": { ms: 120_000 },
	"codex.queueRereadFloor": { ms: 1000 },
	"codex.workTreeStop": { ms: 5000 },
	"codex.realtimeStart": { ms: 15_000 },
	"codex.realtimeStop": { ms: 3000 },
	"codex.realtimeRecovery": { ms: 45_000 },
	"codex.contextFreshness": { ms: 30_000 },
	"codex.clientReconnect": { ms: 3000 },
	"codex.tabSessionGrace": { ms: 60_000 },
	"codex.browserCommandLease": { ms: 150_000 },
	"codex.approvalExpiry": { ms: 90_000 },
	"codex.spokenGate": { ms: 60_000 },
} as const;

describe("Codex workbench timing policy", () => {
	test("declares each reviewed duration, and no other Codex duration", () => {
		const declared = Object.fromEntries(
			Object.entries(WAITS)
				.filter(([name]) => name.startsWith("codex."))
				.map(([name, use]) => [name, "max" in use ? { ms: use.ms, max: use.max } : { ms: use.ms }]),
		);
		expect(declared).toEqual(REVIEWED);
	});

	test("doubles the restart delay per failed attempt up to the cap", () => {
		const { ms, max } = REVIEWED["codex.restart"];
		expect(backoff("codex.restart", 0)).toBe(ms);
		expect(backoff("codex.restart", 1)).toBe(2 * ms);
		expect(backoff("codex.restart", 2)).toBe(4 * ms);
		expect(backoff("codex.restart", 1000)).toBe(max);
	});
});
