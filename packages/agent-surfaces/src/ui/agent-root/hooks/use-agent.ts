// What the agent's root offers the surfaces below it, in four parts that change at different
// rates, so a surface draws again only for what it reads (TASK-385.03): the surfaces' state, which
// changes when the person acts or the voice moves to another stage; the voice and the panel as the
// shell reads them; and what a pane needs to hand over its conversation and lay the voice over its
// picture, which changes only when the voice moves to another pane.

import { createContext, useContext } from "react";

import type { AgentOwners, PaneRegistry } from "#ui/agent-root/hooks/use-agent-owners.ts";
import type { AgentPanelState } from "#ui/agent-root/hooks/use-panel-state.ts";
import type { VoiceFeed } from "#ui/agent-root/rules/subtitled-transcript.ts";
import type { AgentReadiness, VoiceStanding } from "#ui/agent-root/rules/voice-standing.ts";
import type { VoiceStart } from "#ui/agent-root/clients/agent-setup-ports.ts";
import type {
	AgentActions,
	AgentVoiceView,
	VoiceLevel,
	VoiceStage,
} from "#ui/workbench-client/surfaces/state/contracts.ts";
import type { DraftStore } from "#ui/workbench-client/surfaces/state/draft-store.ts";
import type { BrowserSnapshot } from "@archboard/codex-realtime-voice/contract";

/** What the dock, the panel and the voice key draw from. */
interface AgentSurfaceState {
	readonly agent: AgentOwners;
	readonly voice: AgentVoiceView;
	readonly actions: AgentActions;
	readonly draft: DraftStore;
	readonly panel: AgentPanelState;
}

/** What the voice has said: read when wanted, and heard as it changes. */
interface VoiceTranscript {
	/**
	 * What the voice has said so far, oldest first.
	 * @returns The transcript.
	 */
	readonly read: () => readonly BrowserSnapshot["voice"]["transcript"][number][];
	/**
	 * Hear it change.
	 * @param listener Called after each change.
	 * @returns How to stop hearing it.
	 */
	readonly subscribe: (listener: () => void) => () => void;
}

/** The voice as the shell reads it: what starts and ends it, and where it stands. */
interface AgentVoice {
	/**
	 * Start voice for a pane, once the voice is on that pane: the shell makes the pane the active
	 * one first. Nothing starts while voice runs, and a start whose pane the person left before the
	 * voice followed is dropped.
	 * @param paneId The pane.
	 * @param walkthrough The walkthrough to narrate, or none for a conversation.
	 * @param recording The recording that paces the narration, when a page records it.
	 */
	readonly talk: (
		paneId: string,
		walkthrough?: string,
		recording?: VoiceStart["recording"],
	) => void;
	/** End the voice. */
	readonly stop: () => Promise<void>;
	/**
	 * Whether voice can be started now.
	 * @returns Ready, waiting, or refused with what to do.
	 */
	readonly readiness: () => AgentReadiness;
	/** Where getting voice going stands, or what the live voice is doing. */
	readonly stage: VoiceStage;
	/**
	 * Whether the voice is live, failed, or neither.
	 * @returns The standing.
	 */
	readonly standing: () => VoiceStanding;
	/** The model's output level, heard where it is drawn. */
	readonly level: VoiceLevel;
	/**
	 * Whether the model is audible now, by its measured output.
	 * @returns True while it is.
	 */
	readonly audible: () => boolean;
	readonly transcript: VoiceTranscript;
}

/** The conversation panel as the shell reads it. */
interface AgentPanelHandle {
	/** Whether the conversation is open. */
	readonly open: boolean;
	/** Close the conversation. */
	readonly close: () => void;
	/**
	 * Send the agent a message from the pane in front of the person and show the conversation:
	 * the conversation of a named checkout, shown first; the focused pane's own otherwise.
	 * @param text The message.
	 * @param checkout The checkout whose agent is asked, when not the focused pane's.
	 * @returns False when the named checkout could not be shown, and nothing was sent.
	 */
	readonly ask: (text: string, checkout?: string) => Promise<boolean>;
	/**
	 * Show the conversation of the focused pane's checkout with the text in its composer, for the
	 * person to send.
	 * @param text The text.
	 */
	readonly fill: (text: string) => void;
}

/** What a pane hands over and lays over its picture. */
interface PaneVoiceState {
	readonly panes: PaneRegistry;
	/** The pane the voice is laid over. */
	readonly overlayPaneId: string;
	/** Where that pane hears the voice. */
	readonly feed: VoiceFeed;
}

const SurfaceContext = createContext<AgentSurfaceState | null>(null);
const VoiceContext = createContext<AgentVoice | null>(null);
const PanelContext = createContext<AgentPanelHandle | null>(null);
const PaneVoiceContext = createContext<PaneVoiceState | null>(null);

/**
 * A context's value, which only an `AgentRoot` above offers.
 * @param value The value, or null outside a root.
 * @param name What asked for it.
 * @returns The value.
 * @throws {Error} Outside an `AgentRoot`.
 */
function offered<T>(value: T | null, name: string): T {
	if (value === null) throw new Error(`${name} reads the agent: place it inside an AgentRoot.`);
	return value;
}

/**
 * The surfaces' state, or null outside an `AgentRoot`.
 * @returns The state.
 */
function useSurfaceState(): AgentSurfaceState | null {
	return useContext(SurfaceContext);
}

/**
 * The voice as the shell reads it. Its values are read through functions where they change while
 * the voice speaks, so a shell that holds it is not drawn again for every word.
 * @returns The voice.
 * @throws {Error} Outside an `AgentRoot`.
 */
function useAgentVoice(): AgentVoice {
	return offered(useContext(VoiceContext), "useAgentVoice");
}

/**
 * The conversation panel as the shell reads it: whether it is open, and the ways to ask the agent.
 * @returns The panel.
 * @throws {Error} Outside an `AgentRoot`.
 */
function useAgentPanel(): AgentPanelHandle {
	return offered(useContext(PanelContext), "useAgentPanel");
}

/**
 * What a pane hands over and lays over its picture.
 * @returns The pane's part of the agent.
 * @throws {Error} Outside an `AgentRoot`.
 */
function usePaneVoice(): PaneVoiceState {
	return offered(useContext(PaneVoiceContext), "AgentPane");
}

export {
	PanelContext,
	PaneVoiceContext,
	SurfaceContext,
	VoiceContext,
	useAgentPanel,
	useAgentVoice,
	usePaneVoice,
	useSurfaceState,
	type AgentPanelHandle,
	type AgentSurfaceState,
	type AgentVoice,
	type PaneVoiceState,
	type VoiceTranscript,
};
