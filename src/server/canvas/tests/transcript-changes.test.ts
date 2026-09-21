// The voice transcript as a change the browser is told about: every burst of transcript events
// is one change, other events are none, and nothing is told after listening stopped.

import { expect, test } from "bun:test";

import type {
	RealtimeSemanticEvent,
	RealtimeSemanticEventListener,
} from "@/shared/codex-realtime-host";
import { watchTranscriptChanges } from "@/server/canvas";

/** A voice session whose events the test emits by hand. */
function session(): {
	readonly onSemanticEvent: (listener: RealtimeSemanticEventListener) => () => void;
	readonly emit: (kind: RealtimeSemanticEvent["kind"]) => void;
} {
	const listeners = new Set<RealtimeSemanticEventListener>();
	return {
		onSemanticEvent: (listener) => {
			listeners.add(listener);
			return () => listeners.delete(listener);
		},
		emit: (kind) => {
			// Only the kind is read; the rest of an event is the adapter's to shape.
			for (const listener of listeners) listener({ kind } as RealtimeSemanticEvent);
		},
	};
}

test("a burst of transcript events is told once, and again for the next word", async () => {
	const realtime = session();
	let told = 0;
	watchTranscriptChanges(realtime, () => {
		told += 1;
	});
	realtime.emit("transcript");
	realtime.emit("transcript");
	realtime.emit("transcript");
	expect(told).toBe(0);
	await Promise.resolve();
	expect(told).toBe(1);
	realtime.emit("transcript");
	await Promise.resolve();
	expect(told).toBe(2);
});

test("other events are not transcript changes, and nothing is told after stopping", async () => {
	const realtime = session();
	let told = 0;
	const stop = watchTranscriptChanges(realtime, () => {
		told += 1;
	});
	realtime.emit("state");
	realtime.emit("diagnostic");
	await Promise.resolve();
	expect(told).toBe(0);
	realtime.emit("transcript");
	stop();
	await Promise.resolve();
	expect(told).toBe(0);
});
