// DEMONSTRATION: the voice the dock and the voice box show when the page asks for it.
// `?voiceDemo` holds the voice speaking, with a level that moves like speech, and
// `?voiceDemo=cycle` takes it through every stage again and again, from its start when
// the page opens, so the dock's turn from the Talk key to the circle and back can be
// watched without Codex, a microphone or a turn. Either also puts the voice box over the active pane, with an
// invented transcript that is spoken a word at a time with silences between, so the
// orb's flight between the dock and the box can be watched too. Nothing real reads
// this and it changes nothing the agent does.

import type { SubtitleSource } from "@/ui/voice-subtitles";
import type { AgentVoiceView, VoiceStage } from "@/ui/workbench/contracts";

/**
 * When the page was opened. The demonstration runs from there, so it begins at its start every
 * time: the voice idle, then starting, and the script at its first word.
 */
const OPENED_AT = Date.now();

/** The stages the cycle visits, and how long each lasts in milliseconds. */
const CYCLE: readonly (readonly [VoiceStage, number])[] = [
	["idle", 3000],
	["preparing", 1000],
	["connecting", 1000],
	["listening", 2000],
	["speaking", 7000],
	["muted", 2000],
	["stopping", 1000],
];

/** Whether the page was opened asking for the cycle. Read once, before the address is rewritten. */
const VOICE_DEMO_CYCLE: boolean =
	typeof window !== "undefined" &&
	new URLSearchParams(window.location.search).get("voiceDemo") === "cycle";

/** Whether the page was opened asking for any demonstration of the voice. Read once, before the address is rewritten. */
const VOICE_DEMONSTRATING: boolean =
	typeof window !== "undefined" && new URLSearchParams(window.location.search).has("voiceDemo");

/** What the demonstration's voice says, one utterance after another. */
const DEMO_SCRIPT: readonly string[] = [
	"The reservation ledger sets items aside only while an order is open, so a stock count can never go below zero.",
	"Warehouse sync runs every five minutes and sets each count to what the warehouse reports.",
	"If the two disagree, the warehouse wins, and the ledger keeps the difference as a note.",
];
/** How many words a second the demonstration speaks, and how long it is quiet after each utterance. */
const WORDS_PER_S = 2.8;
/** Longer than a subtitle lingers, so the words fade and the box shows the voice's state in a word. */
const QUIET_MS = 4800;

/**
 * How long one utterance of the script takes, with the quiet after it.
 * @param index Which utterance.
 * @returns The time in milliseconds.
 */
function utteranceMs(index: number): number {
	return ((DEMO_SCRIPT[index]?.split(" ").length ?? 0) / WORDS_PER_S) * 1000 + QUIET_MS;
}

/** How much of the script the demonstration has said at a time. */
interface DemoSaid {
	/** Which utterance it is in. */
	readonly index: number;
	/** How many words of it are out. */
	readonly words: number;
}

/**
 * How much of the script has been said at a time: it goes round again and again.
 * @param now The time in milliseconds.
 * @returns Which utterance, and how many of its words.
 */
function demoSaidAt(now: number): DemoSaid {
	const length = DEMO_SCRIPT.reduce((sum, _, index) => sum + utteranceMs(index), 0);
	let left = Math.max(0, now - OPENED_AT) % length;
	for (const [index, text] of DEMO_SCRIPT.entries()) {
		const ms = utteranceMs(index);
		if (left < ms) {
			const total = text.split(" ").length;
			return { index, words: Math.min(total, Math.floor((left / 1000) * WORDS_PER_S)) };
		}
		left -= ms;
	}
	return { index: 0, words: 0 };
}

/**
 * The transcript of the demonstration once it has said some of the script.
 * @param said How much of the script is out.
 * @returns The transcript: the one utterance, still being said.
 */
function demoTranscript(said: DemoSaid): readonly SubtitleSource[] {
	const words = (DEMO_SCRIPT[said.index] ?? "").split(" ").slice(0, said.words);
	return [
		{ itemId: `demo-${said.index}`, speaker: "assistant", text: words.join(" "), final: false },
	];
}

/** How long a word is, and how long of it is sounded, in seconds. */
const WORD_S = 1.35;
const SOUNDED = 0.78;
/** How long a syllable is, in seconds. */
const SYLLABLE_S = 0.17;
/** How loud the demonstration speaks, as the meter would read it. */
const LOUDNESS = 0.26;

/**
 * A level that moves as speech does: words with a breath between them, and
 * syllables inside each word.
 * @param seconds The time.
 * @returns A level in 0..1.
 */
function speechLevel(seconds: number): number {
	const sounding = (seconds % WORD_S) / WORD_S < SOUNDED ? 1 : 0;
	const syllable = Math.max(0, Math.sin(Math.PI * ((seconds / SYLLABLE_S) % 1))) ** 0.7;
	const swell = 0.65 + 0.35 * Math.sin(seconds * 1.9);
	return LOUDNESS * sounding * syllable * swell + 0.01;
}

/** The level of a voice that is heard speaking, as the meter would read it. */
const SPEAKING_LEVEL: AgentVoiceView["level"] = {
	/**
	 * The level now.
	 * @returns The level of speech at this moment.
	 */
	read: () => speechLevel(performance.now() / 1000),
	/**
	 * Hear it move: the dock reads it on every frame, so there is nothing to tell.
	 * @returns How to stop hearing it.
	 */
	subscribe: () => () => undefined,
};

/** The level of a voice that is not speaking. */
const QUIET_LEVEL: AgentVoiceView["level"] = {
	/**
	 * The level now.
	 * @returns Silence.
	 */
	read: () => 0,
	/**
	 * Nothing to hear.
	 * @returns How to stop hearing nothing.
	 */
	subscribe: () => () => undefined,
};

/**
 * The stage the cycle is in at a time.
 * @param now The time in milliseconds.
 * @returns The stage.
 */
function stageAt(now: number): VoiceStage {
	const length = CYCLE.reduce((sum, [, ms]) => sum + ms, 0);
	let left = Math.max(0, now - OPENED_AT) % length;
	for (const [stage, ms] of CYCLE) {
		if (left < ms) return stage;
		left -= ms;
	}
	return "idle";
}

/**
 * The voice of the demonstration in a stage, with a level that speaks only while it speaks.
 * @param stage The stage.
 * @returns The voice.
 */
function demoVoiceIn(stage: VoiceStage): AgentVoiceView {
	return {
		stage,
		problem: null,
		busy: false,
		level: stage === "speaking" ? SPEAKING_LEVEL : QUIET_LEVEL,
	};
}

/**
 * The voice of the demonstration at a time: in the stage the cycle is in.
 * @param now The time in milliseconds.
 * @returns The voice.
 */
function demoVoiceAt(now: number): AgentVoiceView {
	return demoVoiceIn(stageAt(now));
}

export {
	SPEAKING_LEVEL,
	VOICE_DEMONSTRATING,
	VOICE_DEMO_CYCLE,
	demoSaidAt,
	demoTranscript,
	demoVoiceAt,
	demoVoiceIn,
	stageAt,
	type DemoSaid,
};
