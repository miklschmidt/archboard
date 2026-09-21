// The voice transcript as a change the browser is told about.
//
// A snapshot is published when something says it changed, and nothing said so for the
// transcript: it reached a browser only when an unrelated change happened to publish, so the
// words of a live voice arrived late and in bursts, in the dock and in the subtitles alike
// (TASK-292). This is that missing change source.
//
// The realtime adapter publishes the whole transcript, one event per record, for every word
// that arrives. Those events are one change, so they are told as one: the first of a burst asks
// for a microtask, and whatever else arrives before it runs rides along.

import type { RealtimeSemanticEventListener } from "@/shared/codex-realtime-host";

/** What the transcript changes are read from. */
interface TranscriptEvents {
	readonly onSemanticEvent: (listener: RealtimeSemanticEventListener) => () => void;
}

/**
 * Hear when the voice transcript changed.
 * @param realtime The voice session's events.
 * @param listener Told once for every burst of transcript events.
 * @returns How to stop listening.
 */
function watchTranscriptChanges(realtime: TranscriptEvents, listener: () => void): () => void {
	let pending = false;
	let stopped = false;
	const unsubscribe = realtime.onSemanticEvent((event) => {
		if (event.kind !== "transcript" || pending) {
			return;
		}
		pending = true;
		queueMicrotask(() => {
			pending = false;
			if (!stopped) {
				listener();
			}
		});
	});
	return (): void => {
		stopped = true;
		unsubscribe();
	};
}

export { watchTranscriptChanges, type TranscriptEvents };
