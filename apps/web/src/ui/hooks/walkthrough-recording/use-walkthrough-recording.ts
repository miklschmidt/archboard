// A recording page's recorder, kept in step with the server (TASK-304): the
// agent and the voice are bound to it every render, as they change; its
// contract is published on the page for the recorder outside it; and the step
// it moves the pane to is read as state, so the pane renders it.

import { useEffect, useSyncExternalStore } from "react";

import { publishRecordingPage } from "@archboard/walkthrough/recording";

import type {
	RecordedStep,
	WalkthroughRecorder,
} from "#ui/state/walkthrough-recording/recorder.ts";
import type { RecordingSources } from "#ui/rules/walkthrough-recording/voice-sources.ts";

/**
 * Publish a recorder on the page for as long as the page has it.
 * @param recorder The page's recorder, or null.
 */
function usePublished(recorder: WalkthroughRecorder | null): void {
	useEffect(() => {
		if (recorder === null) return undefined;
		const withdraw = publishRecordingPage(recorder.page);
		return () => {
			withdraw();
			recorder.dispose();
		};
	}, [recorder]);
}

/** The step store of a page that is not a recording. */
const NO_STEP = Object.freeze({
	/**
	 * Nothing to hear without a recorder.
	 * @returns How to stop listening.
	 */
	subscribe: (): (() => void) => () => undefined,
	/**
	 * No step without a recorder.
	 * @returns Null.
	 */
	step: (): RecordedStep | null => null,
});

/**
 * Keep a recorder in step with the server, and publish it on the page.
 * @param recorder The page's recorder, or null when the page is not a recording.
 * @param sources The server's agent and voice.
 * @returns The step the recorded pane is to show, or null.
 */
function useWalkthroughRecording(
	recorder: WalkthroughRecorder | null,
	sources: RecordingSources,
): RecordedStep | null {
	// Bound each render, like the pane events: the recorder reads the agent and the voice
	// when its tick asks, and they are whatever the server holds now.
	recorder?.bind(sources);
	usePublished(recorder);
	const store = recorder ?? NO_STEP;
	return useSyncExternalStore(store.subscribe, store.step, store.step);
}

export { useWalkthroughRecording };
