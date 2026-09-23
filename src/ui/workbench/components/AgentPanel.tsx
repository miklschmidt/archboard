// The conversation panel on the right of the panes: a title row level with
// the pane bar, and the conversation — or, before anybody has signed in, the
// sign-in, and on request the details of the session. It opens only when the
// person asks: the toggle, a message sent, Review, or the status line.

import { RiCloseLine, RiMoreLine } from "@remixicon/react";
import { useCallback, useState, type JSX } from "react";

import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/ui/components/dropdown-menu";
import type { AgentActions, AgentView } from "@/ui/workbench/contracts";
import { AgentDetails } from "@/ui/workbench/components/AgentDetails";
import { EmptyConversation } from "@/ui/workbench/components/EmptyConversation";
import { IconAction } from "@/ui/workbench/components/IconAction";
import { PendingWork } from "@/ui/workbench/components/PendingWork";
import { SignInCard } from "@/ui/workbench/components/SignInCard";
import { AgentRuntimeProvider } from "@/ui/workbench-runtime";
import { Conversation } from "@/ui/workbench-thread";
import type { BrowserWorkbenchTransport } from "@/ui/workbench-transport";

/** Inputs for the panel. */
interface AgentPanelProps {
	readonly view: AgentView;
	readonly actions: AgentActions;
	readonly transport: BrowserWorkbenchTransport;
	/** Put a suggestion in the composer. */
	readonly suggest: (text: string) => void;
	readonly onClose: () => void;
}

/**
 * What the conversation is called: its first prompt, once there is one.
 * @param view The agent view.
 * @returns The title.
 */
function titleOf(view: AgentView): string {
	for (const turn of view.conversation.turns) {
		const prompt = turn.items.find((item) => item.media === "prompt");
		if (prompt !== undefined) return prompt.text.split("\n")[0] ?? prompt.text;
	}
	return view.setup.held[0]?.text ?? "Agent";
}

/**
 * The conversation panel.
 * @param props The view, the actions, the transport and the close.
 * @returns The panel.
 */
function AgentPanel(props: AgentPanelProps): JSX.Element {
	const { view, actions } = props;
	const [details, setDetails] = useState(false);
	const showDetails = useCallback(() => setDetails(true), []);
	const hideDetails = useCallback(() => setDetails(false), []);
	const signedOut = view.setup.phase.kind === "signed_out" || view.setup.phase.kind === "signing_in";
	const empty = view.conversation.turns.length === 0 && view.setup.held.length === 0;
	return (
		<aside
			data-slot="agent-panel"
			aria-label="Agent"
			className="border-border bg-background flex w-(--agent-panel-width) shrink-0 flex-col border-l"
		>
			<header className="border-border bg-sidebar flex h-9 shrink-0 items-center gap-1 border-b pr-1.5 pl-4">
				<h2 className="text-control min-w-0 flex-1 truncate font-semibold">{details ? "Session" : titleOf(view)}</h2>
				<PanelMenu actions={actions} details={details} onDetails={showDetails} onConversation={hideDetails} />
				<IconAction label="Close the conversation" onClick={props.onClose}>
					<RiCloseLine />
				</IconAction>
			</header>
			{details ? (
				<AgentDetails view={view} actions={actions} />
			) : (
				<AgentRuntimeProvider transport={props.transport}>
					<Conversation
						empty={empty ? signedOut ? <SignInCard view={view} actions={actions} /> : <EmptyConversation view={view} suggest={props.suggest} /> : null}
						footer={<PendingWork view={view} actions={actions} />}
					/>
				</AgentRuntimeProvider>
			)}
		</aside>
	);
}

/** Inputs for the panel's menu. */
interface PanelMenuProps {
	readonly actions: AgentActions;
	readonly details: boolean;
	readonly onDetails: () => void;
	readonly onConversation: () => void;
}

/**
 * The panel's menu: a new conversation, the session's details, signing out.
 * @param props The actions and which view is showing.
 * @returns The menu.
 */
function PanelMenu(props: PanelMenuProps): JSX.Element {
	const { actions } = props;
	return (
		<DropdownMenu>
			<DropdownMenuTrigger
				aria-label="Conversation menu"
				className="text-muted-foreground hover:text-foreground hover:bg-sidebar-accent flex size-7 items-center justify-center rounded-[3px]"
			>
				<RiMoreLine className="size-4" />
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end" sideOffset={6} className="border-border w-52 rounded-md border shadow-none">
				<DropdownMenuItem onClick={actions.newConversation}>New conversation</DropdownMenuItem>
				<DropdownMenuItem onClick={props.details ? props.onConversation : props.onDetails}>
					{props.details ? "Back to the conversation" : "Session details"}
				</DropdownMenuItem>
				<DropdownMenuSeparator />
				<DropdownMenuItem onClick={actions.signOut}>Sign out</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}

export { AgentPanel, type AgentPanelProps };
