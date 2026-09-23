// What a pane subtitles of the voice, as the canvas's browsers see it.
//
// What is guarded: the voice's words are subtitled while a session carries audio, and a
// recording's never are (TASK-304). A recording narrates a board in a page nobody here is
// looking at, and the canvas shares one voice session between its browsers.

import { expect, test } from "bun:test";

import { subtitledTranscript } from "@/ui/application/subtitled-transcript";

/**
 * A live voice that has said one line.
 * @param recording Whether the live session is a recording's.
 * @returns The voice.
 */
function saying(recording: boolean): Parameters<typeof subtitledTranscript>[0] {
	const line = {
		itemId: "a1",
		speaker: "assistant",
		text: "The front door",
		final: false,
	} as const;
	return { state: "active", recording, transcript: [line] };
}

test("the voice's words are subtitled, and a recording's are not", () => {
	expect(subtitledTranscript(saying(false))).toHaveLength(1);
	expect(subtitledTranscript(saying(true))).toHaveLength(0);
});
