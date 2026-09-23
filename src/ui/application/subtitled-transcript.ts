// What a pane's subtitles show of the voice (TASK-292, TASK-304).
//
// The transcript is server truth the transport publishes, a word at a time as the voice speaks.
// Subtitles show it only while a session carries audio, and never a recording's: its voice
// narrates a board in a page nobody here is looking at, and the canvas shares one voice session
// between its browsers, so its words over this pane's picture would be about something else.

import type { BrowserSnapshot } from "@/shared/codex-browser-model";
import type { SubtitleSource } from "@/ui/voice-subtitles";

/** What of the voice the subtitles read: whether it carries audio, whose it is, and what it said. */
type SubtitledVoice = Pick<BrowserSnapshot["voice"], "state" | "recording"> & {
	readonly transcript: readonly SubtitleSource[];
};

/** Nothing to subtitle. */
const NOTHING_SAID: readonly SubtitleSource[] = Object.freeze([]);

/**
 * The transcript a pane subtitles.
 * @param voice The voice as the transport last published it, or null without a snapshot.
 * @returns Its transcript, or nothing while no session this pane may subtitle carries audio.
 */
function subtitledTranscript(voice: SubtitledVoice | null): readonly SubtitleSource[] {
	if (voice === null) {
		return NOTHING_SAID;
	}
	const audible = voice.state === "active" || voice.state === "recovering";
	return audible && voice.recording !== true ? voice.transcript : NOTHING_SAID;
}

export { subtitledTranscript };
