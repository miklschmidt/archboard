// Everything a person does from the agent surfaces, over the server-wide
// agent setup, the focused pane's controllers and the voice session. A step
// that needs a provider's sign-in page opens its tab from the person's own
// gesture, so the browser lets it through.

import { type AgentSetup, type AgentActions, type DraftStore } from "@archboard/workbench/agent";
import {
	projectTimelineTurns,
	type ConversationTurn,
} from "@archboard/codex-realtime-voice/controllers";
import { gestureTab, openAuthTab } from "#ui/clients/application/agent-setup-ports.ts";
import type { VoiceOwner, WorkbenchOwners } from "#ui/state/application/workbench-owners.ts";
import type { BrowserTimeline } from "@archboard/codex-realtime-voice/contract";

/** What the actions act on. */
interface AgentActionTargets {
	readonly setup: AgentSetup;
	readonly owners: WorkbenchOwners | null;
	readonly voice: VoiceOwner | null;
	/** Voice ended: let it follow the focused pane again. */
	readonly releaseVoice: () => void;
	readonly draft: DraftStore;
	readonly openPanel: () => void;
	/**
	 * Show the conversation of a workhorse the person picked.
	 * @param checkout The checkout it works in.
	 */
	readonly showConversation: (checkout: string) => void;
}

/**
 * The turn running in a timeline: the newest, should Codex still hold an older one open.
 * @param timeline The timeline.
 * @returns Its id, or null when none runs or the timeline cannot be read.
 */
function runningIn(timeline: BrowserTimeline): ConversationTurn["turnId"] | null {
	try {
		const turns = projectTimelineTurns(timeline, "workhorse");
		return turns.findLast((turn) => turn.outcome === "running")?.turnId ?? null;
	} catch {
		return null;
	}
}

/**
 * The turn running now, read when somebody acts rather than handed in, so the
 * actions are not made again on every piece of the conversation (TASK-385.03).
 * @param owners The focused pane's owners, or null.
 * @returns Its id, or null when none runs.
 */
function runningTurnNow(owners: WorkbenchOwners | null): ConversationTurn["turnId"] | null {
	const timeline = owners?.transport.state().snapshot?.timeline ?? null;
	return timeline === null ? null : runningIn(timeline);
}

/** Nothing to do: the pane has no owners to act on. */
function nothing(): void {
	// There is no queue without a pane.
}

/** Queue actions while the pane has no owners: there is no queue to act on. */
const NO_QUEUE: AgentActions["queue"] = Object.freeze({
	moveUp: nothing,
	moveDown: nothing,
	remove: nothing,
	sendNow: nothing,
});

/**
 * The voice actions.
 * @param targets What they act on.
 * @returns Mute, unmute and end.
 */
function voiceActions(
	targets: AgentActionTargets,
): Pick<AgentActions, "mute" | "unmute" | "endVoice"> {
	const { voice, releaseVoice } = targets;
	return {
		/** Mute the microphone. */
		mute: () => {
			void voice?.session.mute();
		},
		/** Unmute the microphone. */
		unmute: () => {
			void voice?.session.unmute();
		},
		/** End voice and let it follow focus again. */
		endVoice: () => {
			void voice?.session.stop().then(releaseVoice);
		},
	};
}

/**
 * The actions on the focused pane's controllers.
 * @param targets What they act on.
 * @returns Stop, sign out, the approval decisions and the queue.
 */
function paneActions(
	targets: AgentActionTargets,
): Pick<
	AgentActions,
	"stop" | "signOut" | "respondToApproval" | "respondToDynamicApproval" | "queue"
> {
	const { owners } = targets;
	return {
		/** Interrupt the running turn. */
		stop: () => {
			const running = runningTurnNow(owners);
			if (running !== null) void owners?.composer.interrupt(running);
		},
		/** Sign out of Archboard's Codex. */
		signOut: () => {
			void owners?.threadLink.logout();
		},
		/**
		 * Decide an approval.
		 * @param approval The approval.
		 * @param choice The decision.
		 */
		respondToApproval: (approval, choice) => {
			owners?.approvals.panelActions.respondToApproval(approval, choice);
		},
		/**
		 * Decide a dynamic tool's approval.
		 * @param approval The approval.
		 * @param verdict The decision.
		 */
		respondToDynamicApproval: (approval, verdict) => {
			owners?.approvals.panelActions.respondToDynamicApproval(approval, verdict);
		},
		queue: owners?.queue.panelActions ?? NO_QUEUE,
	};
}

/**
 * Everything a person can do from the agent surfaces.
 * @param targets What the actions act on.
 * @returns The actions.
 */
function agentActions(targets: AgentActionTargets): AgentActions {
	const { setup, draft, openPanel, showConversation } = targets;
	return {
		...voiceActions(targets),
		...paneActions(targets),
		/**
		 * Send a message and show the conversation.
		 * @param text The message.
		 * @param queue Whether to run it after the current turn.
		 */
		send: (text, queue) => {
			setup.send(text, { queue, tab: gestureTab(setup) });
			openPanel();
		},
		/** Start voice, setting up whatever is missing. */
		talk: () => {
			setup.talk({ tab: gestureTab(setup) });
		},
		/**
		 * Sign in.
		 * @param login The provider and its credentials.
		 */
		signIn: (login) => {
			setup.signIn(login, login.type === "chatgpt" ? openAuthTab() : undefined);
		},
		/** Cancel the sign-in. */
		cancelSignIn: () => {
			setup.cancelSignIn();
		},
		/** Start a new conversation. */
		newConversation: () => {
			setup.newConversation();
		},
		/**
		 * Send a held message again.
		 * @param id The held message.
		 */
		retry: (id) => {
			setup.retry(id);
		},
		/**
		 * Take a held message back into the composer.
		 * @param id The held message.
		 */
		edit: (id) => {
			const text = setup.discard(id);
			if (text !== null) draft.fill(text);
		},
		openPanel,
		showConversation,
	};
}

export { agentActions, type AgentActionTargets };
