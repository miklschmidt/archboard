// Subtitles of the voice, over the pane the voice was started for (TASK-292), and the
// voice itself with them while the person wants subtitles (TASK-391).
//
// What the subtitles show is decided in `subtitled-transcript`. A recording is always subtitled:
// nobody watching the video can turn them on (TASK-306). The page that records a talk captures no
// picture and nobody sees it, so it lays only the words and has no orb stage: the video's picture
// is rendered afterwards by the replay page (src/ui/walkthrough-replay), which draws the voice box
// as the shell does (TASK-400). Otherwise the subtitles are the words in the voice box, which
// carries the voice's orb and its controls too, and leaves the dock when subtitles are off. A
// fullscreen presentation has no dock to leave for, so the box carries the voice there whatever the
// person wants of subtitles (TASK-392), and what they want decides only whether there are words.
//
// Where the box is drawn is the stage's to say: free over the picture, or in the foot of a presented
// walkthrough's box (use-overlay-place), where the voice is drawn in the pill that the box gives it.

import { useSyncExternalStore, type JSX } from "react";

import { subtitledTranscript, type VoiceFeed } from "@/ui/application/subtitled-transcript";
import { useOverlayPlace } from "@/ui/semantic-board-canvas";
import {
	VoiceSubtitles,
	useSubtitlesWanted,
	useVoiceBoxed,
	type SubtitleSource,
	VoiceBox,
	useVoiceSurface,
} from "@archboard/workbench/voice";

/** Inputs for a pane's subtitles. */
interface PaneSubtitlesProps {
	/** Where the pane hears the voice it runs for. */
	readonly feed: VoiceFeed;
	/** Whether the person asked for reduced motion. */
	readonly reducedMotion: boolean;
	/** Whether this page records a talk: nobody sees it, so it lays the words alone and never the voice box. */
	readonly recording: boolean;
	/** Whether the agent dock is off screen, as in a fullscreen presentation, so the box carries the voice whatever the person wants of subtitles. */
	readonly dockless: boolean;
}

/** What the subtitles are drawn from. */
interface SubtitledProps {
	readonly transcript: readonly SubtitleSource[];
	readonly reducedMotion: boolean;
	readonly recording: boolean;
	readonly dockless: boolean;
}

/** What a box without words holds while the person does not want subtitles. */
const NO_WORDS: readonly SubtitleSource[] = [];

/**
 * The subtitles of the voice running for one pane.
 * @param props Where the pane hears the voice, the motion preference, and whether the page is a recording.
 * @returns The subtitle on screen, or the voice box, or null.
 */
function PaneSubtitles(props: PaneSubtitlesProps): JSX.Element {
	const { feed, ...rest } = props;
	const voice = useSyncExternalStore(feed.subscribe, feed.voice, feed.voice);
	return <Subtitled {...rest} transcript={subtitledTranscript(voice, props.recording)} />;
}

/**
 * The words and, where the voice may sit in the box, the box that holds them.
 * @param props What was said, the motion preference, whether the page is a recording and whether the dock is off screen.
 * @returns The voice box, or the subtitles alone.
 */
function Subtitled(props: SubtitledProps): JSX.Element {
	const wanted = useSubtitlesWanted();
	const surface = useVoiceSurface();
	const place = useOverlayPlace();
	const boxable = surface !== null && !props.recording;
	const on = surface !== null && surface.voice.stage !== "idle";
	const boxed = useVoiceBoxed(on, boxable, props.dockless);
	if (boxable) {
		return (
			<VoiceBox
				voice={surface.voice}
				actions={surface.actions}
				transcript={wanted ? props.transcript : NO_WORDS}
				reducedMotion={props.reducedMotion}
				shown={boxed}
				place={place}
			/>
		);
	}
	return (
		<VoiceSubtitles
			transcript={props.transcript}
			enabled={wanted || props.recording}
			reducedMotion={props.reducedMotion}
			bare={place === "foot"}
		/>
	);
}

export { PaneSubtitles, type PaneSubtitlesProps };
