// The conversation beside the navigator: a title row level with every column's
// header row, the conversation — or, before anybody has signed in, the sign-in,
// and on request the details of the session — and at its foot the composer. It
// opens only when the person asks: the toggle, Review, or the status line.

import { RiCloseLine, RiMoreLine } from "@remixicon/react";
import type { JSX } from "react";

import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@archboard/ui-kit/overlays";
import type { AgentActions, AgentView } from "#ui/state/surfaces/contracts.ts";
import { AgentComposer } from "#ui/components/panel/AgentComposer.tsx";
import { AgentDetails } from "#ui/components/dock/AgentDetails.tsx";
import { EmptyConversation } from "#ui/components/panel/EmptyConversation.tsx";
import { IconAction } from "#ui/components/dock/IconAction.tsx";
import { PendingWork } from "#ui/components/dock/PendingWork.tsx";
import { SignInCard } from "#ui/components/panel/SignInCard.tsx";
import { VoiceLines } from "#ui/components/voice/VoiceLines.tsx";
import { AgentRuntimeProvider } from "#ui/components/runtime/AgentRuntimeProvider.tsx";
import { Conversation } from "#ui/components/thread/Conversation.tsx";
import type { BrowserWorkbenchTransport } from "@archboard/codex-realtime-voice/browser";
import type { DraftStore } from "#ui/state/surfaces/draft-store.ts";

/** Inputs for the panel. */
interface AgentPanelProps {
	readonly view: AgentView;
	readonly actions: AgentActions;
	/** The focused pane's transport, or null while its socket is down. */
	readonly transport: BrowserWorkbenchTransport | null;
	/** What the composer holds. */
	readonly draft: DraftStore;
	/** Put a suggestion in the composer. */
	readonly suggest: (text: string) => void;
	/** The session's details show in place of the conversation. */
	readonly details: boolean;
	readonly onDetails: () => void;
	readonly onConversation: () => void;
	readonly onClose: () => void;
}

/**
 * Whether nothing has been said yet: no turn of either thread, no message on its way, nothing aloud.
 * @param view The agent view.
 * @returns True for an empty conversation.
 */
function nothingSaid(view: AgentView): boolean {
	const { conversation, setup, snapshot } = view;
	const said =
		conversation.turns.length +
		conversation.coordinatorTurns.length +
		setup.held.length +
		(snapshot?.voice.transcript.length ?? 0);
	return said === 0 && conversation.failure === null;
}

/**
 * The conversation panel.
 * @param props The view, the actions, the transport and the close.
 * @returns The panel.
 */
function AgentPanel(props: AgentPanelProps): JSX.Element {
	const { view, actions } = props;
	const { details } = props;
	return (
		<aside
			data-slot="agent-panel"
			aria-label="Conversation"
			className="bg-background flex h-full w-full min-w-0 flex-col"
		>
			<header className="border-border bg-sidebar h-chrome shadow-edge-down relative z-30 flex shrink-0 items-center gap-1 border-b pr-1.5 pl-4">
				<h2 className="text-control min-w-0 flex-1 truncate font-semibold">
					{details ? "Session" : "Conversation"}
				</h2>
				<PanelMenu
					actions={actions}
					details={details}
					onDetails={props.onDetails}
					onConversation={props.onConversation}
				/>
				<IconAction label="Close the conversation" onClick={props.onClose}>
					<RiCloseLine />
				</IconAction>
			</header>
			{details ? <AgentDetails view={view} /> : <PanelBody {...props} />}
			{!details && <PanelFooter view={view} actions={actions} draft={props.draft} />}
		</aside>
	);
}

/**
 * The composer, on a tray at the foot of the conversation, which it takes room
 * from as a message grows.
 * @param props The view, the actions and the draft.
 * @param props.view The agent view.
 * @param props.actions The actions.
 * @param props.draft What the composer holds.
 * @returns The foot.
 */
function PanelFooter(props: {
	readonly view: AgentView;
	readonly actions: AgentActions;
	readonly draft: DraftStore;
}): JSX.Element {
	const running = props.view.conversation.turns.some((turn) => turn.outcome === "running");
	return (
		<div
			data-slot="agent-panel-footer"
			className="border-border bg-raised shadow-edge-up relative shrink-0 border-t px-4 py-3"
		>
			<AgentComposer
				draft={props.draft}
				context={props.view.context}
				running={running}
				onSend={props.actions.send}
			/>
		</div>
	);
}

/**
 * The conversation, or — while the focused pane's socket is down — that it
 * will be back, in the panel's place so nothing moves.
 * @param props The panel's inputs.
 * @returns The body.
 */
function PanelBody(props: AgentPanelProps): JSX.Element {
	const { view, actions, transport } = props;
	if (transport === null) {
		return (
			<p data-slot="conversation-offline" className="text-body text-muted-foreground px-5 py-4">
				The conversation is back once this pane reconnects to the Archboard server.
			</p>
		);
	}
	return (
		<AgentRuntimeProvider transport={transport}>
			<Conversation>
				{nothingSaid(view) && <FirstUse view={view} actions={actions} suggest={props.suggest} />}
				<ConversationFailure failure={view.conversation.failure} />
				<VoiceLines snapshot={view.snapshot} />
				<PendingWork view={view} actions={actions} />
			</Conversation>
		</AgentRuntimeProvider>
	);
}

/**
 * Why the conversation could not be read, in place of it.
 * @param props The failure.
 * @param props.failure What went wrong, or null.
 * @returns The line, or nothing.
 */
function ConversationFailure(props: { readonly failure: string | null }): JSX.Element | null {
	if (props.failure === null) return null;
	return (
		<p data-slot="conversation-failure" className="text-body text-destructive">
			The conversation could not be read: {props.failure}
		</p>
	);
}

/**
 * What an empty conversation offers: signing in when nobody has, otherwise
 * something to ask.
 * @param props The view, the actions and the suggestion.
 * @param props.view The agent view.
 * @param props.actions The actions.
 * @param props.suggest Put a suggestion in the composer.
 * @returns The card.
 */
function FirstUse(props: {
	readonly view: AgentView;
	readonly actions: AgentActions;
	readonly suggest: (text: string) => void;
}): JSX.Element {
	const { view } = props;
	const signedOut =
		view.setup.phase.kind === "signed_out" || view.setup.phase.kind === "signing_in";
	if (signedOut) return <SignInCard actions={props.actions} />;
	return <EmptyConversation view={view} suggest={props.suggest} />;
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
				className="text-muted-foreground hover:text-foreground hover:bg-sidebar-accent rounded-control flex size-7 items-center justify-center"
			>
				<RiMoreLine className="size-4" />
			</DropdownMenuTrigger>
			<DropdownMenuContent
				align="end"
				sideOffset={6}
				className="border-border w-52 rounded-md border"
			>
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
