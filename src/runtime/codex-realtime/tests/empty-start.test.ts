// A transcript segment as Codex really sends it: started with no text, its words following as
// deltas (0.155.1, `realtime_history.rs`). What is guarded is that the transcript never holds a
// record with nothing in it, which the browser contract cannot carry, and that the words show up
// as they arrive.

import { expect, test } from "bun:test";

import {
	COORDINATOR_WIRE_THREAD_ID,
	harness,
	notify,
	started,
} from "@/runtime/codex-realtime/tests/adapter-harness";

test("a segment started empty is no record until it has words, and then grows with them", async () => {
	const h = harness();
	const { wireSessionId } = await started(h);
	const item = {
		id: "item-a",
		realtimeSessionId: wireSessionId,
		type: "transcriptSegment",
		role: "assistant",
	};
	notify(h, "thread/realtime/item/started", {
		threadId: COORDINATOR_WIRE_THREAD_ID,
		item: { ...item, text: "" },
	});
	expect(h.adapter.transcript()).toEqual([]);
	for (const delta of ["One", " writer"]) {
		notify(h, "thread/realtime/item/transcript/delta", {
			threadId: COORDINATOR_WIRE_THREAD_ID,
			itemId: "item-a",
			delta,
		});
	}
	expect(h.adapter.transcript().map((record) => [record.text, record.status])).toEqual([
		["One writer", "provisional"],
	]);
});
