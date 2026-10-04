// Subtitles of the voice, over the pane the voice was started for (TASK-292), and the
// voice itself with them while the person wants subtitles (TASK-391).
//
// What the subtitles show is decided in `subtitled-transcript`. A recording is always subtitled:
// nobody watching the video can turn them on (TASK-306). A pane that is presented has its voice
// controls in the presentation bar, and a recording has no dock, so both keep plain subtitles.
// Otherwise the subtitles are the words in the voice box, which carries the voice's orb and its
// controls too, and leaves the dock when subtitles are off.

import { useSyncExternalStore, type JSX } from "react";

import { subtitledTranscript } from "@/ui/application/subtitled-transcript";
import { VoiceSubtitles, useSubtitlesWanted, useVoiceBoxed } from "@/ui/voice-subtitles";
import type { SubtitleSource } from "@/ui/voice-subtitles";
import type { BrowserWorkbenchTransport } from "@/ui/workbench-transport";
import { VoiceBox, useVoiceSurface } from "@/ui/workbench";
import { useDemoTranscript } from "@/ui/workbench/demo";

/** Inputs for a pane's subtitles. */
interface PaneSubtitlesProps {
	/** The transport of the pane voice runs for, or null where the page demonstrates the voice (`?voiceDemo`). */
	readonly transport: BrowserWorkbenchTransport | null;
	/** Whether the person asked for reduced motion. */
	readonly reducedMotion: boolean;
	/** Whether this page is a recording. */
	readonly recording: boolean;
	/** Whether the voice box may carry the voice over this pane: it has a voice owner and nothing is presented. */
	readonly captionable: boolean;
}

/** What the subtitles are drawn from. */
interface SubtitledProps {
	readonly transcript: readonly SubtitleSource[];
	readonly reducedMotion: boolean;
	readonly recording: boolean;
	readonly captionable: boolean;
}

/**
 * The subtitles of the voice running for one pane.
 * @param props The pane's transport, the motion preference and whether the page is a recording.
 * @returns The subtitle on screen, or the voice box, or null.
 */
function PaneSubtitles(props: PaneSubtitlesProps): JSX.Element {
	const { transport, ...rest } = props;
	return transport === null ? (
		<DemoSubtitles {...rest} />
	) : (
		<HeardSubtitles {...rest} transport={transport} />
	);
}

/**
 * The subtitles of a voice heard over the pane's transport.
 * @param props The pane's transport, the motion preference and where the voice may sit.
 * @param props.transport The transport.
 * @returns The subtitles.
 */
function HeardSubtitles(
	props: Omit<PaneSubtitlesProps, "transport"> & { readonly transport: BrowserWorkbenchTransport },
): JSX.Element {
	const { transport, ...rest } = props;
	const state = useSyncExternalStore(transport.subscribe, transport.state, transport.state);
	return (
		<Subtitled
			{...rest}
			transcript={subtitledTranscript(state.snapshot?.voice ?? null, props.recording)}
		/>
	);
}

/**
 * The subtitles of the demonstration's voice.
 * @param props The motion preference and where the voice may sit.
 * @returns The subtitles.
 */
function DemoSubtitles(props: Omit<PaneSubtitlesProps, "transport">): JSX.Element {
	return <Subtitled {...props} transcript={useDemoTranscript()} />;
}

/**
 * The words and, where the voice may sit in the box, the box that holds them.
 * @param props What was said, the motion preference and whether the voice may sit in the box.
 * @returns The voice box, or the subtitles alone.
 */
function Subtitled(props: SubtitledProps): JSX.Element {
	const wanted = useSubtitlesWanted();
	const surface = useVoiceSurface();
	const boxable = props.captionable && surface !== null;
	const boxed = useVoiceBoxed(surface !== null && surface.voice.stage !== "idle", boxable);
	if (boxable) {
		return (
			<VoiceBox
				voice={surface.voice}
				actions={surface.actions}
				transcript={props.transcript}
				reducedMotion={props.reducedMotion}
				shown={boxed}
			/>
		);
	}
	return (
		<VoiceSubtitles
			transcript={props.transcript}
			enabled={wanted || props.recording}
			reducedMotion={props.reducedMotion}
		/>
	);
}

export { PaneSubtitles, type PaneSubtitlesProps };
