import { describe, expect, test } from "bun:test";

import { pause } from "#shared/constants/timing.ts";
import { fakeClock } from "#tests/shared/waits/fake-clock.ts";

describe("pause", () => {
	test("sleeps one cadence", async () => {
		const clock = fakeClock(0);
		const paused = pause("codexSession.workTreeStopPoll", { clock });
		await clock.runAll();
		expect(await paused).toBe("elapsed");
		expect(clock.sleeps).toEqual([250]);
	});

	test("never sleeps past a moment", async () => {
		const clock = fakeClock(0);
		const paused = pause("modelLock.poll", { clock, untilMs: 30 });
		await clock.runAll();
		expect(await paused).toBe("elapsed");
		expect(clock.sleeps).toEqual([30]);
	});

	test("a cadence with a floor still sleeps it at or past the moment", async () => {
		const clock = fakeClock(100);
		const paused = pause("modelLock.poll", { clock, untilMs: 90 });
		await clock.runAll();
		expect(await paused).toBe("elapsed");
		expect(clock.sleeps).toEqual([1]);
	});

	test("a cadence without a floor does not sleep at or past the moment", async () => {
		const clock = fakeClock(100);
		expect(await pause("processGroup.poll", { clock, untilMs: 100 })).toBe("elapsed");
		expect(clock.sleeps).toEqual([]);
	});

	test("a signal ends it before or during the sleep", async () => {
		const clock = fakeClock(0);
		expect(await pause("recorder.poll", { clock, signal: AbortSignal.abort() })).toBe("aborted");
		expect(clock.sleeps).toEqual([]);
		const controller = new AbortController();
		const paused = pause("recorder.poll", { clock, signal: controller.signal });
		await clock.advance(100);
		controller.abort();
		expect(await paused).toBe("aborted");
		expect(clock.now()).toBe(100);
	});
});
