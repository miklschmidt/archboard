// The picture of a talk as it is rendered: the recording's frame, its one pane on the talk's model
// at the talk's step, and the voice over it. It is the frame a recording page puts up around its
// pane, so the pane and its walkthrough column stand where they stood while the talk was recorded.
//
// The voice is drawn as the shell draws a live voice in a presented walkthrough (TASK-400): the
// same voice box low over the same picture, with the orb in its socket, the words or the voice's
// word, and mute and the subtitles control. The voice of a talk is live from its first
// frame to its last, and on each frame it is as loud as the talk's voice was then. A recording has
// no dock, so this page hosts the one orb itself, in the box. The box is there once the walkthrough
// is presented: before the first step a talk shows the whole model. Nobody presses a key in a
// video, so the keys are drawn and do nothing. A recording cuts every move of the walkthrough's
// column and of the voice box (app.css), so the orb is never flown either: it is in its socket from
// the first frame the box is shown.

import { QueryClientProvider, type QueryClient } from "@tanstack/react-query";
import { useCallback, useMemo, useSyncExternalStore, type JSX } from "react";

import type { Talk } from "@archboard/walkthrough/talk";
import { Tooltip } from "@archboard/ui-kit/components";
import { PaneVaultContext } from "#ui/architecture-drawing/canvas/pane-vault/state/pane-vault.ts";
import { ModelWalkthrough } from "#ui/architecture-drawing/model-reader/reading/components/ModelWalkthrough.tsx";
import { readingOf } from "#ui/application/rules/pane-reading.ts";
import type { PaneReading } from "#ui/panes/pane-session/state/pane-reading.ts";
import { CanvasStage } from "#ui/architecture-drawing/canvas/presentation/components/CanvasStage.tsx";
import { type SemanticPaneReading } from "#ui/architecture-drawing/canvas/picture/rules/address.ts";
import { RecordedVoice, RecordedVoiceBox } from "@archboard/workbench/agent-surfaces";
import { RecordingStage } from "#ui/walkthroughs/recording/components/RecordingStage.tsx";
import type { TalkPlayback } from "#ui/walkthroughs/replay/state/talk-playback.ts";

/** Inputs for the rendered picture. */
interface ReplayStageProps {
	/** The talk. */
	readonly talk: Talk;
	/** Where the talk stands, played frame by frame. */
	readonly playback: TalkPlayback;
	/** The cache the pane reads the talk's model through. */
	readonly client: QueryClient;
	/**
	 * Told what the pane is reading, whenever that changes.
	 * @param reading The reading.
	 */
	readonly onReading: (reading: PaneReading | null) => void;
}

/**
 * The vault the talk's pane is in: none on a server. A talk carries its model,
 * and every read of the pane is answered from the talk (talk-reads), so this
 * only keeps its cached reads apart from any vault's.
 */
const TALK_VAULT = "recorded-talk";

/** Nobody picks anything out of a rendered talk. */
function ignore(): void {
	// A recording is watched, not handled.
}

/**
 * The recording's frame, with its pane where the talk stands.
 * @param props The talk, where it stands, the cache and the reading's listener.
 * @returns The frame.
 */
function ReplayStage(props: ReplayStageProps): JSX.Element {
	const { talk, playback } = props;
	const { level } = playback;
	const { onReading } = props;
	const reportLegacy = useCallback(
		(reading: SemanticPaneReading) => onReading(readingOf(reading, null)),
		[onReading],
	);
	const moment = useSyncExternalStore(playback.subscribe, playback.moment);
	const presented = moment.step !== null;
	const overlay = useMemo(
		() => <RecordedVoiceBox transcript={moment.transcript} presented={presented} />,
		[moment.transcript, presented],
	);
	return (
		<QueryClientProvider client={props.client}>
			<Tooltip.Provider>
				<RecordedVoice level={level}>
					<RecordingStage>
						<div data-slot="pane-stage" className="relative flex min-h-0 min-w-0 flex-1 flex-col">
							<PaneVaultContext value={TALK_VAULT}>
								{talk.architecture === undefined ? (
									<CanvasStage
										model={talk.board.name}
										variant={talk.board.variant ?? undefined}
										selection={null}
										onSelect={ignore}
										onReading={reportLegacy}
										driven={moment.step}
										reducedMotion={false}
										overlay={overlay}
									/>
								) : (
									<ModelWalkthrough
										vault={TALK_VAULT}
										model={talk.architecture}
										reducedMotion={false}
										onLeave={ignore}
										driven={moment.step}
										onReading={onReading}
										overlay={overlay}
									/>
								)}
							</PaneVaultContext>
						</div>
					</RecordingStage>
				</RecordedVoice>
			</Tooltip.Provider>
		</QueryClientProvider>
	);
}

export { ReplayStage };
