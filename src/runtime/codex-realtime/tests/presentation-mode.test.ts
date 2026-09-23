// Starting voice to narrate a walkthrough, and handing the voice model each step on screen.
//
// What is guarded: a narration start tells the voice model which walkthrough and the
// coordinator nothing, a long name cannot crowd out the rest of the start, and every step (the
// first, which may land while Codex is still starting the session, and each one after) reaches
// the voice model as speech it says, as does leaving, without a coordinator turn.

import { expect, test } from "bun:test";

import type { RealtimePresentationChange } from "../index.js";
import {
	COORDINATOR_WIRE_THREAD_ID,
	correlation,
	harness,
	notify,
	started,
} from "./adapter-harness.js";

/** A source of presentation changes a test can fire. */
function changeSource() {
	const listeners = new Set<(change: RealtimePresentationChange) => void>();
	return {
		listeners,
		subscribe: (listener: (change: RealtimePresentationChange) => void) => {
			listeners.add(listener);
			return () => {
				listeners.delete(listener);
			};
		},
		fire: (change: RealtimePresentationChange) => {
			for (const listener of listeners) listener(change);
		},
	};
}

/**
 * Let queued deliveries run.
 * @returns Once every queued microtask has run.
 */
function settle(): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, 0));
}

test("a narration start names the walkthrough to the voice model and adds nothing for the coordinator", async () => {
	const presenting = harness();
	const ordinary = harness();
	try {
		await started(presenting, "", { walkthrough: "w1", name: "For the board" });
		await started(ordinary);
		const [presented] = presenting.session.starts;
		const [plain] = ordinary.session.starts;
		expect(presented?.prompt).toContain("For the board");
		expect(presented?.prompt?.startsWith(plain?.prompt ?? "\0")).toBe(true);
		expect(plain?.prompt).not.toContain("For the board");
		// The coordinator gets no presentation instructions and the session opens with nothing
		// said as the user: the first step is handed over by the host.
		expect(presented?.realtimeStartInstructions).toBe(plain?.realtimeStartInstructions);
		expect(presented?.initialItems).toEqual([]);
		expect(presented?.delegationAckFiller).toBe(plain?.delegationAckFiller);
	} finally {
		presenting.adapter.dispose();
		ordinary.adapter.dispose();
	}
});

test("a start carries a walkthrough's name cut to a bound, never the whole of a runaway one", async () => {
	const h = harness();
	try {
		await started(h, "", { walkthrough: "w1", name: "A very long name ".repeat(500) });
		const plain = harness();
		try {
			await started(plain);
			const grew =
				(h.session.starts[0]?.prompt ?? "").length - (plain.session.starts[0]?.prompt ?? "").length;
			expect(grew).toBeLessThan(4_000);
		} finally {
			plain.adapter.dispose();
		}
	} finally {
		h.adapter.dispose();
	}
});

test("each step and leaving reach the voice model as speech, the first once the session has started, and no coordinator turn is involved", async () => {
	const source = changeSource();
	const h = harness(undefined, source);
	const browser = correlation();
	const answer = h.adapter.createOffer(
		{ ...browser, sdp: "offer-sdp" },
		{ walkthrough: "w1", name: "For the board" },
	);
	try {
		// The first step lands on screen while Codex is still starting the session.
		source.fire({ kind: "stepped", step: 1, of: 2, heading: "All of it", body: "Three parts." });
		await settle();
		expect(h.session.speeches).toHaveLength(0);
		const realtimeSessionId = h.session.starts[0]?.realtimeSessionId;
		notify(h, "thread/realtime/sdp", { threadId: COORDINATOR_WIRE_THREAD_ID, sdp: "answer-sdp" });
		notify(h, "thread/realtime/started", {
			threadId: COORDINATOR_WIRE_THREAD_ID,
			realtimeSessionId,
			version: "v3",
		});
		await answer;
		await settle();
		source.fire({
			kind: "stepped",
			step: 2,
			of: 2,
			heading: "One writer",
			body: "It owns writes.",
		});
		source.fire({ kind: "left" });
		await settle();
		const said = h.session.speeches.map((speech) => speech.text);
		expect(said).toHaveLength(3);
		expect(said[0]).toContain("All of it");
		expect(said[1]).toContain("One writer");
		expect(said[1]).toContain("It owns writes.");
		expect(h.session.speeches.every((speech) => speech.threadId === h.coordinatorThreadId)).toBe(
			true,
		);
		// Nothing is quiet context, and the coordinator is told nothing beyond its catalogue.
		expect(h.session.texts).toHaveLength(0);
		expect(
			h.session.injections.every((injection) =>
				JSON.stringify(injection).includes("archboard_board_catalogue"),
			),
		).toBe(true);
		expect(h.session.starts).toHaveLength(1);
		const stopped = h.adapter.stop(browser);
		expect(source.listeners.size).toBe(0);
		await stopped;
	} finally {
		h.adapter.dispose();
	}
});
