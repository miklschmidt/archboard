// Whether the model is audible now, as a surface that draws the voice reads it.

import { useSyncExternalStore } from "react";

import { VOICE_OUTPUT_SPEAKING_LEVEL } from "@archboard/codex-realtime-voice/browser";
import type { AgentVoiceView, VoiceStage } from "#ui/state/surfaces/contracts.ts";

/** The stages in which the model's measured output can make it audible. */
const LIVE_STAGES: ReadonlySet<VoiceStage> = new Set(["listening", "speaking", "muted"]);

/**
 * Whether the model is audible now, by its measured output. It is heard as a yes
 * or no, so the control is drawn again when that flips, not on every frame the
 * level moves.
 * @param voice The voice.
 * @returns True while a live voice's output is over the speaking level.
 */
function useAudible(voice: AgentVoiceView): boolean {
	const { level } = voice;
	/**
	 * Whether the output is over the speaking level now.
	 * @returns True when it is.
	 */
	const loud = (): boolean => level.read() >= VOICE_OUTPUT_SPEAKING_LEVEL;
	const overSpeaking = useSyncExternalStore(level.subscribe, loud, loud);
	return LIVE_STAGES.has(voice.stage) && overSpeaking;
}

export { useAudible };
