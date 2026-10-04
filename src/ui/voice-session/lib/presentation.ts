// The seam to the committed voice controls: their view, derived from the
// projected session view.

import type { VoiceControlsView, VoiceSessionState } from "@/ui/voice-controls/contracts";
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

export { voiceControlsView };
