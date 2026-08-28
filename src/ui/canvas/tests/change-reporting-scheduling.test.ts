/// <reference types="bun" />

import { describe, expect, test } from "bun:test";

import { REPORT_IDLE_SETTLE_MS, REPORT_PROGRESS_MS } from "../../../shared/timing/timing.ts";
import { hasPendingEdits } from "../change-reporting.ts";
import { ReportingHarness, copy } from "./support/change-reporting-harness.ts";

describe("report timing", () => {
	test("the progress and idle contracts remain 400 ms and 800 ms", () => {
		expect(REPORT_PROGRESS_MS).toBe(400);
		expect(REPORT_IDLE_SETTLE_MS).toBe(800);
	});

	test("continuous edits use the fixed progress deadline and a lone final edit uses idle", () => {
		const harness = new ReportingHarness();
		harness.edit("a", { x: 10 });
		harness.clock.advance(200);
		harness.edit("a", { x: 20 });
		harness.clock.advance(200);
		expect(harness.server.requests[0]?.report.upserts).toContainEqual(
			expect.objectContaining({ id: "a", x: 20 }),
		);
		harness.accept();

		harness.clock.advance(100);
		harness.edit("a", { x: 30 });
		harness.clock.advance(400);
		expect(harness.server.requests).toHaveLength(0);
		expect(hasPendingEdits(harness.state, harness.scene)).toBe(true);
		harness.clock.advance(399);
		expect(harness.server.requests).toHaveLength(0);
		harness.clock.advance(1);
		expect(harness.server.requests[0]?.report.upserts).toContainEqual(
			expect.objectContaining({ id: "a", x: 30 }),
		);
		harness.accept();
		harness.clock.advance(2_000);
		expect(harness.server.requests).toHaveLength(0);
	});

	test("one in-flight request admits one queued latest delivery without fan-out", () => {
		const harness = new ReportingHarness();
		harness.edit("a", { x: 10 });
		harness.clock.advance(200);
		harness.edit("a", { x: 20 });
		harness.clock.advance(200);
		expect(harness.server.requests).toHaveLength(1);
		expect(harness.server.requests[0]?.report.upserts).toContainEqual(
			expect.objectContaining({ id: "a", x: 20 }),
		);

		harness.clock.advance(100);
		harness.edit("a", { x: 30 });
		harness.clock.advance(200);
		harness.edit("a", { x: 40 });
		harness.clock.advance(200);
		expect(harness.server.requests).toHaveLength(1);
		expect(harness.state.deliveryQueued).toBe(true);
		harness.accept();
		expect(harness.server.requests).toHaveLength(1);
		expect(harness.server.requests[0]?.report.upserts).toContainEqual(
			expect.objectContaining({ id: "a", x: 40 }),
		);
		harness.accept();
		harness.clock.advance(2_000);
		expect(harness.server.requests).toHaveLength(0);
	});

	test("500 ms edit cadence carries elapsed progress forward and finishes at idle", () => {
		const harness = new ReportingHarness();
		harness.edit("a", { x: 10 });
		harness.clock.advance(500);
		expect(harness.server.requests).toHaveLength(0);

		harness.edit("a", { x: 20 });
		harness.clock.advance(0);
		expect(harness.server.requests[0]?.report.upserts).toContainEqual(
			expect.objectContaining({ id: "a", x: 20 }),
		);
		harness.clock.advance(500);
		harness.edit("a", { x: 30 });
		harness.clock.advance(500);
		harness.edit("a", { x: 40 });
		harness.clock.advance(0);
		expect(harness.server.requests).toHaveLength(1);
		expect(harness.state.deliveryQueued).toBe(true);
		harness.accept();
		expect(harness.server.requests[0]?.report.upserts).toContainEqual(
			expect.objectContaining({ id: "a", x: 40 }),
		);
		harness.accept();

		harness.clock.advance(500);
		harness.edit("a", { x: 50 });
		harness.clock.advance(400);
		expect(harness.server.requests).toHaveLength(0);
		harness.clock.advance(399);
		expect(hasPendingEdits(harness.state, harness.scene)).toBe(true);
		harness.clock.advance(1);
		expect(harness.server.requests[0]?.report.upserts).toContainEqual(
			expect.objectContaining({ id: "a", x: 50 }),
		);
		harness.accept();
		harness.clock.advance(2_000);
		expect(harness.server.requests).toHaveLength(0);
	});
});

describe("delivery around server scene application", () => {
	test("a due delivery waits during application and drains after the final completion", () => {
		const harness = new ReportingHarness();
		harness.edit("a", { x: 10 });
		harness.applyServerElements([
			{ ...harness.server.document.find((element) => element.id === "b")!, y: 30 },
		]);
		harness.clock.cancel("progress");
		harness.clock.cancel("idle");
		harness.dispatch({
			type: "progress_timer_fired",
			generation: harness.state.generation,
			scene: copy(harness.scene),
			withheldIds: [],
		});
		harness.dispatch({
			type: "idle_timer_fired",
			generation: harness.state.generation,
			scene: copy(harness.scene),
			withheldIds: [],
		});
		expect(harness.state).toMatchObject({
			applyingServerUpdateCount: 1,
			deliveryQueued: true,
			progressTimerScheduled: false,
			idleTimerScheduled: false,
		});
		expect(harness.server.requests).toHaveLength(0);
		harness.clock.advance(0);
		expect(harness.server.requests[0]?.report.upserts).toContainEqual(
			expect.objectContaining({ id: "a" }),
		);
	});

	test("a user edit during server application schedules once completion runs", () => {
		const harness = new ReportingHarness();
		harness.applyServerElements([
			{ ...harness.scene.find((element) => element.id === "b")!, y: 30 },
		]);
		harness.scene = harness.scene.map((element) =>
			element.id === "a" ? { ...element, x: 15, version: 2 } : element,
		);
		harness.dispatch({ type: "scene_changed", scene: copy(harness.scene) });
		harness.clock.advance(0);
		expect(harness.state.localEditCount).toBe(1);
		harness.due();
		expect(harness.server.requests[0]?.report.upserts).toContainEqual(
			expect.objectContaining({ id: "a", x: 15 }),
		);
	});
});

describe("empty deadlines", () => {
	test("a correction followed by an empty idle deadline checks settled release", () => {
		const harness = new ReportingHarness();
		harness.edit("a", { x: 10 });
		harness.clock.advance(200);
		harness.edit("a", { x: 20 });
		harness.clock.advance(200);
		harness.accept({
			upserts: [{ ...harness.server.document.find((element) => element.id === "a")!, x: 21 }],
			deletes: [],
		});
		const before = harness.settledReleaseChecks;
		harness.clock.advance(600);
		expect(harness.settledReleaseChecks).toBe(before + 1);
	});

	test("an edit undone before delivery releases without a no-op report", () => {
		const harness = new ReportingHarness();
		harness.edit("a", { x: 10 });
		harness.edit("a", { x: 0 });
		const before = harness.settledReleaseChecks;
		harness.clock.advance(800);
		expect(harness.server.requests).toHaveLength(0);
		expect(harness.settledReleaseChecks).toBe(before + 1);
	});
});
