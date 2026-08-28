/// <reference types="bun" />

import { describe, expect, test } from "bun:test";

import { REPORT_RETRY_MS } from "../../../shared/timing/timing.ts";
import { needsFullReport, reportsSettled } from "../change-reporting.ts";
import { ownsHoldAttempt } from "../hold-attempt.ts";
import { ReportingHarness, ScriptedServer, box, copy } from "./support/change-reporting-harness.ts";

describe("hold ownership", () => {
	test("an away-and-back board name cannot let an old generation clear the current attempt", () => {
		let generation = 0;
		const firstPromise = Promise.resolve();
		const first = { board: "a", generation, promise: firstPromise };
		generation += 2;
		const secondPromise = Promise.resolve();
		const second = { board: "a", generation, promise: secondPromise };

		expect(ownsHoldAttempt(second, first, firstPromise, generation)).toBe(false);
		expect(ownsHoldAttempt(second, second, secondPromise, generation)).toBe(true);
	});

	test("the first content edit takes a hold and settlement checks release", () => {
		const harness = new ReportingHarness();
		const holdsBefore = harness.holdRequests;
		const releasesBefore = harness.releaseChecks;
		harness.edit("a", { x: 10 });
		expect(harness.holdRequests).toBe(holdsBefore + 1);
		harness.due();
		harness.accept();
		expect(harness.releaseChecks).toBeGreaterThan(releasesBefore);
		expect(reportsSettled(harness.state)).toBe(true);
	});
});

describe("refusal and retry", () => {
	test("a refused delta retries immediately as a full report with every live element", () => {
		const harness = new ReportingHarness();
		harness.edit("a", { x: 25 });
		harness.due();
		expect(harness.pendingIsReachable()).toBe(true);
		harness.refuse();
		expect(harness.pendingIsReachable()).toBe(true);
		expect(needsFullReport(harness.state)).toBe(true);
		harness.clock.advance(0);
		expect(harness.pendingIsReachable()).toBe(true);

		const retry = harness.server.requests[0];
		expect(retry?.fullReport).toBe(true);
		expect(retry?.report.upserts).toHaveLength(harness.scene.length);
	});

	test("a failed request waits exactly 2,000 ms and retries the same delta", () => {
		expect(REPORT_RETRY_MS).toBe(2_000);
		const harness = new ReportingHarness();
		harness.edit("a", { x: 25 });
		harness.due();
		const first = harness.server.requests.shift()!;
		harness.dispatch({ type: "report_failed", generation: first.generation });
		expect(harness.state.retryTimerScheduled).toBe(true);
		harness.clock.advance(1_999);
		expect(harness.server.requests).toHaveLength(0);
		harness.clock.advance(1);
		expect(harness.server.requests[0]?.fullReport).toBe(false);
		expect(harness.server.requests[0]?.report.upserts).toContainEqual(
			expect.objectContaining({ id: "a", x: 25 }),
		);
	});
});

describe("board adoption", () => {
	test("adopting another board cancels the old generation's scheduled report", () => {
		const harness = new ReportingHarness();
		harness.edit("a", { x: 9 });
		expect(harness.pendingIsReachable()).toBe(true);
		harness.dispatch({ type: "board_adopted" });
		const next = [box("c", 400)];
		harness.scene = copy(next);
		harness.server = new ScriptedServer(next);
		harness.dispatch({
			type: "server_update_requested",
			update: { elements: next, captureUpdate: "never" },
			baselineUpdate: { type: "replace", withheldIds: [] },
		});
		harness.clock.advance(20_000);
		expect(harness.pendingIsReachable()).toBe(true);
		expect(harness.server.requests).toHaveLength(0);
	});
});
