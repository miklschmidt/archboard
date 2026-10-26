// The record of what happened each time voice was started.
//
// It exists so that "realtime negotiation was unavailable or failed" can be read afterwards as a
// sequence of stages with the refusing message in it. What is guarded: entries belong to the
// attempt they happened in and carry when they happened, even while another tab's attempt runs
// beside it; and the record stays bounded however often voice is started.

import { expect, test } from "bun:test";
import { createVoiceStartTrace } from "#server/services/voice/start-trace.ts";

test("keeps each attempt's stages in order with when they happened, while another attempt runs beside it", () => {
	let now = 1_000;
	const trace = createVoiceStartTrace(() => now);
	const first = trace.begin("chat-a");
	now = 1_100;
	const second = trace.begin("chat-b");
	now = 1_250;
	first("preconditions", { coordinatorReady: false, coordinatorState: "starting" });
	now = 1_300;
	second("start_sent", { promptBytes: 5_138 });
	first("refused", { message: "Realtime is unavailable for this exact linked thread." });
	const [one, two] = trace.attempts();
	expect(one?.entries.map((entry) => [entry.atMs, entry.stage])).toEqual([
		[250, "preconditions"],
		[300, "refused"],
	]);
	expect(one?.entries[1]?.detail["message"]).toContain("unavailable");
	expect(two?.entries).toEqual([
		{ atMs: 200, stage: "start_sent", detail: { promptBytes: 5_138 } },
	]);
});

test("stays bounded however often voice is started and however much one start says", () => {
	const trace = createVoiceStartTrace(() => 0);
	for (let attempt = 0; attempt < 50; attempt += 1) {
		const note = trace.begin(`chat-${attempt}`);
		for (let entry = 0; entry < 1_000; entry += 1) {
			note("state", { phase: "connecting" });
		}
	}
	const kept = trace.attempts();
	expect(kept.length).toBeLessThan(50);
	expect(kept.at(-1)?.chatId).toBe("chat-49");
	expect(kept.every((attempt) => attempt.entries.length < 1_000)).toBe(true);
});
