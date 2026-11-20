// The agent of a page, over its panes: one root holds the agent's state and offers it to every
// surface drawn below, the dock, the conversation panel, the voice over a pane, the presentation's
// voice key and Narrate key, and the answers that name files. The shell passes only its own facts:
// which pane is focused, how a file opens, and how a conversation is shown.

import type { JSX, ReactNode } from "react";

import {
	PanelContext,
	PaneVoiceContext,
	SurfaceContext,
	VoiceContext,
} from "#ui/agent-root/hooks/use-agent.ts";
import { useAgentRoot, type ChooseShownConversation } from "#ui/agent-root/hooks/use-agent-root.ts";
import { OrbStageProvider } from "#ui/workbench-client/orb/components/OrbStage.tsx";
import { AnswerFilesProvider } from "#ui/workbench-client/thread/components/AnswerFilesProvider.tsx";
import type { OpenAnswerFile } from "#ui/workbench-client/thread/hooks/use-answer-files.ts";

/** Inputs for the agent's root. */
interface AgentRootProps {
	/** The focused pane: the one a message speaks from, and the one voice follows. */
	readonly activePaneId: string;
	/** Opens a file an answer names, in the person's editor. */
	readonly openAnswerFile: OpenAnswerFile;
	/** Shows the conversation of a pane's own checkout, or of one the person picked. */
	readonly chooseShownConversation: ChooseShownConversation;
	readonly children: ReactNode;
}

/**
 * The agent, for everything drawn inside.
 * @param props The focused pane, the file opener, the conversation chooser and what is drawn.
 * @returns What is drawn, with the agent offered to it.
 */
function AgentRoot(props: AgentRootProps): JSX.Element {
	const { surfaces, voice, panel, pane } = useAgentRoot(props);
	return (
		<OrbStageProvider>
			<SurfaceContext value={surfaces}>
				<VoiceContext value={voice}>
					<PanelContext value={panel}>
						<PaneVoiceContext value={pane}>
							<AnswerFilesProvider open={props.openAnswerFile}>
								{props.children}
							</AnswerFilesProvider>
						</PaneVoiceContext>
					</PanelContext>
				</VoiceContext>
			</SurfaceContext>
		</OrbStageProvider>
	);
}

export { AgentRoot };
