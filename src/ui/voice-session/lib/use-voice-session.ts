import { useSyncExternalStore } from "react";

import type { VoiceSession, VoiceSessionView } from "../contract.js";

/**
 * A thin projection over the adapter's own subscription. It reads the memoized
 * view the adapter already published — it computes nothing, owns nothing, and
 * starts nothing — so React never becomes a second source of voice state.
 *
 * The microphone level is deliberately not here: `useVoiceLevel` reads it from
 * its own channel so a meter animating at sixty frames a second re-renders the
 * meter and nothing else.
 */
export function useVoiceSession(session: VoiceSession): VoiceSessionView {
	return useSyncExternalStore(session.subscribe, session.view, session.view);
}

/**
 * The microphone level, 0 to 1. Subscribe to it only where the level is drawn:
 * it changes on every animation frame the realtime meter runs.
 */
export function useVoiceLevel(session: VoiceSession): number {
	return useSyncExternalStore(session.subscribeLevel, session.level, session.level);
}
