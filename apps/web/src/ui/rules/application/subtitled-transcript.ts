// What a pane's subtitles show of the voice (TASK-292, TASK-304, TASK-306).
//
// The transcript is server truth the transport publishes, a word at a time as the voice speaks.
// Subtitles show it only while a session carries audio. A recording's words are subtitled only on
// the page that records it. That page is a tab session of its own (TASK-373), so no other page is
// shown its voice.

import type { BrowserSnapshot } from "@archboard/agent-workbench/contract";
import type { SubtitleSource } from "@archboard/workbench/voice";
import type { BrowserWorkbenchTransport } from "@archboard/agent-workbench/browser";

/** What of the voice the subtitles read: whether it carries audio, whose it is, and what it said. */
type SubtitledVoice = Pick<BrowserSnapshot["voice"], "state" | "recording"> & {
	readonly transcript: readonly SubtitleSource[];
};

/** Where a pane hears the voice: what it last published, and when that changes. */
interface VoiceFeed {
	readonly subscribe: (listener: () => void) => () => void;
	/** The voice as last published, or null without a snapshot. The same value until it changes. */
	readonly voice: () => SubtitledVoice | null;
}

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

/**
 * The voice as a pane hears it over its transport.
 * @param transport The pane's transport.
 * @returns The feed.
 */
function heardOver(transport: Pick<BrowserWorkbenchTransport, "subscribe" | "state">): VoiceFeed {
	return {
		subscribe: transport.subscribe,
		/**
		 * The voice as the transport last published it.
		 * @returns The voice, or null without a snapshot.
		 */
		voice: () => transport.state().snapshot?.voice ?? null,
	};
}

export { heardOver, subtitledTranscript, type SubtitledVoice, type VoiceFeed };
