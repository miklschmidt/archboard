// What a pane subtitles of the voice, as the server's browsers see it.
//
// What is guarded: the voice's words are subtitled while a session carries audio, and a
// recording's only on the page that records it (TASK-304, TASK-306): the server shares one voice
// session between its browsers, and a recording narrates a board nobody elsewhere is looking at.

import { expect, test } from "bun:test";

import { subtitledTranscript } from "#ui/rules/application/subtitled-transcript.ts";

/**
 * A live voice that has said one line.
 * @param recording Whether the live session is a recording's, which nobody listens to live.
 * @returns The voice.
 */
function saying(recording: boolean): Parameters<typeof subtitledTranscript>[0] {
	const line = {
		itemId: "a1",
		speaker: "assistant",
		text: "The front door",
		final: false,
	} as const;
	return { state: "active", unattended: recording, transcript: [line] };
}

test("the voice's words are subtitled, and a recording's only on the page that records it", () => {
	expect(subtitledTranscript(saying(false), false)).toHaveLength(1);
	expect(subtitledTranscript(saying(true), false)).toHaveLength(0);
	expect(subtitledTranscript(saying(true), true)).toHaveLength(1);
	expect(subtitledTranscript(saying(false), true)).toHaveLength(0);
});
