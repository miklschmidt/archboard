// The voice as the agent bar shows it: where getting voice going stands or
// what the live voice is doing, why it failed, and the model's output level
// for the meter. Read from the voice session adapter and the agent setup; a
// voice that is merely not set up yet is not a problem, because Talk sets it up.

import { useSyncExternalStore } from "react";

import type { AgentSetupSnapshot } from "@/ui/agent-setup";
import type { VoiceOwner } from "@/ui/application/lib/workbench-owners";
import type { VoiceSession, VoiceSessionStatus, VoiceSessionView } from "@/ui/voice-session";
import type { AgentVoiceView, VoiceStage } from "@/ui/workbench/contracts";

/** The stage each session status is at. */
const STAGES: Readonly<Record<VoiceSessionStatus, VoiceStage>> = {
	unavailable: "idle",
	ready: "idle",
	requesting_permission: "connecting",
	negotiating: "connecting",
	listening: "listening",
	processing: "listening",
	agent_speaking: "speaking",
	muted: "muted",
	recovering: "connecting",
	stopping: "stopping",
	stopped: "idle",
	failed: "idle",
};

/** What the bar reads from a voice session, or from its absence. */
interface VoiceSource {
	readonly subscribe: VoiceSession["subscribe"];
	readonly view: () => VoiceSessionView | null;
	readonly subscribeLevel: VoiceSession["subscribeLevel"];
	readonly level: VoiceSession["level"];
}

/**
 * Nothing to listen to without a voice session.
 * @returns How to stop listening.
 */
function subscribeToNothing(): () => void {
	return () => undefined;
}

/** No voice session: no view, silence. */
const NO_SESSION: VoiceSource = Object.freeze({
	subscribe: subscribeToNothing,
	/**
	 * No view without a voice session.
	 * @returns Null.
	 */
	view: () => null,
	subscribeLevel: subscribeToNothing,
	/**
	 * No level without a voice session.
	 * @returns Silence.
	 */
	level: () => 0,
});

/**
 * The stage, counting a Talk the setup is still getting ready.
 * @param view The session's view, or null.
 * @param talk Where the setup's Talk stands.
 * @returns The stage.
 */
function stageOf(view: VoiceSessionView | null, talk: AgentSetupSnapshot["talk"]): VoiceStage {
	const stage = view === null ? "idle" : STAGES[view.status];
	return stage === "idle" && talk !== "idle" ? "preparing" : stage;
}

/**
 * Why voice failed, in one sentence, or null.
 * @param view The session's view, or null.
 * @param setup The agent setup, whose failure a Talk that could not start reports.
 * @returns The sentence, or null.
 */
function problemOf(view: VoiceSessionView | null, setup: AgentSetupSnapshot): string | null {
	if (view?.status === "failed") return view.failure?.message ?? view.detail;
	return setup.talkFailure;
}

/**
 * The voice as the agent bar shows it.
 * @param voice The voice session and its pane, or null.
 * @param setup The agent setup.
 * @returns The voice view.
 */
function useVoiceView(voice: VoiceOwner | null, setup: AgentSetupSnapshot): AgentVoiceView {
	const source: VoiceSource = voice?.session ?? NO_SESSION;
	const view = useSyncExternalStore(source.subscribe, source.view, source.view);
	const level = useSyncExternalStore(source.subscribeLevel, source.level, source.level);
	return {
		stage: stageOf(view, setup.talk),
		problem: problemOf(view, setup),
		busy: view?.busy === true,
		level,
	};
}

export { useVoiceView };
