import { describe, expect, test } from "bun:test";

import { waitUntil } from "#shared/constants/timing.ts";
import { fakeClock } from "#tests/shared/waits/fake-clock.ts";

/**
 * A probe that finds nothing, counting its looks and when each happened.
 * @param now The clock's time now.
 * @returns The probe and its looks.
 */
function nothing(now: () => number): { probe: () => undefined; looks: number[] } {
	const looks: number[] = [];
	return {
		looks,
		probe: () => {
			looks.push(now());
			return undefined;
		},
	};
}

describe("waitUntil", () => {
	test("answers with the first value a probe finds, null included", async () => {
		const clock = fakeClock();
		const answers = [undefined, undefined, null];
		const outcome = waitUntil("serverLifecycle.stopConfirm", () => answers.shift(), { clock });
		await clock.runAll();
		expect(await outcome).toEqual({ ok: true, value: null });
		expect(clock.sleeps).toEqual([200, 200]);
	});

	test("refuses once its bound passes and says the bound in seconds", async () => {
		const clock = fakeClock(0);
		const { probe, looks } = nothing(clock.now);
		const outcome = waitUntil("serverLifecycle.stopConfirm", probe, { clock });
		await clock.runAll();
		expect(await outcome).toEqual({ ok: false, reason: "bound", boundSeconds: 5 });
		expect(looks.at(-1)).toBe(4800);
	});

	test("a check before the look skips a look at the bound's moment", async () => {
		const clock = fakeClock(0);
		const { probe, looks } = nothing(clock.now);
		const outcome = waitUntil("serverLifecycle.stopConfirm", probe, { clock, boundMs: 400 });
		await clock.runAll();
		expect((await outcome).ok).toBe(false);
		expect(looks).toEqual([0, 200]);
	});

	test("a check after the look counts a look at the bound's moment, then refuses", async () => {
		const clock = fakeClock(0);
		const { probe, looks } = nothing(clock.now);
		const outcome = waitUntil("serverLifecycle.stopPidfileWait", probe, { clock });
		await clock.runAll();
		expect((await outcome).ok).toBe(false);
		expect(looks).toEqual([0, 50, 100, 150, 200, 250, 300, 350, 400, 450, 500]);
	});

	test("a strict wait looks once more at the bound's moment and refuses only past it", async () => {
		const clock = fakeClock(0);
		const { probe, looks } = nothing(clock.now);
		const outcome = waitUntil("raster.chromium", probe, { clock, boundMs: 20 });
		await clock.runAll();
		expect((await outcome).ok).toBe(false);
		expect(looks).toEqual([0, 10, 20, 30]);
	});

	test("a wait that sleeps first gives a beat before each look, and looks once past the bound", async () => {
		const clock = fakeClock(0);
		const { probe, looks } = nothing(clock.now);
		const outcome = waitUntil("pane.browserConnect", probe, { clock, boundMs: 600 });
		await clock.runAll();
		expect(await outcome).toEqual({ ok: false, reason: "bound", boundSeconds: 0.6 });
		expect(looks).toEqual([250, 500, 750]);
	});

	test("a caller's bound replaces the named one, and the last sleep is cut to it", async () => {
		const clock = fakeClock(0);
		const { probe, looks } = nothing(clock.now);
		const outcome = waitUntil("codexSession.waitTargets", probe, { clock, boundMs: 600 });
		await clock.runAll();
		expect(await outcome).toEqual({ ok: false, reason: "bound", boundSeconds: 0.6 });
		expect(looks).toEqual([0, 250, 500]);
		expect(clock.sleeps).toEqual([250, 250, 100]);
	});

	test("a first look that is free runs even with no time at all", async () => {
		const clock = fakeClock(0);
		const { probe, looks } = nothing(clock.now);
		expect((await waitUntil("codexSession.waitTargets", probe, { clock, boundMs: 0 })).ok).toBe(
			false,
		);
		expect(looks).toEqual([0]);
		expect(clock.sleeps).toEqual([]);
	});

	test("an outer cap ends the wait before its bound", async () => {
		const clock = fakeClock(0);
		const { probe, looks } = nothing(clock.now);
		const outcome = waitUntil("processGroup.killDrain", probe, { clock, capAtMs: 25 });
		await clock.runAll();
		expect(await outcome).toEqual({ ok: false, reason: "bound", boundSeconds: 0.025 });
		expect(looks).toEqual([0, 10, 20]);
		expect(clock.sleeps).toEqual([10, 10, 5]);
	});

	test("a cut sleep after a look that overshot the bound is skipped, or cut to nothing", async () => {
		const skipping = fakeClock(0);
		const skips = waitUntil(
			"codexSession.waitTargets",
			() => {
				skipping.spend(700);
				return undefined;
			},
			{ clock: skipping, boundMs: 600 },
		);
		expect((await skips).ok).toBe(false);
		expect(skipping.sleeps).toEqual([]);

		const cutting = fakeClock(0);
		let looks = 0;
		const cuts = waitUntil(
			"skillEval.groupSettle",
			() => {
				looks += 1;
				cutting.spend(looks === 1 ? 15 : 0);
				return undefined;
			},
			{ clock: cutting, boundMs: 20 },
		);
		await cutting.runAll();
		expect((await cuts).ok).toBe(false);
		expect(cutting.sleeps).toEqual([5]);
	});

	test("a full sleep is never cut, so the look after it may land past the bound", async () => {
		const clock = fakeClock(0);
		const { probe, looks } = nothing(clock.now);
		const outcome = waitUntil("git.groupCleanup", probe, { clock, boundMs: 15 });
		await clock.runAll();
		expect((await outcome).ok).toBe(false);
		expect(looks).toEqual([0, 10, 20]);
	});

	test("an aborted signal refuses before the first look", async () => {
		const clock = fakeClock(0);
		const { probe, looks } = nothing(clock.now);
		const outcome = await waitUntil("recorder.pageReady", probe, {
			clock,
			signal: AbortSignal.abort(),
		});
		expect(outcome).toEqual({ ok: false, reason: "aborted", boundSeconds: 30 });
		expect(looks).toEqual([]);
	});

	test("a signal wakes the sleep and ends the wait at once", async () => {
		const clock = fakeClock(0);
		const { probe, looks } = nothing(clock.now);
		const controller = new AbortController();
		const outcome = waitUntil("recorder.pageReady", probe, { clock, signal: controller.signal });
		await clock.advance(100);
		controller.abort();
		expect((await outcome).ok).toBe(false);
		expect(looks).toEqual([0]);
		expect(clock.now()).toBe(100);
	});

	test("cancellation wins over a bound that passed too", async () => {
		const clock = fakeClock(0);
		const controller = new AbortController();
		const outcome = waitUntil(
			"serverLifecycle.stopConfirm",
			() => {
				clock.spend(10_000);
				controller.abort();
				return undefined;
			},
			{ clock, signal: controller.signal },
		);
		await clock.runAll();
		expect(await outcome).toMatchObject({ ok: false, reason: "aborted" });
	});

	test("an error a probe throws ends the wait and reaches the caller", async () => {
		const clock = fakeClock(0);
		let looks = 0;
		const outcome = waitUntil(
			"recorder.pageReady",
			async () => {
				looks += 1;
				if (looks === 2) throw new Error("the page went away");
				return undefined;
			},
			{ clock },
		);
		await clock.runAll();
		await expect(outcome).rejects.toThrow("the page went away");
		expect(looks).toBe(2);
	});

	test("a look one turn of the event loop apart sleeps nothing", async () => {
		const clock = fakeClock(0);
		const answers = [undefined, undefined, true];
		const outcome = waitUntil("recording.tapDrain", () => answers.shift(), { clock });
		await clock.runAll();
		expect(await outcome).toEqual({ ok: true, value: true });
		expect(clock.sleeps).toEqual([0, 0]);
	});
});
