// What the voice surfaces' tests are given: a voice in a stage, and actions that do nothing or
// say what was pressed.

import type { AgentActions, AgentVoiceView } from "@/ui/workbench/contracts";

/** Nothing happens: the test presses nothing. */
function nothing(): void {
	// No control is used here.
}

/** Actions that do nothing, for a surface nobody presses. */
const IDLE_ACTIONS: AgentActions = {
	send: nothing,
	talk: nothing,
	mute: nothing,
	unmute: nothing,
	endVoice: nothing,
	stop: nothing,
	signIn: nothing,
	cancelSignIn: nothing,
	signOut: nothing,
	newConversation: nothing,
	retry: nothing,
	edit: nothing,
	respondToApproval: nothing,
	respondToDynamicApproval: nothing,
	queue: { moveUp: nothing, moveDown: nothing, remove: nothing, sendNow: nothing },
	openPanel: nothing,
	showConversation: nothing,
};

/** A voice that makes no sound. */
const SILENT: AgentVoiceView["level"] = {
	/**
	 * The level of a voice that is not on.
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
 * A voice in a stage, with nothing wrong and nothing on the wire.
 * @param stage The stage.
 * @param busy Whether a control is on the wire.
 * @returns The voice.
 */
function voiceIn(stage: AgentVoiceView["stage"], busy = false): AgentVoiceView {
	return { stage, problem: null, busy, level: SILENT };
}

/**
 * Actions that record what was pressed, by name.
 * @param pressed Where the names go.
 * @returns The actions.
 */
function recordingActions(pressed: string[]): AgentActions {
	return {
		...IDLE_ACTIONS,
		/** Talk was pressed. */
		talk: () => {
			pressed.push("talk");
		},
		/** Mute was pressed. */
		mute: () => {
			pressed.push("mute");
		},
		/** Unmute was pressed. */
		unmute: () => {
			pressed.push("unmute");
		},
		/** End was pressed. */
		endVoice: () => {
			pressed.push("endVoice");
		},
	};
}

export { IDLE_ACTIONS, SILENT, nothing, recordingActions, voiceIn };
