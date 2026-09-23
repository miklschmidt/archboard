// The voice as the agent bar shows it: where getting voice going stands or
// what the live voice is doing, why it failed, and the model's output level
// for the meter. Read from the voice session adapter and the agent setup; a
// voice that is merely not set up yet is not a problem, because Talk sets it up.

import { useSyncExternalStore } from "react";

import type { AgentSetupSnapshot } from "@/ui/agent-setup";
import type { VoiceOwner } from "@/ui/application/hooks/use-workbench";
import type { VoiceSessionStatus, VoiceSessionView } from "@/ui/voice-session";
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

/**
 * Nothing to listen to without a voice session.
 * @returns How to stop listening.
 */
function subscribeToNothing(): () => void {
	return () => undefined;
}

/**
 * No view without a voice session.
 * @returns Null.
 */
function noView(): null {
	return null;
}

/**
 * No level without a voice session.
 * @returns Silence.
 */
function silence(): number {
	return 0;
}

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
	const session = voice?.session ?? null;
	const view = useSyncExternalStore(
		session?.subscribe ?? subscribeToNothing,
		session?.view ?? noView,
		session?.view ?? noView,
	);
	const level = useSyncExternalStore(
		session?.subscribeLevel ?? subscribeToNothing,
		session?.level ?? silence,
		session?.level ?? silence,
	);
	return {
		stage: stageOf(view, setup.talk),
		problem: problemOf(view, setup),
		busy: view?.busy ?? false,
		level,
	};
}

export { useVoiceView };
