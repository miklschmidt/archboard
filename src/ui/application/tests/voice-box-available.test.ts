// Where the voice box may carry the voice: over a pane in the workspace that has a voice owner.
// Where it may not, the voice is in the agent dock (a pane that cannot carry it), in the presentation
// bar (a presented pane) or nowhere on screen but as plain subtitles (a recording).

import { expect, test } from "bun:test";

import { voiceBoxAvailable } from "@/ui/application/voice-box-available";

/** The workspace with a pane that has a voice owner: the one place the box may carry the voice. */
const WORKSPACE = { owned: true, presentedPane: null, recording: false, demonstrating: false };

test("the box may carry the voice over a pane in the workspace that has a voice owner", () => {
	expect(voiceBoxAvailable(WORKSPACE)).toBe(true);
});

test("it may not while a pane is presented, on a recording page, or with no voice owner", () => {
	expect(voiceBoxAvailable({ ...WORKSPACE, presentedPane: "pane-1" })).toBe(false);
	expect(voiceBoxAvailable({ ...WORKSPACE, recording: true })).toBe(false);
	expect(voiceBoxAvailable({ ...WORKSPACE, owned: false })).toBe(false);
});

test("a page that demonstrates the voice has a box with no owner, but never in a presentation or a recording", () => {
	const demonstrated = { ...WORKSPACE, owned: false, demonstrating: true };
	expect(voiceBoxAvailable(demonstrated)).toBe(true);
	expect(voiceBoxAvailable({ ...demonstrated, presentedPane: "pane-1" })).toBe(false);
	expect(voiceBoxAvailable({ ...demonstrated, recording: true })).toBe(false);
});
