// A page recording one walkthrough to a video file (TASK-304): the pane alone,
// paced by the voice, captured in its own tab. The contract with the recorder
// that drives the page is in `@/shared/walkthrough-recording`.

import { recordedWalkthroughOf } from "@/shared/walkthrough-recording";

import { WalkthroughRecorder } from "@/ui/walkthrough-recording/lib/recorder";

export { RecordingStage } from "@/ui/walkthrough-recording/components/RecordingStage";
export { pace, type PaceObservation, type PaceState } from "@/ui/walkthrough-recording/lib/pacing";
export { tabCaptureOptions } from "@/ui/walkthrough-recording/lib/tab-capture";
export { useWalkthroughRecording } from "@/ui/walkthrough-recording/hooks/use-walkthrough-recording";
export type { RecordedStep, WalkthroughRecorder } from "@/ui/walkthrough-recording/lib/recorder";

/**
 * The recorder a page's address asks for.
 * @param search The address's search string as the page was opened.
 * @param board The board the page was opened on, by name, or null.
 * @returns The recorder, or null when the page is not a recording.
 */
function openWalkthroughRecorder(search: string, board: string | null): WalkthroughRecorder | null {
	const walkthrough = recordedWalkthroughOf(search);
	return walkthrough === null ? null : new WalkthroughRecorder({ board, walkthrough });
}

export { openWalkthroughRecorder };
