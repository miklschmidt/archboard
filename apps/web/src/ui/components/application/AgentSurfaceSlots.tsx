// The agent dock and the conversation panel, each reading what it shows itself.
//
// The conversation, the approvals on the wire and the progress clock change
// with every piece of a reply. Read here, where they are drawn, a reply draws
// the dock and the panel again and nothing around them: the shell, the
// navigator and the panes stay as they are (TASK-385.03).

import type { JSX } from "react";

import { useAgentView } from "#ui/hooks/application/use-agent.ts";
import { useUnread } from "#ui/hooks/application/use-agent-panel.ts";
import type { AgentSurfaces } from "#ui/hooks/application/use-agent-surfaces.ts";
import type { Workbench } from "#ui/hooks/application/use-workbench.ts";
import { AgentDock, AgentPanel } from "@archboard/workbench/agent";

/** What a surface is drawn from. */
interface AgentSurfaceProps {
	readonly workbench: Workbench;
	readonly agent: AgentSurfaces;
}

/**
 * The agent dock, and whether the agent said something while the panel was closed.
 * @param props The workbench, the agent, the motion preference and whether the dock is off screen.
 * @param props.reducedMotion Whether the person asked for reduced motion.
 * @param props.dockless Whether the dock is off screen, as while a pane is presented fullscreen.
 * @returns The dock.
 */
function AgentDockSlot(
	props: AgentSurfaceProps & { readonly reducedMotion: boolean; readonly dockless: boolean },
): JSX.Element {
	const { agent } = props;
	const view = useAgentView(props, agent.voice);
	const unread = useUnread(view.conversation, agent.panel.open);
	return (
		<AgentDock
			view={view}
			actions={agent.actions}
			panelOpen={agent.panel.open}
			unread={unread}
			onTogglePanel={agent.panel.togglePanel}
			reducedMotion={props.reducedMotion}
			dockless={props.dockless}
		/>
	);
}

/**
 * The conversation panel. It is placed only while it is open.
 * @param props The workbench and the agent.
 * @returns The panel.
 */
function AgentPanelSlot(props: AgentSurfaceProps): JSX.Element {
	const { agent, workbench } = props;
	const view = useAgentView(props, agent.voice);
	const { panel } = agent;
	return (
		<AgentPanel
			view={view}
			actions={agent.actions}
			transport={workbench.owners?.transport ?? null}
			draft={agent.draft}
			suggest={agent.draft.fill}
			details={panel.details}
			onDetails={panel.showDetails}
			onConversation={panel.showConversation}
			onClose={panel.closePanel}
		/>
	);
}

export { AgentDockSlot, AgentPanelSlot };
