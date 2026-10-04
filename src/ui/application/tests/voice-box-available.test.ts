// Where the voice box may carry the voice: over a pane that has a voice owner, in the workspace and in a
// presentation. Where it may not, the voice is in the agent dock (a pane that cannot carry it) or nowhere
// on screen but as plain subtitles (a recording).

import { expect, test } from "bun:test";

import { voiceBoxAvailable } from "@/ui/application/voice-box-available";

/** A pane that has a voice owner, on a page that is not a recording: the place the box may carry the voice. */
const PANE = { owned: true, recording: false, demonstrating: false };

test("the box may carry the voice over a pane that has a voice owner", () => {
	expect(voiceBoxAvailable(PANE)).toBe(true);
});

test("it may not on a recording page, or with no voice owner", () => {
	expect(voiceBoxAvailable({ ...PANE, recording: true })).toBe(false);
	expect(voiceBoxAvailable({ ...PANE, owned: false })).toBe(false);
});

test("a page that demonstrates the voice has a box with no owner, but never on a recording", () => {
	const demonstrated = { ...PANE, owned: false, demonstrating: true };
	expect(voiceBoxAvailable(demonstrated)).toBe(true);
	expect(voiceBoxAvailable({ ...demonstrated, recording: true })).toBe(false);
});
