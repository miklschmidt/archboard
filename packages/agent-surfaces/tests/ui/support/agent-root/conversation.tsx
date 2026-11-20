// A pane's hosted conversation as the agent receives it, over the voice session tests' transport
// and media fakes, and a page that holds the agent over one pane that hands it over. The tests of
// the agent's composition drive what the conversation publishes and what its media does, and read
// what the agent's surfaces draw.

import type { JSX, ReactNode } from "react";

import type { BrowserSnapshot } from "@archboard/codex-realtime-voice/contract";
import type { HostedConversation } from "@archboard/codex-realtime-voice/browser";
import { Tooltip } from "@archboard/ui-kit/components";
import { AgentRoot } from "#ui/agent-root/components/AgentRoot.tsx";
import { AgentPane } from "#ui/agent-root/components/AgentPane.tsx";
import {
	connectedState,
	realtimeFake,
	transportFake,
	type RealtimeFake,
	type TransportFake,
} from "#tests/ui/support/voice-session/fakes.ts";
import { snapshot } from "#tests/ui/support/voice-session/workbench-fixture.ts";

/** A hosted conversation, and the fakes it runs over. */
interface FakeConversation {
	readonly conversation: HostedConversation;
	/** What the conversation publishes. */
	readonly transport: TransportFake;
	/** The conversation's voice. */
	readonly media: RealtimeFake;
	/**
	 * Publish a snapshot with the voice in it.
	 * @param voice The voice.
	 */
	readonly hear: (voice: BrowserSnapshot["voice"]) => void;
}

/**
 * A control these tests never use.
 * @throws {Error} Always.
 */
function unused(): never {
	throw new Error("The agent's composition tests do not use this control.");
}

/**
 * Nothing to hear.
 * @returns How to stop hearing nothing.
 */
function listenToNothing(): () => void {
	return () => undefined;
}

/**
 * The controllers of a conversation nobody sends, signs in or decides anything on.
 * @returns The controllers.
 */
function idleControllers(): HostedConversation["controllers"] {
	return {
		threadLink: {
			snapshot: unused,
			subscribe: listenToNothing,
			create: unused,
			/**
			 * A sign-in waits on the provider's page, which nobody signs in on here.
			 * @returns A sign-in that never settles.
			 */
			login: () => new Promise(() => undefined),
			cancelLogin: unused,
			logout: unused,
		},
		composer: {
			submit: unused,
			interrupt: unused,
			getState: unused,
			subscribe: listenToNothing,
			dismissRetainedDraft: unused,
		},
		queue: {
			subscribe: listenToNothing,
			view: unused,
			commandState: unused,
			list: unused,
			add: unused,
			edit: unused,
			cancel: unused,
			start: unused,
			move: unused,
			panelActions: { moveUp: unused, moveDown: unused, remove: unused, sendNow: unused },
		},
		approvals: {
			subscribe: listenToNothing,
			/**
			 * No decision is on the wire.
			 * @returns The empty state.
			 */
			decisionState: () => ({ busyApprovals: [], results: new Map() }),
			view: unused,
			respondToApproval: unused,
			respondToDynamicApproval: unused,
			panelActions: { respondToApproval: unused, respondToDynamicApproval: unused },
		},
	};
}

/**
 * A pane's hosted conversation over fakes, connected, its voice as the snapshot says.
 * @param value The snapshot it publishes first.
 * @returns The conversation and its fakes.
 */
function fakeConversation(value: BrowserSnapshot = snapshot()): FakeConversation {
	const transport = transportFake(connectedState(value));
	const media = realtimeFake();
	const conversation: HostedConversation = {
		state: transport.state,
		snapshot: transport.snapshot,
		subscribe: transport.subscribe,
		refresh: unused,
		capabilities: transport.capabilities,
		controllers: idleControllers(),
		media: {
			...media,
			/**
			 * The media follows a generation.
			 * @returns Ready.
			 */
			attach: () => Promise.resolve({ state: "ready" }),
			/**
			 * The media leaves a generation.
			 * @returns Once it left.
			 */
			detach: () => Promise.resolve(),
			appendText: unused,
			/**
			 * The media is disposed.
			 * @returns Once it is.
			 */
			dispose: () => Promise.resolve(),
		},
	};
	return {
		conversation,
		transport,
		media,
		/**
		 * Publish the voice.
		 * @param voice The voice.
		 */
		hear: (voice) => {
			transport.set(connectedState(snapshot({ voice })));
		},
	};
}

/** Nobody opens a file in these tests. */
function openNoFile(): void {
	// No answer names a file here.
}

/**
 * Showing a conversation, which these tests never wait on.
 * @returns That it was shown.
 */
function shown(): Promise<boolean> {
	return Promise.resolve(true);
}

/** What the page holds. */
interface AgentPage {
	/** The pane's conversation, or null while it has none. */
	readonly conversation: HostedConversation | null;
	/** Whether the page records a talk. */
	readonly recording?: boolean;
	/** Whether the pane is presented fullscreen. */
	readonly dockless?: boolean;
	/** What else is on the page, below the agent: the dock, a Narrate key. */
	readonly children?: ReactNode;
}

/** The one pane of the page. */
const PANE = "pane-a";

/**
 * A page with the agent over one pane, which lays the voice over its picture.
 * @param page The pane's conversation, the page's facts and what else is on it.
 * @returns The page.
 */
function agentPage(page: AgentPage): JSX.Element {
	return (
		<Tooltip.Provider>
			<AgentRoot activePaneId={PANE} openAnswerFile={openNoFile} chooseShownConversation={shown}>
				<AgentPane
					paneId={PANE}
					conversation={page.conversation}
					recording={page.recording ?? false}
					dockless={page.dockless ?? false}
					reducedMotion={false}
				>
					{(voice) => <div data-slot="picture">{voice}</div>}
				</AgentPane>
				{page.children}
			</AgentRoot>
		</Tooltip.Provider>
	);
}

export { PANE, agentPage, fakeConversation, type FakeConversation };
