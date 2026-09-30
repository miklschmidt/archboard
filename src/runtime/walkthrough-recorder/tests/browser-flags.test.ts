import { expect, test } from "bun:test";

import { recordingFlags, renderFlags } from "@/runtime/walkthrough-recorder/index";

// Headless Chromium composites in software unless it is asked for the GPU, and a software
// compositor cannot keep a glide under a cross-fade at 30 frames a second (TASK-378). GPU
// rasterization held the capture whenever a step drew new content, so the recording asks for
// GPU compositing and software rasterization. A machine without a usable GPU needs no flag of
// its own: Chromium falls back to software compositing by itself.

test("the recording's browser composites on the GPU and rasterizes in software", () => {
	const flags = recordingFlags("/tmp/silence.wav");
	expect(flags).toContain("--enable-gpu");
	expect(flags).toContain("--disable-gpu-rasterization");
	expect(flags).not.toContain("--disable-gpu");
});

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
