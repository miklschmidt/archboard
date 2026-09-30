import { expect, test } from "bun:test";

import { recordingFlags } from "@/runtime/walkthrough-recorder/index";

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
