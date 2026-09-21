// The clock over a narrated walkthrough: what one step's silence is measured from and to.

import { expect, test } from "bun:test";
import { createNarrationTiming } from "@/server/canvas/index";

test("a step is measured from the end of the explanation before it to the voice starting on it, counting fillers rather than mistaking them for the explanation", () => {
	let now = 0;
	const clock = createNarrationTiming(() => now);
	// Step 1: nothing came before it, so there is no gap to measure.
	now = 1_000;
	clock.stepArrived(1);
	now = 1_400;
	clock.voiceStarted();
	now = 9_000;
	clock.voiceFinished();
	// The voice says "one moment" while the coordinator works.
	now = 9_200;
	clock.voiceStarted();
	now = 9_900;
	clock.voiceFinished();
	now = 11_500;
	clock.stepArrived(2);
	now = 12_300;
	clock.voiceStarted();
	expect(clock.measurements()).toEqual([
		{
			step: 1,
			endToNextStartMs: null,
			endToArrivedMs: null,
			arrivedToStartMs: 400,
			utterancesBetween: 0,
		},
		{
			step: 2,
			endToNextStartMs: 3_300,
			endToArrivedMs: 2_500,
			arrivedToStartMs: 800,
			utterancesBetween: 1,
		},
	]);
	clock.reset();
	expect(clock.measurements()).toEqual([]);
});
