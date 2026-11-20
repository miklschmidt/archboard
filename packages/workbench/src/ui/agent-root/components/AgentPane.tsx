// A pane's part of the agent: it hands the agent the conversation of the pane's current socket,
// for as long as that socket has one, and lays the voice over the pane's picture while the voice
// is laid over that pane.
//
// The voice is laid over the pane voice runs for (TASK-292), and over the pane presented
// fullscreen while one is. With it go its subtitles, while the person wants subtitles (TASK-391).
// What the subtitles show is decided in `subtitled-transcript`. A recording is always subtitled:
// nobody watching the video can turn them on (TASK-306). The page that records a talk captures no
// picture and nobody sees it, so it lays only the words and has no orb stage: the video's picture
// is rendered afterwards by the replay page, which draws the voice box as the shell does
// (TASK-400). Otherwise the subtitles are the words in the voice box, which carries the voice's orb
// and its controls too, and leaves the dock when subtitles are off. A fullscreen presentation has
// no dock to leave for, so the box carries the voice there whatever the person wants of subtitles
// (TASK-392), and what they want decides only whether there are words. The pane's stage lays the
// box low over the picture, in the middle of it, whether or not a walkthrough is presented.
//
// The pane is mounted for as long as the pane is, whatever its stage shows, so a pane whose model
// is still loading or could not be read still has its agent. Only the voice it lays goes where the
// picture is, which the pane's stage decides.

import { useEffect, useMemo, useSyncExternalStore, type JSX, type ReactNode } from "react";

import { usePaneVoice } from "#ui/agent-root/hooks/use-agent.ts";
import { subtitledTranscript, type VoiceFeed } from "#ui/agent-root/rules/subtitled-transcript.ts";
import { VoiceSubtitles } from "#ui/workbench-client/subtitles/components/VoiceSubtitles.tsx";
import { useSubtitlesWanted } from "#ui/workbench-client/subtitles/hooks/use-subtitle-preference.ts";
import { useVoiceBoxed } from "#ui/workbench-client/subtitles/hooks/use-voice-boxed.ts";
import type { SubtitleSource } from "#ui/workbench-client/subtitles/hooks/use-voice-subtitles.ts";
import { VoiceBox } from "#ui/workbench-client/voice/components/VoiceBox.tsx";
import { useVoiceSurface } from "#ui/workbench-client/voice/hooks/use-voice-surface.ts";
import type { HostedConversation } from "@archboard/codex-realtime-voice/browser";

/** Inputs for a pane's part of the agent. */
interface AgentPaneProps {
	readonly paneId: string;
	/** The conversation of the pane's current socket, or null while it has none. */
	readonly conversation: HostedConversation | null;
	/** Whether this page records a talk: nobody sees it, so it lays the words alone and never the voice box. */
	readonly recording: boolean;
	/** Whether the pane is presented fullscreen, so the dock is off screen and the box carries the voice whatever the person wants of subtitles. */
	readonly dockless: boolean;
	/** Whether the person asked for reduced motion. */
	readonly reducedMotion: boolean;
	/**
	 * The pane, which places the voice where its picture is.
	 * @param voice The voice to lay over the picture, or null where none is laid.
	 * @returns The pane.
	 */
	readonly children: (voice: ReactNode) => ReactNode;
}

/**
 * A pane's part of the agent: its conversation handed over, and the voice laid over its picture.
 * @param props The pane, its conversation, the page's facts and the pane itself.
 * @returns The pane, given the voice it lays.
 */
function AgentPane(props: AgentPaneProps): ReactNode {
	const { paneId, conversation, recording, dockless, reducedMotion } = props;
	const { panes, overlayPaneId, feed } = usePaneVoice();
	useEffect(
		() => (conversation === null ? undefined : panes.register(paneId, conversation)),
		[panes, paneId, conversation],
	);
	useEffect(() => (dockless ? panes.undock(paneId) : undefined), [panes, paneId, dockless]);
	useEffect(
		() => () => {
			panes.gone(paneId);
		},
		[panes, paneId],
	);
	const over = overlayPaneId === paneId;
	const voice = useMemo(
		() =>
			over ? (
				<PaneSubtitles
					feed={feed}
					reducedMotion={reducedMotion}
					recording={recording}
					dockless={dockless}
				/>
			) : null,
		[over, feed, reducedMotion, recording, dockless],
	);
	return props.children(voice);
}

/** Inputs for the subtitles of the voice over a pane. */
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

export { AgentPane };
