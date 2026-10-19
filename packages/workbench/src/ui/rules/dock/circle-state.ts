// What the voice's circle shows, and what pressing it does, from the voice's stage.

import type { OrbMode } from "#ui/rules/orb/orb-dynamics.ts";
import type { AgentActions, AgentVoiceView, VoiceStage } from "#ui/state/surfaces/contracts.ts";

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

/**
 * The stages in which voice can be ended: from the moment it connects, so a session stuck
 * connecting or recovering can always be ended. While the setup is still preparing there is no
 * session to end yet.
 */
const ENDABLE: ReadonlySet<VoiceStage> = new Set(["connecting", "listening", "speaking", "muted"]);

/**
 * What a press of a voice key does, for every key that starts and ends voice: start it while it
 * is off, end it once it connects, and nothing while a control is on the wire, while voice is on
 * its way to connecting or while it ends. A key that does nothing says so with aria-disabled,
 * not disabled: a disabled button drops the keyboard's place.
 * @param voice The voice.
 * @param actions The actions.
 * @returns The action, or undefined while a press does nothing.
 */
function voicePress(voice: AgentVoiceView, actions: AgentActions): (() => void) | undefined {
	if (voice.busy) return undefined;
	if (voice.stage === "idle") return actions.talk;
	return ENDABLE.has(voice.stage) ? actions.endVoice : undefined;
}

export { CIRCLE_NAMES, ENDABLE, VOICE_WORDS, circleState, voicePress, type CircleState };
