// DEMONSTRATION: the voice the dock shows when the page asks for it. `?voiceDemo`
// holds the voice speaking, with a level that moves like speech, and
// `?voiceDemo=cycle` takes it through every stage again and again, so the dock's
// turn from the Talk key to the circle and back can be watched without Codex, a
// microphone or a turn. Nothing real reads this and it changes nothing the agent does.

import type { AgentVoiceView, VoiceStage } from "@/ui/workbench/contracts";

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
	let left = now % length;
	for (const [stage, ms] of CYCLE) {
		if (left < ms) return stage;
		left -= ms;
	}
	return "idle";
}

/**
 * The voice of the demonstration at a time: in the stage the cycle is in, with
 * a level that speaks only while it speaks.
 * @param now The time in milliseconds.
 * @returns The voice.
 */
function demoVoiceAt(now: number): AgentVoiceView {
	const stage = stageAt(now);
	return {
		stage,
		problem: null,
		busy: false,
		level: stage === "speaking" ? SPEAKING_LEVEL : QUIET_LEVEL,
	};
}

export { SPEAKING_LEVEL, VOICE_DEMO_CYCLE, demoVoiceAt };
