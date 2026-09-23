// The agent's surfaces as the shell places them: the agent bar under the
// panes, the conversation panel beside them while it is open, and the voice
// controls a presentation carries — all over one agent view and one set of
// actions, so each fact has one home and every control behaves the same way
// wherever it appears.

import { useCallback, useRef, useState, type ReactNode } from "react";

import { PresentationVoiceControls } from "@/ui/application/components/PresentationVoiceControls";
import { useAgent } from "@/ui/application/hooks/use-agent";
import { useAgentPanel, useUnread } from "@/ui/application/hooks/use-agent-panel";
import type { WorkbenchHost } from "@/ui/application/hooks/use-workbench";
import { AgentBar, AgentPanel, createDraftStore } from "@/ui/workbench";
import type { AgentContext, AgentVoiceView } from "@/ui/workbench/contracts";

/** What the agent's surfaces are composed from. */
interface AgentSurfaceInputs {
	readonly workbench: WorkbenchHost;
	readonly context: AgentContext;
	readonly reducedMotion: boolean;
}

/** The agent's surfaces and the moves others need. */
interface AgentSurfaces {
	readonly bar: ReactNode;
	/** The conversation panel, or null while it is closed. */
	readonly panel: ReactNode;
	readonly voiceControls: ReactNode;
	readonly voice: AgentVoiceView;
	/**
	 * Send the agent a message and show the conversation.
	 * @param text The message.
	 */
	readonly ask: (text: string) => void;
}

/**
 * The agent's surfaces.
 * @param inputs The workbench, the context and the motion preference.
 * @returns The surfaces.
 */
function useAgentSurfaces(inputs: AgentSurfaceInputs): AgentSurfaces {
	const { workbench, context, reducedMotion } = inputs;
	const [draft] = useState(createDraftStore);
	const composer = useRef<HTMLTextAreaElement>(null);
	const panel = useAgentPanel();
	const { view, actions } = useAgent({ host: workbench, draft, composer, context, openPanel: panel.openPanel });
	const unread = useUnread(view.conversation, panel.open);
	const suggest = useCallback(
		(text: string): void => {
			draft.set(text);
			composer.current?.focus();
		},
		[draft],
	);
	const ask = useCallback(
		(text: string): void => {
			actions.send(text, false);
			panel.openPanel();
		},
		[actions, panel],
	);
	const transport = workbench.owners?.transport ?? null;
	return {
		bar: (
			<AgentBar
				view={view}
				actions={actions}
				draft={draft}
				composer={composer}
				panelOpen={panel.open}
				unread={unread}
				onTogglePanel={panel.togglePanel}
				reducedMotion={reducedMotion}
			/>
		),
		panel:
			panel.open && transport !== null ? (
				<AgentPanel
					view={view}
					actions={actions}
					transport={transport}
					suggest={suggest}
					onClose={panel.closePanel}
				/>
			) : null,
		voiceControls: <PresentationVoiceControls voice={view.voice} actions={actions} reducedMotion={reducedMotion} />,
		voice: view.voice,
		ask,
	};
}

export { useAgentSurfaces, type AgentSurfaces };
