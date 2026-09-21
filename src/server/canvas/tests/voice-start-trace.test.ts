// The record of what happened each time voice was started.
//
// It exists so that "realtime negotiation was unavailable or failed" can be read afterwards as a
// sequence of stages with the refusing message in it. What is guarded: entries belong to the
// attempt they happened in and carry when they happened; what happens before any attempt is
// dropped rather than misfiled; and the record stays bounded however often voice is started.

import { expect, test } from "bun:test";
import { createVoiceStartTrace } from "@/server/canvas/index";

test("keeps each attempt's stages in order with when they happened, and drops what no attempt owns", () => {
	let now = 1_000;
	const trace = createVoiceStartTrace(() => now);
	trace.note("diagnostic", { message: "before anybody started voice" });
	trace.begin("pane-a");
	now = 1_250;
	trace.note("preconditions", { coordinatorReady: false, coordinatorState: "starting" });
	now = 1_300;
	trace.note("refused", { message: "Realtime is unavailable for this exact linked thread." });
	trace.begin("pane-a");
	now = 1_900;
	trace.note("start_sent", { promptBytes: 5_138 });
	const [first, second] = trace.attempts();
	expect(first?.entries.map((entry) => [entry.atMs, entry.stage])).toEqual([
		[250, "preconditions"],
		[300, "refused"],
	]);
	expect(first?.entries[1]?.detail["message"]).toContain("unavailable");
	expect(second?.entries).toEqual([
		{ atMs: 600, stage: "start_sent", detail: { promptBytes: 5_138 } },
	]);
});

test("stays bounded however often voice is started and however much one start says", () => {
	const trace = createVoiceStartTrace(() => 0);
	for (let attempt = 0; attempt < 50; attempt += 1) {
		trace.begin(`pane-${attempt}`);
		for (let entry = 0; entry < 1_000; entry += 1) {
			trace.note("state", { phase: "connecting" });
		}
	}
	const kept = trace.attempts();
	expect(kept.length).toBeLessThan(50);
	expect(kept.at(-1)?.paneId).toBe("pane-49");
	expect(kept.every((attempt) => attempt.entries.length < 1_000)).toBe(true);
});
