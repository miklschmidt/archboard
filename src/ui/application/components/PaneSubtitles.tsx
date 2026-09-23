// Subtitles of the voice, over the pane the voice was started for (TASK-292).
//
// The transcript is server truth the transport publishes, a word at a time as
// the voice speaks. Subtitles read it only while a session carries audio.

import { useSyncExternalStore, type JSX } from "react";

import { VoiceSubtitles, useSubtitlesWanted, type SubtitleSource } from "@/ui/voice-subtitles";
import type { BrowserWorkbenchState, BrowserWorkbenchTransport } from "@/ui/workbench-transport";

/** Inputs for a pane's subtitles. */
interface PaneSubtitlesProps {
	/** The transport of the pane voice runs for. */
	readonly transport: BrowserWorkbenchTransport;
	/** Whether the person asked for reduced motion. */
	readonly reducedMotion: boolean;
}

/** No transcript: the transport has no snapshot, or voice carries no audio. */
const NOTHING_SAID: readonly SubtitleSource[] = Object.freeze([]);

/**
 * The transcript of a session that is carrying audio right now.
 * @param state What the transport last published.
 * @returns The transcript, or an empty one while nothing can be heard.
 */
function liveTranscript(state: BrowserWorkbenchState): readonly SubtitleSource[] {
	if (state.snapshot === null) {
		return NOTHING_SAID;
	}
	const { voice } = state.snapshot;
	return voice.state === "active" || voice.state === "recovering" ? voice.transcript : NOTHING_SAID;
}

/**
 * The subtitles of the voice running for one pane.
 * @param props The pane's transport and the motion preference.
 * @returns The subtitle on screen, or null.
 */
function PaneSubtitles(props: PaneSubtitlesProps): JSX.Element {
	const { transport } = props;
	const state = useSyncExternalStore(transport.subscribe, transport.state, transport.state);
	const wanted = useSubtitlesWanted();
	return (
		<VoiceSubtitles
			transcript={liveTranscript(state)}
			enabled={wanted}
			reducedMotion={props.reducedMotion}
		/>
	);
}

export { PaneSubtitles, type PaneSubtitlesProps };
