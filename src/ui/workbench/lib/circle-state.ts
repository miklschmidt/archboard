// What the voice's circle shows, and what pressing it does, from the voice's stage.

import type { OrbMode } from "@/ui/voice-orb";
import type { AgentVoiceView } from "@/ui/workbench/contracts";

/** What the circle shows, from the voice's stage. */
type CircleState = OrbMode;

/** What the circle shows for each stage of the voice, where the stage alone decides it. */
const STAGE_STATES: Partial<Readonly<Record<AgentVoiceView["stage"], CircleState>>> = {
	idle: "off",
	preparing: "starting",
	connecting: "starting",
	stopping: "ending",
	muted: "muted",
	speaking: "speaking",
};

/**
 * What the circle shows for a voice: its stage, else whether the model is
 * audible by its measured output, which is how a listening voice is heard to speak.
 * @param voice The voice.
 * @param audible Whether the model is audible now.
 * @returns The state.
 */
function circleState(voice: AgentVoiceView, audible: boolean): CircleState {
	return STAGE_STATES[voice.stage] ?? (audible ? "speaking" : "listening");
}

/** What pressing the control does, said as its name. */
const CIRCLE_NAMES: Readonly<Record<CircleState, string>> = {
	off: "Talk",
	starting: "End voice",
	listening: "End voice",
	speaking: "End voice",
	muted: "End voice",
	ending: "Ending voice",
};

/** What the voice is doing, in a word, for the dock's voice line and the voice box. */
const VOICE_WORDS: Readonly<Record<CircleState, string>> = {
	off: "Voice is off",
	starting: "Starting",
	listening: "Listening",
	speaking: "Speaking",
	muted: "Muted",
	ending: "Ending",
};

export { CIRCLE_NAMES, VOICE_WORDS, circleState, type CircleState };
