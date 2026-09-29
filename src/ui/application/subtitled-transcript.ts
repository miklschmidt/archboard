// What a pane's subtitles show of the voice (TASK-292, TASK-304, TASK-306).
//
// The transcript is server truth the transport publishes, a word at a time as the voice speaks.
// Subtitles show it only while a session carries audio. A recording's words are subtitled only on
// the page that records it. That page is a tab session of its own (TASK-373), so no other page is
// shown its voice.

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
 * @param recording Whether this page is a recording.
 * @returns Its transcript, or nothing while no session this pane may subtitle carries audio.
 */
function subtitledTranscript(
	voice: SubtitledVoice | null,
	recording: boolean,
): readonly SubtitleSource[] {
	if (voice === null) {
		return NOTHING_SAID;
	}
	const audible = voice.state === "active" || voice.state === "recovering";
	return audible && (voice.recording === true) === recording ? voice.transcript : NOTHING_SAID;
}

export { subtitledTranscript };
