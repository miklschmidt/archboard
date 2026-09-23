// The agent bar under the panes: the agent's state in one line with the one
// control it needs, Talk, and — under where the conversation opens — the
// composer and the toggle that opens it. It is the collapsed geometry of the
// shell (ADR 0028): forty pixels and a rule, whatever the agent is doing.

import { RiChat3Line } from "@remixicon/react";
import type { JSX } from "react";

import { SHELL_AGE_TICK_MS } from "@/shared/timing/timing";
import { useClock } from "@/ui/components/use-clock";
import { AgentComposer } from "@/ui/workbench/components/AgentComposer";
import { IconAction } from "@/ui/workbench/components/IconAction";
import { StatusLine } from "@/ui/workbench/components/StatusLine";
import { TalkControl } from "@/ui/workbench/components/TalkControl";
import type { AgentActions, AgentView } from "@/ui/workbench/contracts";
import { agentStatus } from "@/ui/workbench/lib/agent-status";
import type { DraftStore } from "@/ui/workbench/lib/draft-store";

/** Inputs for the agent bar. */
interface AgentBarProps {
	readonly view: AgentView;
	readonly actions: AgentActions;
	readonly draft: DraftStore;
	readonly panelOpen: boolean;
	/** Agent words arrived while the conversation was closed. */
	readonly unread: boolean;
	readonly onTogglePanel: () => void;
	readonly reducedMotion: boolean;
}

/**
 * The agent bar.
 * @param props The view, the actions, the draft and the panel's state.
 * @returns The bar.
 */
function AgentBar(props: AgentBarProps): JSX.Element {
	const { view, actions } = props;
	// Only a running turn needs the clock here: to notice it has gone quiet.
	const running = view.conversation.turns.some((turn) => turn.outcome === "running");
	const now = useClock(SHELL_AGE_TICK_MS, running);
	const status = agentStatus(view, now);
	return (
		<section
			data-slot="agent-bar"
			aria-label="Agent bar"
			className="border-border bg-sidebar flex h-[41px] shrink-0 items-stretch border-t"
		>
			<div className="flex min-w-0 flex-1 items-center gap-2 pr-3 pl-2">
				<StatusLine status={status} actions={actions} />
				<TalkControl voice={view.voice} actions={actions} reducedMotion={props.reducedMotion} />
			</div>
			<div className="border-border flex w-(--agent-panel-width) shrink-0 items-stretch gap-1 border-l pr-1 pl-2">
				<AgentComposer
					draft={props.draft}
					context={view.context}
					running={running}
					onSend={actions.send}
				/>
				<div className="flex items-center">
					<span className="relative">
						<IconAction
							label={props.panelOpen ? "Close the conversation" : "Open the conversation"}
							onClick={props.onTogglePanel}
							className={
								props.panelOpen ? "text-foreground bg-sidebar-accent" : "text-muted-foreground"
							}
						>
							<RiChat3Line />
						</IconAction>
						{props.unread && !props.panelOpen && (
							<span
								aria-hidden="true"
								className="bg-primary pointer-events-none absolute top-0.5 right-0.5 size-1.5 rounded-full"
							/>
						)}
					</span>
				</div>
			</div>
		</section>
	);
}

export { AgentBar, type AgentBarProps };
