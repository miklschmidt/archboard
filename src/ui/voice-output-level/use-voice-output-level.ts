// The React projection over a level source: subscribe where the wave is drawn
// and nowhere else, because the level moves on every animation frame.

import { useSyncExternalStore } from "react";

import type { VoiceOutputLevelSource } from "@/ui/voice-output-level/lib/level-source";

/**
 * The measured model output level, 0..1, re-rendering only the caller.
 * @param source The level source.
 * @returns The latest level.
 */
function useVoiceOutputLevel(source: VoiceOutputLevelSource): number {
	return useSyncExternalStore(source.subscribe, source.current, source.current);
}

export { useVoiceOutputLevel };
