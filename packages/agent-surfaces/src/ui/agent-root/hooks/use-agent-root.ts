// The agent as its root composes it from the page's panes: the owners, the voice as the dock shows
// it, one set of actions over both, the draft and the panel, the voice and the panel as the shell
// reads them, and what each pane needs to hand over its conversation and lay the voice over its
// picture. Only what changes when the person acts or the voice moves on is held here; what changes
// while the agent works is read by each surface itself (TASK-385.03).

import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";

import { useAgentOwners, type AgentOwners } from "#ui/agent-root/hooks/use-agent-owners.ts";
import { usePanelState, type AgentPanelState } from "#ui/agent-root/hooks/use-panel-state.ts";
import { useVoiceView } from "#ui/agent-root/hooks/use-voice-view.ts";
import type {
	AgentPanelHandle,
	AgentSurfaceState,
	AgentVoice,
	PaneVoiceState,
	VoiceTranscript,
} from "#ui/agent-root/hooks/use-agent.ts";
import { agentActions } from "#ui/agent-root/clients/agent-actions.ts";
import { talkWith, type VoiceStart } from "#ui/agent-root/clients/agent-setup-ports.ts";
import { createNarrator } from "#ui/agent-root/rules/narrator.ts";
import { heardOver } from "#ui/agent-root/rules/subtitled-transcript.ts";
import { agentReadiness, voiceStanding } from "#ui/agent-root/rules/voice-standing.ts";
import type { VoiceOwner, WorkbenchOwners } from "#ui/agent-root/state/workbench-owners.ts";
import {
	createDraftStore,
	type DraftStore,
} from "#ui/workbench-client/surfaces/state/draft-store.ts";
import type {
	AgentActions,
	AgentVoiceView,
} from "#ui/workbench-client/surfaces/state/contracts.ts";

/** Show the conversation of the pane's own checkout, or of one the person picked. */
type ChooseShownConversation = (
	paneId: string,
	chosen?: { readonly checkout?: string },
) => Promise<boolean>;

/** What the root composes the agent over. */
interface AgentRootInputs {
	/** The focused pane: the one a message speaks from, and the one voice follows. */
	readonly activePaneId: string;
	readonly chooseShownConversation: ChooseShownConversation;
}

/** What the root offers below it. */
interface AgentRootState {
	readonly surfaces: AgentSurfaceState;
	readonly voice: AgentVoice;
	readonly panel: AgentPanelHandle;
	readonly pane: PaneVoiceState;
}

/** Nothing said. */
const SILENT: ReturnType<VoiceTranscript["read"]> = Object.freeze([]);

/**
 * Nothing to hear without a voice.
 * @returns How to stop hearing nothing.
 */
function listenToNothing(): () => void {
	return () => undefined;
}

/**
 * What the voice has said, over its pane's conversation.
 * @param voice The voice, or null.
 * @returns The transcript.
 */
function transcriptOf(voice: VoiceOwner | null): VoiceTranscript {
	if (voice === null) {
		return {
			/**
			 * Nothing said without a voice.
			 * @returns Nothing.
			 */
			read: () => SILENT,
			subscribe: listenToNothing,
		};
	}
	const { transport } = voice;
	return {
		/**
		 * What the conversation last published of the voice's words.
		 * @returns The transcript.
		 */
		read: () => transport.state().snapshot?.voice.transcript ?? SILENT,
		subscribe: transport.subscribe,
	};
}

/**
 * The voice as the shell reads it: starts held until the voice is on their pane, and what a page
 * that paces a talk reads, through functions.
 * @param agent The owners.
 * @param view The voice as the dock shows it.
 * @param activePaneId The focused pane.
 * @returns The voice.
 */
function useVoiceHandle(
	agent: AgentOwners,
	view: AgentVoiceView,
	activePaneId: string,
): AgentVoice {
	const { setup, voice } = agent;
	const [narrator] = useState(() =>
		createNarrator<VoiceStart>((start) => {
			talkWith(setup, start);
		}),
	);
	const { stage, level } = view;
	const idle = stage === "idle";
	const followed = voice?.paneId ?? null;
	useEffect(() => {
		narrator.sync({ active: activePaneId, followed, idle });
	}, [narrator, activePaneId, followed, idle]);
	// The same start for as long as the agent lasts, so a shell that offers it is not drawn again.
	const talk = useCallback<AgentVoice["talk"]>(
		(paneId, walkthrough, recording) => {
			narrator.start(paneId, { walkthrough, recording });
		},
		[narrator],
	);
	// One transcript per voice, so whoever follows it is not moved to the same words again.
	const transcript = useMemo(() => transcriptOf(voice), [voice]);
	return useMemo(
		() => ({
			talk,
			/** End the voice. */
			stop: async () => {
				await voice?.session.stop();
			},
			/**
			 * Whether voice can be started now.
			 * @returns The readiness.
			 */
			readiness: () => agentReadiness(setup.snapshot()),
			stage,
			/**
			 * Whether the voice is live, failed, or neither.
			 * @returns The standing.
			 */
			standing: () => voiceStanding(setup.snapshot(), voice?.session.view() ?? null),
			level,
			/**
			 * Whether the model is audible now.
			 * @returns True while it is.
			 */
			audible: () => voice?.session.audible() ?? false,
			transcript,
		}),
		[talk, setup, voice, stage, level, transcript],
	);
}

/** What asking the agent reaches. */
interface AskTargets {
	readonly activePaneId: string;
	readonly choose: ChooseShownConversation;
	readonly owners: WorkbenchOwners | null;
	readonly actions: AgentActions;
	readonly draft: DraftStore;
	readonly panel: AgentPanelState;
}

/**
 * The panel as the shell reads it.
 *
 * Asking the agent of a checkout shows that checkout's conversation first. The server tells the
 * focused pane's conversation of the switch before it answers, but the answer can arrive first;
 * a read on that conversation comes after the news, so the message is composed for the
 * conversation shown now, not refused because the workbench moved under it. A named checkout the
 * tab cannot show gets no message, which would go to another one.
 * @param targets What asking reaches.
 * @returns The panel.
 */
function usePanelHandle(targets: AskTargets): AgentPanelHandle {
	const { activePaneId, choose, owners, actions, draft, panel } = targets;
	const ask = useCallback(
		async (text: string, checkout?: string): Promise<boolean> => {
			const shown = await choose(activePaneId, checkout === undefined ? {} : { checkout });
			if (!shown && checkout !== undefined) return false;
			await owners?.transport.refresh().catch(() => undefined);
			actions.send(text, false);
			return true;
		},
		[choose, activePaneId, owners, actions],
	);
	const fill = useCallback(
		(text: string): void => {
			void choose(activePaneId).then(() => {
				panel.openPanel();
				if (draft.get() !== text) draft.fill(text);
				return undefined;
			});
		},
		[choose, activePaneId, panel, draft],
	);
	const { open, closePanel } = panel;
	return useMemo(() => ({ open, close: closePanel, ask, fill }), [open, closePanel, ask, fill]);
}

/**
 * The agent, composed over the page's panes.
 * @param inputs The focused pane and how a conversation is shown.
 * @returns What the root offers below it.
 */
function useAgentRoot(inputs: AgentRootInputs): AgentRootState {
	const { activePaneId, chooseShownConversation: choose } = inputs;
	const agent = useAgentOwners(activePaneId);
	const { setup, owners, voice, releaseVoice, docklessPane, panes } = agent;
	const setupSnapshot = useSyncExternalStore(setup.subscribe, setup.snapshot, setup.snapshot);
	const voiceView = useVoiceView(voice, setupSnapshot);
	const [draft] = useState(createDraftStore);
	const panel = usePanelState();
	const { openPanel } = panel;
	const showConversation = useCallback(
		(checkout: string): void => {
			void choose(activePaneId, { checkout });
		},
		[choose, activePaneId],
	);
	const actions = useMemo(
		() => agentActions({ setup, owners, voice, releaseVoice, draft, openPanel, showConversation }),
		[setup, owners, voice, releaseVoice, draft, openPanel, showConversation],
	);
	const surfaces = useMemo(
		() => ({ agent, voice: voiceView, actions, draft, panel }),
		[agent, voiceView, actions, draft, panel],
	);
	const voiceHandle = useVoiceHandle(agent, voiceView, activePaneId);
	const panelHandle = usePanelHandle({ activePaneId, choose, owners, actions, draft, panel });
	const overlayPaneId = docklessPane ?? voice?.paneId ?? activePaneId;
	const feed = useMemo(() => heardOver(voice?.transport ?? null), [voice]);
	const pane = useMemo(() => ({ panes, overlayPaneId, feed }), [panes, overlayPaneId, feed]);
	return { surfaces, voice: voiceHandle, panel: panelHandle, pane };
}

export { useAgentRoot, type ChooseShownConversation };
