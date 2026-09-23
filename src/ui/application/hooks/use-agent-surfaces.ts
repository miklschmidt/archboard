// The agent's surfaces as the application places them: the agent bar under
// the panes, the conversation panel beside them while it is open, and the Talk
// control a presentation carries — all over one agent view and one set of
// actions, so each fact has one home and every control behaves the same way
// wherever it appears.

import { useCallback, useMemo, useState } from "react";

import { useAgent } from "@/ui/application/hooks/use-agent";
import { useAgentPanel, useUnread } from "@/ui/application/hooks/use-agent-panel";
import type { WorkbenchHost } from "@/ui/application/hooks/use-workbench";
import { createDraftStore, type AgentBarProps, type AgentPanelProps } from "@/ui/workbench";
import type { AgentActions, AgentContext, AgentView } from "@/ui/workbench/contracts";

/** What the agent's surfaces are composed from. */
interface AgentSurfaceInputs {
	readonly workbench: WorkbenchHost;
	readonly context: AgentContext;
	readonly reducedMotion: boolean;
}

/** The agent's surfaces, as the inputs of each. */
interface AgentSurfaces {
	readonly view: AgentView;
	readonly actions: AgentActions;
	readonly bar: AgentBarProps;
	/** The conversation panel, or null while it is closed. */
	readonly panel: AgentPanelProps | null;
	/**
	 * Send the agent a message and show the conversation.
	 * @param text The message.
	 */
	readonly ask: (text: string) => void;
}

/**
 * The agent's surfaces.
 * @param inputs The workbench, the context and the motion preference.
 * @returns The inputs of each surface.
 */
function useAgentSurfaces(inputs: AgentSurfaceInputs): AgentSurfaces {
	const { workbench, context, reducedMotion } = inputs;
	const [draft] = useState(createDraftStore);
	const panel = useAgentPanel();
	const { view, actions } = useAgent({
		host: workbench,
		draft,
		context,
		openPanel: panel.openPanel,
	});
	const unread = useUnread(view.conversation, panel.open);
	const ask = useCallback((text: string): void => actions.send(text, false), [actions]);
	const bar = useMemo<AgentBarProps>(
		() => ({
			view,
			actions,
			draft,
			panelOpen: panel.open,
			unread,
			onTogglePanel: panel.togglePanel,
			reducedMotion,
		}),
		[view, actions, draft, panel.open, unread, panel.togglePanel, reducedMotion],
	);
	const transport = workbench.owners?.transport ?? null;
	const panelProps = useMemo<AgentPanelProps | null>(
		() =>
			panel.open && transport !== null
				? { view, actions, transport, suggest: draft.fill, onClose: panel.closePanel }
				: null,
		[panel.open, view, actions, transport, draft, panel.closePanel],
	);
	return { view, actions, bar, panel: panelProps, ask };
}

export { useAgentSurfaces, type AgentSurfaces };
