// Every word the voice panel shows, in English. A host replaces any of them through
// `mountVoice`'s `text` option.

import type { RealtimePhase } from "#shared/protocol/realtime-contract.ts";
import type { VoiceClientSnapshot } from "#ui/voice-client/state/contract.ts";

/** The words of the voice panel. */
interface VoicePanelText {
	/** The panel's accessible name. */
	readonly panel: string;
	/** While no socket is open, or the socket is being opened again. */
	readonly connecting: string;
	/** While the agent's Codex account is signed out. */
	readonly signedOut: string;
	readonly signIn: string;
	readonly continueSignIn: string;
	readonly signedIn: string;
	/** The status line while connected and signed in. */
	readonly voice: (phase: RealtimePhase) => string;
	readonly startVoice: string;
	readonly stopVoice: string;
	/** The accessible name of the transcript of what was said. */
	readonly transcript: string;
	/** The accessible name of the workhorse's messages. */
	readonly work: string;
	/** The label of the message field. */
	readonly message: string;
	readonly send: string;
	readonly stopWork: string;
	/** Reads the state again after an uncertain delivery. */
	readonly refresh: string;
	/** The question of a command approval. */
	readonly runCommand: string;
	/** The label of one decision of a command approval. */
	readonly decision: (decision: string) => string;
	/** An approval of a kind the panel does not answer. */
	readonly unanswerable: (kind: string) => string;
}

const DECISIONS: Readonly<Record<string, string>> = Object.freeze({
	accept: "Run",
	acceptForSession: "Run for this session",
	decline: "Decline",
	cancel: "Cancel",
});

/** The panel's English words. */
const ENGLISH: VoicePanelText = Object.freeze<VoicePanelText>({
	panel: "Voice agent",
	connecting: "Connecting to the voice agent.",
	signedOut: "Sign in to talk to Codex.",
	signIn: "Sign in with ChatGPT",
	continueSignIn: "Continue sign-in",
	signedIn: "I signed in",
	/**
	 * The voice status.
	 * @param phase Where the voice run stands.
	 * @returns The words.
	 */
	voice: (phase) => `Voice: ${phase.replaceAll("_", " ")}.`,
	startVoice: "Start voice",
	stopVoice: "Stop voice",
	transcript: "What was said",
	work: "Work",
	message: "Message to the workhorse",
	send: "Send",
	stopWork: "Stop work",
	refresh: "Refresh",
	runCommand: "Run this command?",
	/**
	 * A decision's label.
	 * @param decision The decision Codex offers.
	 * @returns The words.
	 */
	decision: (decision) => DECISIONS[decision] ?? decision,
	/**
	 * An approval the panel does not answer.
	 * @param kind The approval's kind.
	 * @returns The words.
	 */
	unanswerable: (kind) =>
		`Codex asks a ${kind.replaceAll("_", " ")} question that this panel does not answer.`,
});

/**
 * The status line of a state.
 * @param state The client's state.
 * @param text The panel's words.
 * @returns The words.
 */
function statusOf(state: VoiceClientSnapshot, text: VoicePanelText): string {
	if (state.connection !== "connected" || state.server === null) return text.connecting;
	if (state.server.account.state !== "ready") return text.signedOut;
	return text.voice(state.voice.phase);
}

export { ENGLISH, statusOf, type VoicePanelText };
