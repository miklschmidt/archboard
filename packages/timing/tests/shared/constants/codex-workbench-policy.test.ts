import { describe, expect, test } from "bun:test";

import {
	CODEX_APPROVAL_MS as approval,
	CODEX_PROCESS_MS as process,
	CODEX_REALTIME_MS as realtime,
	CODEX_SESSION_MS as session,
} from "#shared/constants/codex.ts";

describe("Codex workbench timing policy", () => {
	test("keeps the authored timing relationships", () => {
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
});
