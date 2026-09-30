import { expect, test } from "bun:test";

import { renderFlags } from "@/runtime/walkthrough-recorder/index";

// The render draws every frame of a recorded talk in software, so a frame depends on nothing but
// the talk, and captures nothing of the tab or the machine: no GPU, no tab capture, no
// microphone, no autoplay (TASK-381).

test("the render's browser draws in software and has no capture, microphone or autoplay flags", () => {
	const flags = renderFlags();
	expect(flags).toContain("--disable-gpu");
	// Without it two renders of one talk differ in a few frames, by what was re-rastered.
	expect(flags).toContain("--disable-partial-raster");
	expect(flags.some((flag) => flag.startsWith("--enable-gpu"))).toBe(false);
	expect(flags.some((flag) => /capture|fake|autoplay/.test(flag))).toBe(false);
});
