// Starting voice to narrate a walkthrough, and handing the voice model each step on screen.
//
// What is guarded: a narration start tells the voice model which walkthrough and the
// coordinator nothing, a long name cannot crowd out the rest of the start, and every step (the
// first, which may land while Codex is still starting the session, and each one after) reaches
// the voice model as speech it says, as does leaving, without a coordinator turn. A recording
// start tells the voice model the talk is recorded in place of the narration, sends no
// delegation filler, gives the coordinator a rule of its own, and hands its steps over in the words its prompt says they begin with,
// never telling it the walkthrough was left.

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

/**
 * A walkthrough as a start carries it.
 * @param language For a recording, the language it is narrated in; null for a narration.
 * @returns The presentation.
 */
function walkthrough(language: string | null) {
	return {
		walkthrough: "w1",
		name: "For the board",
		recording: language === null ? null : { language },
	};
}

test("a narration or recording start names the walkthrough to the voice model and adds nothing for a narration's coordinator; a recording replaces the narration, sends no filler and gives its coordinator its own rule", async () => {
	const presenting = harness();
	const recording = harness();
	const ordinary = harness();
	try {
		await started(presenting, "", walkthrough(null));
		await started(recording, "", walkthrough("en"));
		await started(ordinary);
		const [presented] = presenting.session.starts;
		const [recorded] = recording.session.starts;
		const [plain] = ordinary.session.starts;
		const base = plain?.prompt ?? "\0";
		expect(plain?.prompt).not.toContain("For the board");
		// A narration adds to the ordinary prompt. A recording keeps who the voice is and none of
		// the conversation, since nobody is there to talk to.
		expect(presented?.prompt?.startsWith(base)).toBe(true);
		expect(recorded?.prompt?.startsWith(base)).toBe(false);
		expect(recorded?.prompt?.split("\n")[0]).toBe(base.split("\n")[0]);
		for (const start of [presented, recorded]) {
			expect(start?.prompt).toContain("For the board");
			// The session opens with nothing said as the user: the first step is handed over by
			// the server.
			expect(start?.initialItems).toEqual([]);
		}
		// A narration's coordinator gets no presentation instructions. A recording's is told
		// something else, since whatever it answered would be spoken into the video.
		expect(presented?.realtimeStartInstructions).toBe(plain?.realtimeStartInstructions);
		expect(recorded?.realtimeStartInstructions).toBeString();
		expect(recorded?.realtimeStartInstructions).not.toBe(plain?.realtimeStartInstructions);
		const narration = presented?.prompt?.slice(base.length).trim() ?? "";
		expect(narration.length).toBeGreaterThan(0);
		expect(recorded?.prompt).not.toContain(narration);
		expect(presented?.delegationAckFiller).toBe(plain?.delegationAckFiller);
		expect(plain?.delegationAckFiller).toBe(true);
		expect(recorded?.delegationAckFiller).toBe(false);
	} finally {
		presenting.adapter.dispose();
		recording.adapter.dispose();
		ordinary.adapter.dispose();
	}
});

test("a recording's voice prompt names the one language it is narrated in, and a narration's names none", async () => {
	const languages = { en: "English", da: "Danish", "pt-BR": "Brazilian Portuguese" };
	const starts = new Map<string | null, string>();
	for (const language of [null, ...Object.keys(languages)]) {
		const h = harness();
		try {
			await started(h, "", walkthrough(language));
			starts.set(language, h.session.starts[0]?.prompt ?? "");
		} finally {
			h.adapter.dispose();
		}
	}
	const names = Object.values(languages);
	for (const [language, name] of Object.entries(languages)) {
		const prompt = starts.get(language) ?? "";
		// Named more than once: where the recording is introduced and where a step is explained.
		expect(prompt.split(name).length - 1).toBeGreaterThanOrEqual(2);
		for (const other of names.filter((one) => one !== name)) {
			expect(prompt).not.toContain(other);
		}
	}
	for (const name of names) expect(starts.get(null)).not.toContain(name);
});

test("a start carries a walkthrough's name cut to a bound, never the whole of a runaway one", async () => {
	const h = harness();
	try {
		await started(h, "", {
			walkthrough: "w1",
			name: "A very long name ".repeat(500),
			recording: null,
		});
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
	const answer = h.adapter.createOffer({ ...browser, sdp: "offer-sdp" }, walkthrough(null));
	try {
		// The first step lands on screen while Codex is still starting the session.
		source.fire({
			kind: "stepped",
			step: 1,
			of: 2,
			heading: "All of it",
			body: "Three parts.",
			subjects: [],
		});
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
			subjects: [
				{ name: "Ledger", standing: "added", moved: [] },
				{ name: 'Gateway → Ledger "write"', standing: "changed", moved: ['label was "read"'] },
			],
		});
		source.fire({ kind: "left" });
		await settle();
		const said = h.session.speeches.map((speech) => speech.text);
		expect(said).toHaveLength(3);
		expect(said[0]).toContain("All of it");
		// A step begins with the words the narration prompt says it begins with.
		expect(h.session.starts[0]?.prompt).toContain(`"${leadIn(said[0])}"`);
		expect(said[1]).toContain("One writer");
		expect(said[1]).toContain("It owns writes.");
		// What the step highlights, and how each changed, under the words the prompt says they
		// follow.
		expect(said[1]).toContain("Ledger (added)");
		expect(said[1]).toContain('label was "read"');
		expect(said[1]).toContain("It highlights");
		expect(h.session.starts[0]?.prompt).toContain('"It highlights"');
		// A pane leaves the walkthrough as well when an agent's `browser show` puts another board
		// in it, and nothing tells the two apart, so leaving never says the user did it
		// (TASK-293.06).
		expect(said[2]).not.toMatch(/\buser\b/u);
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

/**
 * The words a handed-over step begins with, up to its first colon.
 * @param speech What the voice model was handed.
 * @returns The lead-in.
 */
function leadIn(speech: string | undefined): string {
	return speech?.slice(0, speech.indexOf(":")) ?? "";
}

test("a recording's steps reach the voice model in the words its prompt names, and leaving it is never told", async () => {
	const source = changeSource();
	const h = harness(undefined, source);
	try {
		await started(h, "", walkthrough("en"));
		source.fire({
			kind: "stepped",
			step: 1,
			of: 2,
			heading: "All of it",
			body: "Three parts.",
			subjects: [],
		});
		source.fire({ kind: "left" });
		await settle();
		const said = h.session.speeches.map((speech) => speech.text);
		expect(said).toHaveLength(1);
		expect(said[0]).toContain("All of it");
		expect(h.session.starts[0]?.prompt).toContain(`"${leadIn(said[0])}"`);
		expect(h.session.texts).toHaveLength(0);
	} finally {
		h.adapter.dispose();
	}
});
