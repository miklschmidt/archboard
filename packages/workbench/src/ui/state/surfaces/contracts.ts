// What the agent surfaces show and what a person can do from them. The agent
// dock and the conversation panel read one `AgentView` and act through one
// `AgentActions`; the application composes both from the workbench owners.

import type {
	BrowserApproval,
	BrowserDynamicApproval,
	BrowserSnapshot,
} from "@archboard/codex-realtime-voice/contract";
import type { VoiceSignIn } from "@archboard/codex-realtime-voice/browser";
import type { ApprovalChoice } from "@archboard/codex-realtime-voice/controllers";
import type {
	DynamicApprovalVerdict,
	WorkbenchQueueActions,
} from "#ui/state/surfaces/voice-parts.ts";
import type { AgentSetupSnapshot } from "#ui/state/agent-setup/setup.ts";
import type { Conversation } from "#ui/hooks/runtime/use-agent-runtime.ts";

/** Where live voice stands, as the Talk control shows it. */
type VoiceStage =
	| "idle"
	| "preparing"
	| "connecting"
	| "listening"
	| "speaking"
	| "muted"
	| "stopping";

/** The voice as the agent dock shows it. */
interface AgentVoiceView {
	readonly stage: VoiceStage;
	/** Why voice cannot start, or why it failed, in one sentence; null when nothing is wrong. */
	readonly problem: string | null;
	/** A control is on the wire. */
	readonly busy: boolean;
	/**
	 * The model's output level, for the meter and for whether the model is audible:
	 * the session never learns its turn phases. A source rather than a value: it
	 * changes on every frame while the model speaks, so only what draws it reads it.
	 */
	readonly level: VoiceLevel;
}

/** The model's output level, heard where it is drawn. */
interface VoiceLevel {
	/**
	 * The level now.
	 * @returns 0..1.
	 */
	readonly read: () => number;
	/**
	 * Hear it change, on every frame while the model speaks.
	 * @param listener Called after each change.
	 * @returns How to stop hearing it.
	 */
	readonly subscribe: (listener: () => void) => () => void;
}

/** Everything the agent surfaces show. */
interface AgentView {
	/** Where the agent stands and what the person's held work waits on. */
	readonly setup: AgentSetupSnapshot;
	/** The published snapshot, or null before one arrives. */
	readonly snapshot: BrowserSnapshot | null;
	readonly conversation: Conversation;
	readonly voice: AgentVoiceView;
	/** Keys of approvals whose decision is on the wire. */
	readonly busyApprovals: readonly string[];
	/** Why a decision was refused, by approval key. */
	readonly approvalErrors: Readonly<Record<string, string>>;
	/** When the running turn last reported anything new, or null while none runs. */
	readonly lastProgressAtMs: number | null;
}

/** Everything a person can do from the agent surfaces. */
interface AgentActions {
	/**
	 * Send a message and show the conversation: steered into a running turn,
	 * queued when asked.
	 * @param text The message.
	 * @param queue Whether to run it after the current turn instead.
	 */
	readonly send: (text: string, queue: boolean) => void;
	/** Start voice, setting up whatever is missing. */
	readonly talk: () => void;
	readonly mute: () => void;
	readonly unmute: () => void;
	readonly endVoice: () => void;
	/** Interrupt the running turn. */
	readonly stop: () => void;
	/**
	 * Sign in to Archboard's own Codex.
	 * @param login The provider and its credentials.
	 */
	readonly signIn: (login: VoiceSignIn) => void;
	readonly cancelSignIn: () => void;
	readonly signOut: () => void;
	readonly newConversation: () => void;
	/**
	 * Send a held message again.
	 * @param id The held message.
	 */
	readonly retry: (id: string) => void;
	/**
	 * Take a held message back into the composer.
	 * @param id The held message.
	 */
	readonly edit: (id: string) => void;
	readonly respondToApproval: (approval: BrowserApproval, choice: ApprovalChoice) => void;
	readonly respondToDynamicApproval: (
		approval: BrowserDynamicApproval,
		verdict: DynamicApprovalVerdict,
	) => void;
	readonly queue: WorkbenchQueueActions;
	/** Show the conversation panel. */
	readonly openPanel: () => void;
	/**
	 * Show the conversation of one of the tab's workhorses, picked from the dock's list.
	 * @param checkout The checkout it works in.
	 */
	readonly showConversation: (checkout: string) => void;
}

export type { AgentActions, AgentView, AgentVoiceView, VoiceLevel, VoiceStage };
