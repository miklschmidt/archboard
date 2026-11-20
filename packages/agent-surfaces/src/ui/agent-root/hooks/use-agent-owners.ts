// The agent over the page's panes: each pane's hosted conversation of its
// current socket, which the pane registers as it mounts and withdraws as it is
// replaced or goes; the owners over the focused pane's conversation, which is
// the pane a message speaks from; one agent setup for the whole server, so a
// message waiting on sign-in survives the person clicking the other pane; and the
// voice session, which stays with the pane voice was started from until it ends,
// because its media belongs to that pane's socket. Voice is kept on a pane only
// once a start succeeded, and let go when that session ends in any way or its
// pane goes.

import {
	useCallback,
	useEffect,
	useMemo,
	useState,
	useSyncExternalStore,
	type Dispatch,
	type SetStateAction,
} from "react";

import { createAgentSetup, type AgentSetup } from "#ui/agent-setup/state/setup.ts";
import { createAgentFocus } from "#ui/agent-root/state/agent-focus.ts";
import { createVoiceStore } from "#ui/agent-root/state/voice-store.ts";
import { agentSetupPorts, releaseWhenVoiceEnds } from "#ui/agent-root/clients/agent-setup-ports.ts";
import {
	createWorkbenchOwners,
	type VoiceOwner,
	type WorkbenchOwners,
} from "#ui/agent-root/state/workbench-owners.ts";
import type { HostedConversation } from "@archboard/codex-realtime-voice/browser";

/** The hosted conversations by pane id, of the panes that registered one. */
type PaneConversations = Readonly<Record<string, HostedConversation>>;

/** What a pane tells the agent about itself. */
interface PaneRegistry {
	/**
	 * A pane's socket has a hosted conversation.
	 * @param paneId The pane.
	 * @param conversation The conversation of its current socket.
	 * @returns Withdraw this registration; a newer one of the pane stays.
	 */
	readonly register: (paneId: string, conversation: HostedConversation) => () => void;
	/**
	 * A pane is presented fullscreen, so the dock is off screen and the voice is laid over it.
	 * @param paneId The pane.
	 * @returns The pane is no longer presented.
	 */
	readonly undock: (paneId: string) => () => void;
	/**
	 * A pane went: voice kept on it follows focus again.
	 * @param paneId The pane.
	 */
	readonly gone: (paneId: string) => void;
}

/** The agent's state over the panes, and what the panes move. */
interface AgentOwners {
	/** The owners over the focused pane's conversation, or null while it has none. */
	readonly owners: WorkbenchOwners | null;
	/** The server-wide agent setup. */
	readonly setup: AgentSetup;
	/** The voice session, or null while its pane has no conversation. */
	readonly voice: VoiceOwner | null;
	/** Voice ended: let it follow the focused pane again. */
	readonly releaseVoice: () => void;
	/** The pane presented fullscreen, or null. */
	readonly docklessPane: string | null;
	readonly panes: PaneRegistry;
}

/**
 * A record without one key, or the same record when it has no such key.
 * @param record The record.
 * @param key The key.
 * @returns The record without it.
 */
function without(record: PaneConversations, key: string): PaneConversations {
	if (!(key in record)) return record;
	const rest: Record<string, HostedConversation> = { ...record };
	Reflect.deleteProperty(rest, key);
	return rest;
}

/**
 * The panes' conversations and whichever pane is presented, as the panes tell them.
 * @param setVoicePane Keep voice on a pane, or let it follow focus.
 * @returns The conversations, the presented pane and the registry the panes tell.
 */
function usePaneRegistry(setVoicePane: Dispatch<SetStateAction<string | null>>): {
	readonly conversations: PaneConversations;
	readonly docklessPane: string | null;
	readonly panes: PaneRegistry;
} {
	const [conversations, setConversations] = useState<PaneConversations>({});
	const [docklessPane, setDocklessPane] = useState<string | null>(null);
	const panes = useMemo<PaneRegistry>(
		() => ({
			/**
			 * A pane's socket has a hosted conversation.
			 * @param paneId The pane.
			 * @param conversation The conversation.
			 * @returns Withdraw this registration.
			 */
			register: (paneId, conversation) => {
				setConversations((current) =>
					current[paneId] === conversation ? current : { ...current, [paneId]: conversation },
				);
				return () => {
					setConversations((current) =>
						current[paneId] === conversation ? without(current, paneId) : current,
					);
				};
			},
			/**
			 * A pane is presented fullscreen.
			 * @param paneId The pane.
			 * @returns The pane is no longer presented.
			 */
			undock: (paneId) => {
				setDocklessPane(paneId);
				return () => {
					setDocklessPane((current) => (current === paneId ? null : current));
				};
			},
			/**
			 * A pane went.
			 * @param paneId The pane.
			 */
			gone: (paneId) => {
				setVoicePane((pinned) => (pinned === paneId ? null : pinned));
			},
		}),
		[setVoicePane],
	);
	return { conversations, docklessPane, panes };
}

/**
 * The voice session for the pane voice runs for.
 * @param paneId The pane.
 * @param transport Its hosted conversation, or null.
 * @returns The voice owner, or null.
 */
function useVoiceOwner(paneId: string, transport: HostedConversation | null): VoiceOwner | null {
	const [store] = useState(createVoiceStore);
	useEffect(() => {
		if (transport === null) return undefined;
		return store.follow({ paneId, transport });
	}, [store, paneId, transport]);
	return useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
}

/**
 * Let voice's pane go once its session ends in any way.
 * @param voice The voice.
 * @param voicePane The pane voice is kept on, or null while it follows focus.
 * @param setVoicePane Keep voice on a pane, or let it follow focus.
 * @returns Release voice now.
 */
function useVoiceRelease(
	voice: VoiceOwner | null,
	voicePane: string | null,
	setVoicePane: Dispatch<SetStateAction<string | null>>,
): () => void {
	const releaseVoice = useCallback(() => setVoicePane(null), [setVoicePane]);
	const pinnedSession = voicePane !== null && voice?.paneId === voicePane ? voice.session : null;
	useEffect(
		() => (pinnedSession === null ? undefined : releaseWhenVoiceEnds(pinnedSession, releaseVoice)),
		[pinnedSession, releaseVoice],
	);
	return releaseVoice;
}

/**
 * The agent over the page's panes.
 * @param activePaneId The focused pane.
 * @returns The owners, the setup, the voice and what the panes tell.
 */
function useAgentOwners(activePaneId: string): AgentOwners {
	const [voicePane, setVoicePane] = useState<string | null>(null);
	const { conversations, docklessPane, panes } = usePaneRegistry(setVoicePane);
	const transport = conversations[activePaneId] ?? null;
	// The controllers listen only while somebody does, so composing them is pure.
	const owners = useMemo(
		() => (transport === null ? null : createWorkbenchOwners({ paneId: activePaneId, transport })),
		[activePaneId, transport],
	);
	const voicePaneId = voicePane ?? activePaneId;
	const voice = useVoiceOwner(voicePaneId, conversations[voicePaneId] ?? null);

	// The setup outlives focus: its ports read whatever is focused when a step is taken.
	const [focus] = useState(createAgentFocus);
	useEffect(() => focus.retarget(owners, voice), [focus, owners, voice]);
	const [setup] = useState(() => createAgentSetup(agentSetupPorts(focus, setVoicePane)));
	useEffect(() => setup.connect(), [setup]);
	const releaseVoice = useVoiceRelease(voice, voicePane, setVoicePane);

	return useMemo(
		() => ({ owners, setup, voice, releaseVoice, docklessPane, panes }),
		[owners, setup, voice, releaseVoice, docklessPane, panes],
	);
}

export { useAgentOwners, type AgentOwners, type PaneRegistry };
