// The voice controls' typed inputs and callbacks. Everything shown comes in
// through `VoiceControlsView`; everything a person does goes out through
// `VoiceControlsActions`. The module keeps no session state of its own.

import type { BrowserVoice } from "@/shared/codex-browser-model";

/** The live voice session's state as the browser model publishes it. */
type VoiceSessionState = BrowserVoice["state"];

/** What the voice controls show. */
interface VoiceControlsView {
	/** False when this pane cannot start voice at all: no coordinator, no realtime host. */
	available: boolean;
	sessionState: VoiceSessionState;
	muted: boolean;
	/** A start, stop, mute or restart command is on the wire and not yet settled. */
	pending: boolean;
	/** Plain words for the last failed command, or null when nothing failed. */
	failure: string | null;
}

/** What a person can ask the voice session to do. */
interface VoiceControlsActions {
	start: () => void;
	mute: () => void;
	unmute: () => void;
	stop: () => void;
	restart: () => void;
}

export type { VoiceControlsActions, VoiceControlsView, VoiceSessionState };
