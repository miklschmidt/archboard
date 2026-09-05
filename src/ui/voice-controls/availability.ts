// Which voice controls are offered for one session state. Pure, so the shell
// and the tests can ask the same question without rendering.

import type { VoiceControlsView, VoiceSessionState } from "@/ui/voice-controls/contracts";

/** One control's presentation: shown or not, and enabled or not. */
interface ControlAvailability {
	shown: boolean;
	enabled: boolean;
}

/** Every control the module renders, decided together. */
interface VoiceControlsAvailability {
	start: ControlAvailability;
	mute: ControlAvailability;
	unmute: ControlAvailability;
	stop: ControlAvailability;
	restart: ControlAvailability;
	/** The one-line state a person reads beside the controls. */
	stateText: string;
	/** True while the session carries audio either way. */
	live: boolean;
}

const HIDDEN: ControlAvailability = { shown: false, enabled: false };
const LIVE_STATES: ReadonlySet<VoiceSessionState> = new Set(["active", "recovering"]);
const STATE_TEXT: Record<VoiceSessionState, string> = {
	unavailable: "Voice unavailable",
	ready: "Voice ready",
	starting: "Starting voice",
	active: "Voice live",
	recovering: "Recovering voice",
	stopping: "Stopping voice",
	failed: "Voice failed",
};

/**
 * A control that is shown, and enabled unless a command is pending.
 * @param view The controls' inputs.
 * @returns The control's availability.
 */
function offered(view: VoiceControlsView): ControlAvailability {
	return { shown: true, enabled: !view.pending };
}

/**
 * Whether the session is carrying audio.
 * @param state The session state.
 * @returns True for active and recovering sessions.
 */
function isLiveVoice(state: VoiceSessionState): boolean {
	return LIVE_STATES.has(state);
}

/**
 * The state text, with the failure reason when there is one.
 * @param view The controls' inputs.
 * @returns A short phrase.
 */
function voiceStateText(view: VoiceControlsView): string {
	if (!view.available) {
		return STATE_TEXT.unavailable;
	}
	if (view.failure !== null) {
		return `${STATE_TEXT[view.sessionState]}: ${view.failure}`;
	}
	return STATE_TEXT[view.sessionState];
}

/**
 * The controls a live session offers: mute or unmute, stop, and restart.
 * @param view The controls' inputs.
 * @returns Availability for a live session.
 */
function liveControls(
	view: VoiceControlsView,
): Omit<VoiceControlsAvailability, "stateText" | "live"> {
	return {
		start: HIDDEN,
		mute: view.muted ? HIDDEN : offered(view),
		unmute: view.muted ? offered(view) : HIDDEN,
		stop: offered(view),
		restart: offered(view),
	};
}

/**
 * The one control an idle, transitional or failed session offers: start when
 * ready, stop while starting, restart after a failure, nothing while stopping.
 * @param state The session state.
 * @returns The control's name, or null when nothing is offered.
 */
function idleOffer(state: VoiceSessionState): "start" | "stop" | "restart" | null {
	const offers: Partial<Record<VoiceSessionState, "start" | "stop" | "restart">> = {
		ready: "start",
		starting: "stop",
		failed: "restart",
	};
	return offers[state] ?? null;
}

/**
 * The controls for a session that is not carrying audio.
 * @param view The controls' inputs.
 * @returns Availability for an idle, transitional or failed session.
 */
function idleControls(
	view: VoiceControlsView,
): Omit<VoiceControlsAvailability, "stateText" | "live"> {
	const offer = view.available ? idleOffer(view.sessionState) : null;
	return {
		start: offer === "start" ? offered(view) : HIDDEN,
		mute: HIDDEN,
		unmute: HIDDEN,
		stop: offer === "stop" ? offered(view) : HIDDEN,
		restart: offer === "restart" ? offered(view) : HIDDEN,
	};
}

/**
 * Which controls to show and enable for one view.
 * @param view The controls' inputs.
 * @returns Every control's availability plus the state text.
 */
function voiceControlsAvailability(view: VoiceControlsView): VoiceControlsAvailability {
	const live = view.available && isLiveVoice(view.sessionState);
	const controls = live ? liveControls(view) : idleControls(view);
	return { ...controls, stateText: voiceStateText(view), live };
}

export {
	isLiveVoice,
	voiceControlsAvailability,
	voiceStateText,
	type ControlAvailability,
	type VoiceControlsAvailability,
};
