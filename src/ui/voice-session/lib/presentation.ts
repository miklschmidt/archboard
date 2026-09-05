// The seams to the committed presentation: the voice controls' view and the
// output wave's inputs, both derived from the projected session view.

import type { RealtimePhase } from "@/ui/codex-realtime";
import type { VoiceControlsView, VoiceSessionState } from "@/ui/voice-controls/contracts";
import { projectVoiceOutputWave } from "@/ui/voice-output-level";
import type { VoiceOutputWaveView } from "@/ui/voice-output-level";
import type { VoiceSessionStatus, VoiceSessionView } from "@/ui/voice-session/contract";

/** The browser model's voice state each presented status maps onto. */
const CONTROL_STATES = {
	unavailable: "unavailable",
	ready: "ready",
	requesting_permission: "starting",
	negotiating: "starting",
	listening: "active",
	muted: "active",
	processing: "active",
	agent_speaking: "active",
	recovering: "recovering",
	stopping: "stopping",
	stopped: "ready",
	failed: "failed",
} as const satisfies Record<VoiceSessionStatus, VoiceSessionState>;

/**
 * The voice controls' inputs for one projected view.
 * @param view The projected session view.
 * @returns What the controls show.
 */
function voiceControlsView(view: VoiceSessionView): VoiceControlsView {
	return Object.freeze({
		available: view.status !== "unavailable",
		sessionState: CONTROL_STATES[view.status],
		muted: view.status === "muted",
		pending: view.busy,
		failure: view.failure?.message ?? null,
	});
}

/**
 * The output wave's inputs for one realtime phase and measured level.
 * @param phase The realtime phase, or null with no run.
 * @param level The measured model output level.
 * @returns The wave inputs.
 */
function voiceWaveView(phase: RealtimePhase | null, level: number): VoiceOutputWaveView {
	return projectVoiceOutputWave(phase, level);
}

export { voiceControlsView, voiceWaveView };
