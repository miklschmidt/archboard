// The agent's surfaces as the application holds them: the agent dock at the
// navigator's foot, the conversation beside the navigator while it is open, and the Talk
// control a presentation carries, all over one set of actions, so each fact has
// one home and every control behaves the same way wherever it appears.
//
// Only what changes when the person acts is held here: the actions, the draft,
// whether the panel is open, and the voice. What changes while the agent works
// (the conversation, the approvals, the progress clock) is read by each surface
// itself, so a reply draws the surfaces and not the shell around them
// (TASK-385.03).

import { useCallback, useMemo, useState } from "react";

import { useAgent } from "#ui/hooks/application/use-agent.ts";
import { useAgentPanel, type AgentPanelState } from "#ui/hooks/application/use-agent-panel.ts";
import type { Workbench } from "#ui/hooks/application/use-workbench.ts";
import { createDraftStore, type DraftStore, type AgentActions } from "@archboard/workbench/agent";
import type { AgentVoiceView } from "@archboard/workbench/voice";

/** The agent's surfaces, as the application holds them. */
interface AgentSurfaces {
	/** The voice, as the agent dock and a presentation's Talk control show it. */
	readonly voice: AgentVoiceView;
	readonly actions: AgentActions;
	/** What the composer holds, which the panel's suggestions fill. */
	readonly draft: DraftStore;
	/** Whether the conversation panel is open, and the moves that open and close it. */
	readonly panel: AgentPanelState;
	/**
	 * Send the agent a message and show the conversation.
	 * @param text The message.
	 */
	readonly ask: (text: string) => void;
}

/**
 * The agent's surfaces.
 * @param workbench The workbench.
 * @param showConversation Show the conversation of a workhorse the person picked.
 * @returns The voice, the actions, the draft, the panel and a way to ask.
 */
function useAgentSurfaces(
	workbench: Workbench,
	showConversation: (checkout: string) => void,
): AgentSurfaces {
	const [draft] = useState(createDraftStore);
	const panel = useAgentPanel();
	const { voice, actions } = useAgent({
		workbench,
		draft,
		openPanel: panel.openPanel,
		showConversation,
	});
	const ask = useCallback((text: string): void => actions.send(text, false), [actions]);
	return useMemo(
		() => ({ voice, actions, draft, panel, ask }),
		[voice, actions, draft, panel, ask],
	);
}

export { useAgentSurfaces, type AgentSurfaces };
