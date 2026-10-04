// Subtitles of the voice, over the pane the voice was started for (TASK-292), and the
// voice itself with them while the person wants subtitles (TASK-391).
//
// What the subtitles show is decided in `subtitled-transcript`. A recording is always subtitled:
// nobody watching the video can turn them on (TASK-306). A pane that is presented has its voice
// controls in the presentation bar, and a recording has no dock, so both keep plain subtitles.
// Otherwise the subtitles are the words in the voice box, which carries the voice's orb and its
// controls too, and leaves the dock when subtitles are off.

import { useSyncExternalStore, type JSX } from "react";

import { subtitledTranscript, type VoiceFeed } from "@/ui/application/subtitled-transcript";
import { VoiceSubtitles, useSubtitlesWanted, useVoiceBoxed } from "@/ui/voice-subtitles";
import type { SubtitleSource } from "@/ui/voice-subtitles";
import { VoiceBox, useVoiceSurface } from "@/ui/workbench";
import { useDemoTranscript } from "@/ui/workbench/demo";

/** Inputs for a pane's subtitles. */
interface PaneSubtitlesProps {
	/** Where the pane hears the voice it runs for, or null where the page demonstrates the voice (`?voiceDemo`). */
	readonly feed: VoiceFeed | null;
	/** Whether the person asked for reduced motion. */
	readonly reducedMotion: boolean;
	/** Whether this page is a recording. */
	readonly recording: boolean;
	/** Whether the voice box may carry the voice over this pane: it has a voice owner and nothing is presented. */
	readonly boxAvailable: boolean;
}

/** What the subtitles are drawn from. */
interface SubtitledProps {
	readonly transcript: readonly SubtitleSource[];
	readonly reducedMotion: boolean;
	readonly recording: boolean;
	readonly boxAvailable: boolean;
}

/**
 * The subtitles of the voice running for one pane.
 * @param props Where the pane hears the voice, the motion preference, whether the page is a recording and whether the box may carry the voice.
 * @returns The subtitle on screen, or the voice box, or null.
 */
function PaneSubtitles(props: PaneSubtitlesProps): JSX.Element {
	const { feed, ...rest } = props;
	return feed === null ? <DemoSubtitles {...rest} /> : <HeardSubtitles {...rest} feed={feed} />;
}

/**
 * The subtitles of a voice heard over the pane's transport.
 * @param props Where the voice is heard, the motion preference and where the voice may sit.
 * @param props.feed The feed.
 * @returns The subtitles.
 */
function HeardSubtitles(
	props: Omit<PaneSubtitlesProps, "feed"> & { readonly feed: VoiceFeed },
): JSX.Element {
	const { feed, ...rest } = props;
	const voice = useSyncExternalStore(feed.subscribe, feed.voice, feed.voice);
	return <Subtitled {...rest} transcript={subtitledTranscript(voice, props.recording)} />;
}

/**
 * The subtitles of the demonstration's voice.
 * @param props The motion preference and where the voice may sit.
 * @returns The subtitles.
 */
function DemoSubtitles(props: Omit<PaneSubtitlesProps, "feed">): JSX.Element {
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
	const boxable = props.boxAvailable && surface !== null;
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
