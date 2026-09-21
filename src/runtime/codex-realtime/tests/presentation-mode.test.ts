// Starting voice to present a walkthrough, and keeping its narration on the picture.
//
// The loop has two readers and each must be told its half: the voice model paces the talk and
// the coordinator presents each step. What is guarded is that a presentation start tells both,
// that an ordinary start tells neither, that a long walkthrough cannot crowd out the rest of the
// start, and that a user's hand on the keys reaches both models, the voice as something to
// answer now and a departure as something to stop for.

import { expect, test } from "bun:test";

import type { RealtimePresentationChange } from "../index.js";
import { harness, started } from "./adapter-harness.js";

/** A source of by-hand presentation changes a test can fire. */
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

test("a presentation start names the walkthrough to both models and hands neither of them its steps; an ordinary start says nothing of it", async () => {
	const presenting = harness();
	const ordinary = harness();
	try {
		await started(presenting, "", { walkthrough: "w1", name: "For the board" });
		await started(ordinary);
		const [presented] = presenting.session.starts;
		const [plain] = ordinary.session.starts;
		expect(presented?.prompt).toContain("For the board");
		expect(presented?.realtimeStartInstructions).toContain("For the board");
		expect(presented?.realtimeStartInstructions).toContain("present_step");
		// Pressing Narrate is the user's request, so the session opens with it already made
		// and the voice model has something to answer without being spoken to.
		expect(presented?.initialItems?.at(-1)?.role).toBe("user");
		expect(plain?.initialItems?.every((item) => item.role === "developer")).toBe(true);
		// A talk is given without the Realtime API's "one moment" before every step.
		expect(presented?.delegationAckFiller).toBe(false);
		expect(plain?.delegationAckFiller).toBe(true);
		// The mode adds to what every session is told and replaces none of it.
		expect(presented?.prompt?.startsWith(plain?.prompt ?? "\0")).toBe(true);
		expect(plain?.prompt).not.toContain("For the board");
		expect(plain?.realtimeStartInstructions).not.toContain("present_step");
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

test("a user's step reaches both models, the voice as speech it says; leaving is quiet context; and the watch is released", async () => {
	const source = changeSource();
	const h = harness(undefined, source);
	const { correlation } = await started(h, "", { walkthrough: "w1", name: "For the board" });
	try {
		source.fire({
			kind: "stepped",
			step: 2,
			of: 2,
			heading: "One writer",
			body: "It owns writes.",
		});
		const delivered = new Promise<void>((resolve) => {
			h.session.afterAppendText = resolve;
		});
		source.fire({ kind: "left" });
		await delivered;
		// In a full-duplex session appended text is quiet whatever its role; what the voice model
		// says is what arrives as speech. So the step is speech, and leaving is not.
		expect(h.session.speeches).toHaveLength(1);
		expect(h.session.speeches[0]?.text).toContain("One writer");
		expect(h.session.speeches[0]?.text).toContain("It owns writes.");
		expect(h.session.texts).toHaveLength(1);
		expect(h.session.texts[0]).toMatchObject({ role: "developer" });
		expect(h.session.injections).toHaveLength(2);
		expect(JSON.stringify(h.session.injections[0])).toContain("One writer");
		expect(h.session.injections[0]?.threadId).toBe(h.coordinatorThreadId);
		// Telling the models starts no turn and no second session.
		expect(h.session.starts).toHaveLength(1);
		const stopped = h.adapter.stop(correlation);
		expect(source.listeners.size).toBe(0);
		await stopped;
	} finally {
		h.adapter.dispose();
	}
});
