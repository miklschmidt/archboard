// DEMONSTRATION: the voice and the words the page shows when it is opened with
// `?voiceDemo` (lib/voice-demo.ts), read the way the real ones are read.

import { useMemo } from "react";

import { VOICE_DEMO_TICK_MS } from "@/shared/timing/voice";
import { useClock } from "@/ui/components/use-clock";
import type { SubtitleSource } from "@/ui/voice-subtitles";
import type { AgentVoiceView } from "@/ui/workbench/contracts";
import { DEMO_VOICE } from "@/ui/workbench/lib/plan-steps";
import {
	VOICE_DEMO_CYCLE,
	demoSaidAt,
	demoTranscript,
	demoVoiceIn,
	stageAt,
} from "@/ui/workbench/lib/voice-demo";

/**
 * What the demonstration's voice has said, a word at a time.
 * @returns The transcript.
 */
function useDemoTranscript(): readonly SubtitleSource[] {
	const now = useClock(VOICE_DEMO_TICK_MS);
	const { index, words } = demoSaidAt(now);
	return useMemo(() => demoTranscript({ index, words }), [index, words]);
}

/**
 * The demonstration's voice: holding still, speaking, or going through the stages.
 * @returns The voice.
 */
function useDemoVoice(): AgentVoiceView {
	const now = useClock(VOICE_DEMO_TICK_MS);
	const stage = VOICE_DEMO_CYCLE ? stageAt(now) : null;
	return useMemo(() => (stage === null ? DEMO_VOICE : demoVoiceIn(stage)), [stage]);
}

export { useDemoTranscript, useDemoVoice };
