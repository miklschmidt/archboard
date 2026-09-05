// Thin React projections over the adapter's own subscriptions. They read the
// memoized values the adapter already published: they compute nothing, own
// nothing, and start nothing, so React never becomes a second source of voice
// state. The level has its own hook so a wave animating at sixty frames a
// second re-renders the wave and nothing else.

import { useSyncExternalStore } from "react";

import type { VoiceSession, VoiceSessionView } from "@/ui/voice-session/contract";

/**
 * The adapter's current view.
 * @param session The adapter.
 * @returns The view.
 */
function useVoiceSession(session: VoiceSession): VoiceSessionView {
	return useSyncExternalStore(session.subscribe, session.view, session.view);
}

/**
 * The measured model output level, 0..1.
 * @param session The adapter.
 * @returns The level.
 */
function useVoiceLevel(session: VoiceSession): number {
	return useSyncExternalStore(session.subscribeLevel, session.level, session.level);
}

export { useVoiceLevel, useVoiceSession };
