// Starting voice to narrate a walkthrough, and handing the voice model each step on screen.
//
// What is guarded: a narration start tells the voice model which walkthrough and the
// coordinator nothing, a long name cannot crowd out the rest of the start, and every step and
// leaving reaches the voice model as speech it says. A recording start tells the voice model the
// talk is recorded in place of the narration, sends no delegation filler, gives the coordinator a
// rule of its own (it stays silent), and hands its steps over in the words its prompt says they
// begin with, never telling it the walkthrough was left. The core delivers what this policy says;
// its own tests hold that part.

import { expect, test } from "bun:test";

import {
	presentationSpeech,
	type RealtimePresentationChange,
} from "#runtime/realtime/rules/presentation-mode.ts";
import { createArchboardVoicePolicy } from "#runtime/host/services/archboard-voice.ts";

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
 * A walkthrough as a start carries it.
 * @param language For a recording, the language it is narrated in; null for a narration.
 * @returns The presentation.
 */
function walkthrough(language: string | null) {
	return {
		walkthrough: "w1",
		name: "For the model",
		recording: language === null ? null : { language },
	};
}

test("a narration or recording start names the walkthrough to the voice model and adds nothing for a narration's coordinator; a recording replaces the narration, sends no filler and silences its coordinator", () => {
	const policy = createArchboardVoicePolicy();
	const plain = policy.start(null);
	const presented = policy.start(walkthrough(null));
	const recorded = policy.start(walkthrough("en"));
	const base = plain.prompt;
	expect(plain.prompt).not.toContain("For the model");
	// A narration adds to the ordinary prompt. A recording keeps who the voice is, the
	// ordinary prompt's leading paragraphs, and none of how it converses, since nobody is there
	// to talk to (TASK-352, TASK-478.02).
	expect(presented.prompt.startsWith(base)).toBe(true);
	const live = paragraphs(base);
	const recordedParagraphs = new Set(paragraphs(recorded.prompt));
	const kept = live.filter((one) => recordedParagraphs.has(one));
	expect(kept.length).toBeGreaterThan(0);
	expect(kept.length).toBeLessThan(live.length);
	expect(kept).toEqual(live.slice(0, kept.length));
	for (const start of [presented, recorded]) {
		expect(start.prompt).toContain("For the model");
	}
	// A narration's coordinator gets no presentation rule. A recording's is silenced, since
	// whatever it answered would be spoken into the video.
	expect(presented.suppressCoordinatorSpeech).toBe(plain.suppressCoordinatorSpeech);
	expect(plain.suppressCoordinatorSpeech).toBe(false);
	expect(recorded.suppressCoordinatorSpeech).toBe(true);
	const narration = presented.prompt.slice(base.length).trim();
	expect(narration.length).toBeGreaterThan(0);
	expect(recorded.prompt).not.toContain(narration);
	expect(presented.delegationAckFiller).toBe(plain.delegationAckFiller);
	expect(plain.delegationAckFiller).toBe(true);
	expect(recorded.delegationAckFiller).toBe(false);
});

test("a recording's voice prompt names the one language it is narrated in, and a narration's names none", () => {
	const policy = createArchboardVoicePolicy();
	const languages = { en: "English", da: "Danish", "pt-BR": "Brazilian Portuguese" };
	const starts = new Map<string | null, string>();
	for (const language of [null, ...Object.keys(languages)]) {
		starts.set(language, policy.start(walkthrough(language)).prompt);
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

test("a start carries a walkthrough's name cut to a bound, never the whole of a runaway one", () => {
	const policy = createArchboardVoicePolicy();
	const long = policy.start({
		walkthrough: "w1",
		name: "A very long name ".repeat(500),
		recording: null,
	});
	const grew = long.prompt.length - policy.start(null).prompt.length;
	expect(grew).toBeLessThan(4_000);
});

test("each step and leaving reach the voice model as speech, in the words the narration prompt names", () => {
	const source = changeSource();
	const policy = createArchboardVoicePolicy(source.subscribe);
	const said: { readonly text: string; readonly channel: string }[] = [];
	const stop = policy.subscribe?.(walkthrough(null), (input) => said.push(input));
	if (stop === undefined) throw new Error("The Archboard policy subscribes to narration changes.");
	source.fire({
		kind: "stepped",
		step: 1,
		of: 2,
		heading: "All of it",
		body: "Three parts.",
		subjects: [],
	});
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
	// Each is speech the voice says, never quiet context.
	expect(said.map(({ channel }) => channel)).toEqual(["speech", "speech", "speech"]);
	const texts = said.map(({ text }) => text);
	const prompt = policy.start(walkthrough(null)).prompt;
	expect(texts[0]).toContain("All of it");
	// A step begins with the words the narration prompt says it begins with.
	expect(prompt).toContain(`"${leadIn(texts[0])}"`);
	expect(texts[1]).toContain("One writer");
	expect(texts[1]).toContain("It owns writes.");
	// What the step highlights, and how each changed, under the words the prompt says they
	// follow.
	expect(texts[1]).toContain("Ledger (added)");
	expect(texts[1]).toContain('label was "read"');
	expect(texts[1]).toContain("It highlights");
	expect(prompt).toContain('"It highlights"');
	// A pane leaves the walkthrough as well when an agent's `browser show` puts another model
	// in it, and nothing tells the two apart, so leaving never says the user did it
	// (TASK-293.06).
	expect(texts[2]).not.toMatch(/\buser\b/u);
	stop();
	expect(source.listeners.size).toBe(0);
});

/**
 * The words a handed-over step begins with, up to its first colon.
 * @param speech What the voice model was handed.
 * @returns The lead-in.
 */
function leadIn(speech: string | undefined): string {
	return speech?.slice(0, speech.indexOf(":")) ?? "";
}

/**
 * A prompt's paragraphs.
 * @param prompt The prompt.
 * @returns Each paragraph, trimmed, without empty ones.
 */
function paragraphs(prompt: string | null | undefined): string[] {
	return (prompt ?? "")
		.split("\n\n")
		.map((one) => one.trim())
		.filter((one) => one.length > 0);
}

test("a narrated step carries no number, and only the last says where it is", () => {
	const step = {
		kind: "stepped",
		heading: "One writer",
		body: "It owns writes.",
		subjects: [],
	} as const;
	const middle = presentationSpeech({ ...step, step: 2, of: 5 }, false);
	const last = presentationSpeech({ ...step, step: 5, of: 5 }, false);
	expect(middle).not.toMatch(/\d/u);
	expect(last).not.toMatch(/\d/u);
	expect(last).not.toBe(middle);
});

test("a recording's steps reach the voice model as what to explain, in the words its prompt names, never which step they are, and leaving it is never told", () => {
	const source = changeSource();
	const policy = createArchboardVoicePolicy(source.subscribe);
	const said: string[] = [];
	const stop = policy.subscribe?.(walkthrough("en"), (input) => said.push(input.text));
	if (stop === undefined) throw new Error("The Archboard policy subscribes to narration changes.");
	source.fire({
		kind: "stepped",
		step: 2,
		of: 3,
		heading: "One writer",
		body: "It owns writes.",
		subjects: [{ name: "Ledger", standing: "added", moved: [] }],
	});
	source.fire({ kind: "left" });
	expect(said).toHaveLength(1);
	const prompt = policy.start(walkthrough("en")).prompt;
	// The step names its heading, so its body reads as a topic to explain and not as something
	// the user said to the voice.
	expect(said[0]).toContain("One writer");
	expect(said[0]).toContain("It owns writes.");
	expect(said[0]).toContain("Ledger (added)");
	expect(prompt).toContain(`"${leadIn(said[0])}"`);
	// The subjects follow words the prompt names, as a narration's do.
	const subjectsLeadIn = said[0]?.split("\n")[1]?.split(":")[0] ?? "\0";
	expect(prompt).toContain(`"${subjectsLeadIn}"`);
	// Nothing tells the voice which step it is or how many there are, so it cannot open a
	// beat with "step two" (TASK-478.02).
	expect(said[0]).not.toMatch(/[23]/u);
	stop();
});
