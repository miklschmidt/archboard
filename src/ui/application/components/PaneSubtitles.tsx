// Subtitles of the voice, over the pane the voice was started for (TASK-292).
//
// What the subtitles show is decided in `subtitled-transcript`. A recording is always subtitled:
// nobody watching the video can turn them on (TASK-306).

import { useSyncExternalStore, type JSX } from "react";

import { subtitledTranscript } from "@/ui/application/subtitled-transcript";
import { VoiceSubtitles, useSubtitlesWanted } from "@/ui/voice-subtitles";
import type { BrowserWorkbenchTransport } from "@/ui/workbench-transport";

/** Inputs for a pane's subtitles. */
interface PaneSubtitlesProps {
	/** The transport of the pane voice runs for. */
	readonly transport: BrowserWorkbenchTransport;
	/** Whether the person asked for reduced motion. */
	readonly reducedMotion: boolean;
	/** Whether this page is a recording. */
	readonly recording: boolean;
}

/**
 * The subtitles of the voice running for one pane.
 * @param props The pane's transport, the motion preference and whether the page is a recording.
 * @returns The subtitle on screen, or null.
 */
function PaneSubtitles(props: PaneSubtitlesProps): JSX.Element {
	const { transport } = props;
	const state = useSyncExternalStore(transport.subscribe, transport.state, transport.state);
	const wanted = useSubtitlesWanted();
	return (
		<VoiceSubtitles
			transcript={subtitledTranscript(state.snapshot?.voice ?? null, props.recording)}
			enabled={wanted || props.recording}
			reducedMotion={props.reducedMotion}
		/>
	);
}

export { PaneSubtitles, type PaneSubtitlesProps };
