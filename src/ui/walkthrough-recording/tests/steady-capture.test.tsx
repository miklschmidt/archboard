// A recording's picture keeps moving (TASK-378).
//
// Chromium's tab capture holds the picture for a quarter of a second after a steady animation
// stops, unless the whole frame repaints every frame; and a frame rate asked of the capture caps
// the track, which then drops a frame now and then. What is guarded is what keeps both away: the
// stage lays the layer that repaints its whole frame, out of sight and out of reach, and the
// capture asks for this tab at the page's own size and names no frame rate.

import { expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { RecordingStage, tabCaptureOptions } from "@/ui/walkthrough-recording";

test("the recording stage lays a hidden layer that repaints its whole frame", () => {
	const markup = renderToStaticMarkup(createElement(RecordingStage, null, "pane"));
	const pacer = /<div[^>]*data-slot="recording-frame-pacer"[^>]*>/.exec(markup)?.[0] ?? "";
	expect(pacer).toContain('class="recording-frame-pacer"');
	expect(pacer).toContain('aria-hidden="true"');
});

test("the tab is captured at the page's size in device pixels, at no asked frame rate", () => {
	const options = tabCaptureOptions(1920, 1080, 1.5);
	expect(options.video).toEqual({ width: { ideal: 2880 }, height: { ideal: 1620 } });
	expect(options).toMatchObject({ audio: false, preferCurrentTab: true });
});
