import { useSyncExternalStore } from "react";

import type { VoiceSession, VoiceSessionView } from "../contract.js";

/**
 * A thin projection over the adapter's own subscription. It reads the memoized
 * view the adapter already published — it computes nothing, owns nothing, and
 * starts nothing — so React never becomes a second source of voice state.
 */
export function useVoiceSession(session: VoiceSession): VoiceSessionView {
	return useSyncExternalStore(session.subscribe, session.view, session.view);
}
