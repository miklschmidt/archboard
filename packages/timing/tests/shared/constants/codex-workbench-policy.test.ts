import { describe, expect, test } from "bun:test";

import * as timing from "#shared/constants/timing.ts";

const REVIEWED_GROUPS = {
	CODEX_PROCESS_MS: {
		restartBase: 1000,
		restartMax: 30_000,
		stdinEofGrace: 1000,
		termGrace: 5000,
		groupFreeze: 500,
		composedShutdown: 10_000,
	},
	CODEX_SESSION_MS: {
		requestSettlement: 30_000,
		waitTargetPoll: 250,
		queueRereadFloor: 1000,
	},
	CODEX_REALTIME_MS: {
		start: 15_000,
		stop: 3000,
		recovery: 45_000,
		contextFreshness: 30_000,
	},
	CODEX_VOICE_CLIENT_MS: {
		reconnect: 3000,
	},
	CODEX_APPROVAL_MS: {
		browserCommandLease: 150_000,
		expiry: 90_000,
		spokenGate: 60_000,
	},
} as const;

describe("Codex workbench timing policy", () => {
	test("exports exactly the reviewed groups, frozen", () => {
		const exportedGroups = Object.keys(timing)
			.filter((name) => name.startsWith("CODEX_"))
			.toSorted();
		expect(exportedGroups).toEqual(Object.keys(REVIEWED_GROUPS).toSorted());
		for (const [name, reviewed] of Object.entries(REVIEWED_GROUPS)) {
			const group = timing[name as keyof typeof REVIEWED_GROUPS];
			expect(group).toEqual(reviewed);
			expect(Object.isFrozen(group)).toBe(true);
		}
	});

	test("keeps the authored timing relationships", () => {
		const { CODEX_PROCESS_MS: process, CODEX_SESSION_MS: session } = timing;
		const { CODEX_REALTIME_MS: realtime, CODEX_APPROVAL_MS: approval } = timing;
		expect(process.restartBase).toBeLessThanOrEqual(process.restartMax);
		expect(session.requestSettlement).toBeLessThanOrEqual(process.restartMax);
		expect(session.requestSettlement).toBeLessThan(approval.browserCommandLease);
		expect(session.requestSettlement % session.waitTargetPoll).toBe(0);
		expect(session.queueRereadFloor).toBeGreaterThanOrEqual(session.waitTargetPoll);
		expect(session.queueRereadFloor).toBeLessThan(session.requestSettlement);
		expect(approval.expiry).toBeLessThan(approval.browserCommandLease);
		expect(approval.spokenGate).toBeLessThanOrEqual(approval.expiry);
		expect(realtime.contextFreshness).toBeLessThan(realtime.recovery);
		expect(timing.CODEX_VOICE_CLIENT_MS.reconnect).toBeLessThan(timing.TAB_SESSION_GRACE_MS);
		expect(realtime.stop).toBeLessThan(process.termGrace);
		expect(process.stdinEofGrace).toBeGreaterThan(0);
		expect(
			realtime.stop + process.stdinEofGrace + process.termGrace + process.groupFreeze,
		).toBeLessThan(process.composedShutdown);
	});

	test("doubles the restart delay per failed attempt up to the cap", () => {
		const { restartBase, restartMax } = timing.CODEX_PROCESS_MS;
		expect(timing.codexRestartDelayMs(0)).toBe(restartBase);
		expect(timing.codexRestartDelayMs(1)).toBe(2 * restartBase);
		expect(timing.codexRestartDelayMs(2)).toBe(4 * restartBase);
		expect(timing.codexRestartDelayMs(1000)).toBe(restartMax);
	});
});
