// The picture of a talk as it is rendered: the recording's frame, its one pane
// on the talk's board at the talk's step, and the voice's subtitles over it.
// It is the same markup a recording page puts up around its pane, so a frame
// rendered here is the frame the recording page would have shown.

import { QueryClientProvider, type QueryClient } from "@tanstack/react-query";
import { useMemo, useSyncExternalStore, type JSX } from "react";

import type { Talk } from "@/shared/walkthrough-recording/talk";
import { TooltipProvider } from "@/ui/components/tooltip";
import { SemanticBoardStage, type SemanticPaneReading } from "@/ui/semantic-board-canvas";
import { VoiceSubtitles } from "@/ui/voice-subtitles";
import { RecordingStage } from "@/ui/walkthrough-recording";
import type { TalkPlayback } from "@/ui/walkthrough-replay/lib/talk-playback";

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

/** Nobody picks anything out of a rendered talk. */
function pickNothing(): void {
	// A recording is watched, not handled.
}

/**
 * The recording's frame, with its pane where the talk stands.
 * @param props The talk, where it stands, the cache and the reading's listener.
 * @returns The frame.
 */
function ReplayStage(props: ReplayStageProps): JSX.Element {
	const { talk, playback } = props;
	const moment = useSyncExternalStore(playback.subscribe, playback.moment);
	const subtitles = useMemo(
		() => <VoiceSubtitles transcript={moment.transcript} enabled reducedMotion={false} />,
		[moment.transcript],
	);
	return (
		<QueryClientProvider client={props.client}>
			<TooltipProvider>
				<RecordingStage>
					<div data-slot="pane-stage" className="relative flex min-h-0 min-w-0 flex-1 flex-col">
						<SemanticBoardStage
							board={talk.board.name}
							variant={talk.board.variant ?? undefined}
							selection={null}
							onSelect={pickNothing}
							onReading={props.onReading}
							driven={moment.step}
							reducedMotion={false}
							overlay={subtitles}
						/>
					</div>
				</RecordingStage>
			</TooltipProvider>
		</QueryClientProvider>
	);
}

export { ReplayStage, type ReplayStageProps };
