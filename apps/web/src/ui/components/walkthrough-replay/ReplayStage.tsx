// The picture of a talk as it is rendered: the recording's frame, its one pane on the talk's board
// at the talk's step, and the voice over it. It is the frame a recording page puts up around its
// pane, so the pane and its walkthrough box stand where they stood while the talk was recorded.
//
// The voice is drawn as the shell draws a live voice in a presented walkthrough (TASK-400): the
// same voice box at the foot of the same walkthrough box, with the orb in its socket, the words or
// the voice's word, and mute and the subtitles control. The voice of a talk is live from its first
// frame to its last, and on each frame it is as loud as the talk's voice was then. A recording has
// no dock, so this page hosts the one orb itself, in the box. The box is there once the walkthrough
// is presented: before the first step a talk shows the whole board. Nobody presses a key in a
// video, so the keys are drawn and do nothing. A recording cuts every move of the walkthrough box
// and of the voice box in it (app.css), so the orb is never flown either: it is in its socket from
// the first frame the box is shown.

import { QueryClientProvider, type QueryClient } from "@tanstack/react-query";
import { useMemo, useSyncExternalStore, type JSX } from "react";

import type { Talk } from "@archboard/walkthrough/talk";
import { Tooltip } from "@archboard/ui-kit/components";
import { PaneVaultContext } from "#ui/state/semantic-board-canvas/pane-vault.ts";
import { SemanticBoardStage } from "#ui/components/semantic-board-canvas/SemanticBoardStage.tsx";
import { useOverlayPlace } from "#ui/hooks/semantic-board-canvas/use-overlay-place.ts";
import { type SemanticPaneReading } from "#ui/rules/semantic-board-canvas/board/address.ts";
import {
	OrbHost,
	OrbStageProvider,
	useOrbPlacement,
	type SubtitleSource,
	VoiceBox,
	useCircleState,
	type VoiceBoxProps,
	type AgentVoiceView,
	type VoiceLevel,
} from "@archboard/workbench/voice";
import { RecordingStage } from "#ui/components/walkthrough-recording/RecordingStage.tsx";
import type { TalkPlayback } from "#ui/state/walkthrough-replay/talk-playback.ts";

/** Inputs for the rendered picture. */
interface ReplayStageProps {
	/** The talk. */
	readonly talk: Talk;
	/** Where the talk stands, played frame by frame. */
	readonly playback: TalkPlayback;
	/** The cache the pane reads the talk's board through. */
	readonly client: QueryClient;
	/**
	 * Told what the pane is reading, whenever that changes.
	 * @param reading The reading.
	 */
	readonly onReading: (reading: SemanticPaneReading) => void;
}

/**
 * The vault the talk's pane is in: none on a server. A talk carries its board,
 * and every read of the pane is answered from the talk (talk-reads), so this
 * only keeps its cached reads apart from any vault's.
 */
const TALK_VAULT = "recorded-talk";

/** Nobody picks anything out of a rendered talk, or presses one of its keys. */
function ignore(): void {
	// A recording is watched, not handled.
}

/** The voice box's keys, as a video has them: drawn, and doing nothing. */
const WATCHED: VoiceBoxProps["actions"] = { mute: ignore, unmute: ignore };

/**
 * The voice of a talk: live from its first frame to its last.
 * @param level How loud it is on the frame played to.
 * @returns The voice, as the voice box and the orb read it.
 */
function talkVoice(level: VoiceLevel): AgentVoiceView {
	return { stage: "listening", problem: null, busy: false, level };
}

/**
 * The voice box, where the stage lays it: shown at the foot of the presented walkthrough's box.
 * @param props The voice, and what it has said so far.
 * @param props.voice The voice.
 * @param props.transcript What it has said, which a recording always subtitles.
 * @returns The box.
 */
function ReplayVoiceBox(props: {
	readonly voice: AgentVoiceView;
	readonly transcript: readonly SubtitleSource[];
}): JSX.Element {
	const place = useOverlayPlace();
	return (
		<VoiceBox
			voice={props.voice}
			actions={WATCHED}
			transcript={props.transcript}
			reducedMotion={false}
			shown={place === "foot"}
			place={place}
		/>
	);
}

/**
 * The page's one orb, which the dock's circle hosts in the shell: lit, in the voice box, and showing
 * what the circle would.
 * @param props The voice.
 * @param props.voice The voice.
 * @returns The orb, drawn into the stage's holder.
 */
function ReplayOrb(props: { readonly voice: AgentVoiceView }): JSX.Element {
	// Without motion for the stage: a recording cuts every move of the box, so the orb is never flown.
	useOrbPlacement({ home: "box", shown: true, reducedMotion: true });
	return (
		<OrbHost
			mode={useCircleState(props.voice)}
			level={props.voice.level.read}
			reducedMotion={false}
		/>
	);
}

/**
 * The recording's frame, with its pane where the talk stands.
 * @param props The talk, where it stands, the cache and the reading's listener.
 * @returns The frame.
 */
function ReplayStage(props: ReplayStageProps): JSX.Element {
	const { talk, playback } = props;
	const { level } = playback;
	const moment = useSyncExternalStore(playback.subscribe, playback.moment);
	const voice = useMemo(() => talkVoice(level), [level]);
	const overlay = useMemo(
		() => <ReplayVoiceBox voice={voice} transcript={moment.transcript} />,
		[voice, moment.transcript],
	);
	return (
		<QueryClientProvider client={props.client}>
			<Tooltip.Provider>
				<OrbStageProvider>
					<RecordingStage>
						<div data-slot="pane-stage" className="relative flex min-h-0 min-w-0 flex-1 flex-col">
							<PaneVaultContext value={TALK_VAULT}>
								<SemanticBoardStage
									board={talk.board.name}
									variant={talk.board.variant ?? undefined}
									selection={null}
									onSelect={ignore}
									onReading={props.onReading}
									driven={moment.step}
									reducedMotion={false}
									overlay={overlay}
								/>
							</PaneVaultContext>
						</div>
					</RecordingStage>
					<ReplayOrb voice={voice} />
				</OrbStageProvider>
			</Tooltip.Provider>
		</QueryClientProvider>
	);
}

export { ReplayStage, type ReplayStageProps };
