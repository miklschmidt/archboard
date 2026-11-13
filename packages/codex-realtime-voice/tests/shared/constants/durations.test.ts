import { describe, expect, test } from "bun:test";

import { CODEX_SESSION_MS } from "@archboard/codex-app-server/contract";
import {
	CODEX_APPROVAL_MS,
	CODEX_REALTIME_MS,
	TAB_SESSION_GRACE_MS,
} from "#shared/constants/durations.ts";

describe("voice durations", () => {
	test("keep the reviewed values, frozen", () => {
		expect(CODEX_REALTIME_MS).toEqual({
			start: 15_000,
			stop: 3000,
			recovery: 45_000,
			contextFreshness: 30_000,
			clientReconnect: 3000,
		});
		expect(CODEX_APPROVAL_MS).toEqual({
			browserCommandLease: 150_000,
			expiry: 90_000,
			spokenGate: 60_000,
		});
		expect(Object.isFrozen(CODEX_REALTIME_MS)).toBe(true);
		expect(Object.isFrozen(CODEX_APPROVAL_MS)).toBe(true);
	});

	test("keep the authored relations among the voice's own durations", () => {
		const realtime = CODEX_REALTIME_MS;
		const approval = CODEX_APPROVAL_MS;
		expect(approval.expiry).toBeLessThan(approval.browserCommandLease);
		expect(approval.spokenGate).toBeLessThanOrEqual(approval.expiry);
		expect(realtime.contextFreshness).toBeLessThan(realtime.recovery);
		expect(realtime.clientReconnect).toBeLessThan(TAB_SESSION_GRACE_MS);
		expect(TAB_SESSION_GRACE_MS).toBeLessThan(approval.expiry);
	});

	test("fit inside the app-server's request bound", () => {
		expect(CODEX_SESSION_MS.requestSettlement).toBeLessThan(CODEX_APPROVAL_MS.browserCommandLease);
	});
});
