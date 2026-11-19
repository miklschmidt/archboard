import { describe, expect, test } from "bun:test";

import * as timing from "#shared/constants/timing.ts";

const REVIEWED_GROUPS = {
	codexProcessMs: {
		restartBase: 1000,
		restartMax: 30_000,
		stdinEofGrace: 1000,
		termGrace: 5000,
		groupFreeze: 500,
		composedShutdown: 10_000,
	},
	codexSessionMs: {
		explanationTurnStart: 15_000,
		explanationText: 150,
		requestSettlement: 30_000,
		waitTargetPoll: 250,
		queueRereadFloor: 1000,
		workTreeStopPoll: 250,
		workTreeStopSettle: 5000,
	},
	codexRealtimeMs: {
		start: 15_000,
		stop: 3000,
		recovery: 45_000,
		contextFreshness: 30_000,
		clientReconnect: 3000,
		tabSessionGrace: 60_000,
	},
	codexApprovalMs: {
		browserCommandLease: 150_000,
		expiry: 90_000,
		spokenGate: 60_000,
	},
} as const;

describe("Codex workbench timing policy", () => {
	test("answers each reviewed duration", () => {
		for (const [name, reviewed] of Object.entries(REVIEWED_GROUPS)) {
			const read = timing[name as keyof typeof REVIEWED_GROUPS] as (key: string) => number;
			for (const [key, ms] of Object.entries(reviewed)) expect(read(key)).toBe(ms);
		}
	});

	test("keeps the authored timing relationships", () => {
		const process = REVIEWED_GROUPS.codexProcessMs;
		const session = REVIEWED_GROUPS.codexSessionMs;
		const realtime = REVIEWED_GROUPS.codexRealtimeMs;
		const approval = REVIEWED_GROUPS.codexApprovalMs;
		expect(process.restartBase).toBeLessThanOrEqual(process.restartMax);
		expect(session.requestSettlement).toBeLessThanOrEqual(process.restartMax);
		expect(session.requestSettlement).toBeLessThan(approval.browserCommandLease);
		expect(session.requestSettlement % session.waitTargetPoll).toBe(0);
		expect(session.queueRereadFloor).toBeGreaterThanOrEqual(session.waitTargetPoll);
		expect(session.queueRereadFloor).toBeLessThan(session.requestSettlement);
		expect(session.workTreeStopPoll).toBeGreaterThanOrEqual(session.waitTargetPoll);
		expect(session.workTreeStopSettle).toBeGreaterThanOrEqual(4 * session.workTreeStopPoll);
		expect(session.workTreeStopSettle).toBeLessThan(session.requestSettlement);
		expect(approval.expiry).toBeLessThan(approval.browserCommandLease);
		expect(approval.spokenGate).toBeLessThanOrEqual(approval.expiry);
		expect(realtime.contextFreshness).toBeLessThan(realtime.recovery);
		expect(realtime.clientReconnect).toBeLessThan(realtime.tabSessionGrace);
		expect(realtime.tabSessionGrace).toBeLessThan(approval.expiry);
		expect(realtime.stop).toBeLessThan(process.termGrace);
		expect(process.stdinEofGrace).toBeGreaterThan(0);
		expect(
			realtime.stop + process.stdinEofGrace + process.termGrace + process.groupFreeze,
		).toBeLessThan(process.composedShutdown);
	});

	test("doubles the restart delay per failed attempt up to the cap", () => {
		const { restartBase, restartMax } = REVIEWED_GROUPS.codexProcessMs;
		expect(timing.codexRestartDelayMs(0)).toBe(restartBase);
		expect(timing.codexRestartDelayMs(1)).toBe(2 * restartBase);
		expect(timing.codexRestartDelayMs(2)).toBe(4 * restartBase);
		expect(timing.codexRestartDelayMs(1000)).toBe(restartMax);
	});
});
