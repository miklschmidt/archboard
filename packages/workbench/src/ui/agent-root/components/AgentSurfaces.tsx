// The agent dock, the conversation panel and the voice key a presentation's bar carries, each
// reading what it shows itself from the agent's root.
//
// The conversation, the approvals on the wire and the progress clock change with every piece of a
// reply. Read here, where they are drawn, a reply draws the dock and the panel again and nothing
// around them: the shell, the navigator and the panes stay as they are (TASK-385.03).

import type { JSX, ReactNode } from "react";

import { useSurfaceState, type AgentSurfaceState } from "#ui/agent-root/hooks/use-agent.ts";
import { useAgentView } from "#ui/agent-root/hooks/use-agent-view.ts";
import { useUnread } from "#ui/agent-root/hooks/use-panel-state.ts";
import { AgentDock as DockSurface } from "#ui/workbench-client/dock/components/AgentDock.tsx";
import { AgentPanel as PanelSurface } from "#ui/workbench-client/panel/components/AgentPanel.tsx";
import { TalkControl as TalkKey } from "#ui/workbench-client/voice/components/TalkControl.tsx";

/**
 * The surfaces' state, which only an `AgentRoot` above offers.
 * @param name The surface that reads it.
 * @returns The state.
 * @throws {Error} Outside an `AgentRoot`.
 */
function useSurfaces(name: string): AgentSurfaceState {
	const state = useSurfaceState();
	if (state === null) throw new Error(`${name} reads the agent: place it inside an AgentRoot.`);
	return state;
}

/** Inputs for the agent dock. */
interface AgentDockProps {
	/** Whether the person asked for reduced motion. */
	readonly reducedMotion: boolean;
	/** Whether the dock is off screen, as while a pane is presented fullscreen. */
	readonly dockless: boolean;
	/** What leads the dock's keys, such as the switch of what the navigator lists. */
	readonly lead: ReactNode;
}

/**
 * The agent at the navigator's foot: its voice, what it is doing, and the way to the conversation,
 * marked while the agent said something the closed conversation has not shown.
 * @param props The motion preference, whether the dock is off screen and what leads its keys.
 * @returns The dock.
 */
function AgentDock(props: AgentDockProps): JSX.Element {
	const { agent, voice, actions, panel } = useSurfaces("AgentDock");
	const view = useAgentView(agent, voice);
	const unread = useUnread(view.conversation, panel.open);
	return (
		<DockSurface
			view={view}
			actions={actions}
			panelOpen={panel.open}
			unread={unread}
			onTogglePanel={panel.togglePanel}
			reducedMotion={props.reducedMotion}
			dockless={props.dockless}
			lead={props.lead}
		/>
	);
}

/**
 * The conversation panel. The shell places it while the conversation is open.
 * @returns The panel.
 */
function AgentPanel(): JSX.Element {
	const { agent, voice, actions, draft, panel } = useSurfaces("AgentPanel");
	const view = useAgentView(agent, voice);
	return (
		<PanelSurface
			view={view}
			actions={actions}
			transport={agent.owners?.transport ?? null}
			draft={draft}
			suggest={draft.fill}
			details={panel.details}
			onDetails={panel.showDetails}
			onConversation={panel.showConversation}
			onClose={panel.closePanel}
		/>
	);
}

/**
 * The key that starts and ends voice, for a presentation's bar. It reads the voice the voice box
 * over the picture reads, so the two always say the same thing.
 * @returns The key, or null where no agent is offered.
 */
function TalkControl(): JSX.Element | null {
	const state = useSurfaceState();
	return state === null ? null : <TalkKey voice={state.voice} actions={state.actions} />;
}

export { AgentDock, AgentPanel, TalkControl };
