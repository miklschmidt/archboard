// The agent surfaces' one view and one set of actions, over the server-wide
// agent setup, the focused pane's owners and the voice session. Everything the
// agent dock and the conversation panel show comes through `AgentView`;
// everything a person does there goes out through `AgentActions`.

import { useMemo, useSyncExternalStore } from "react";

import { useVoiceView } from "@/ui/application/hooks/use-voice-view";
import type { Workbench } from "@/ui/application/hooks/use-workbench";
import { agentActions } from "@/ui/application/lib/agent-actions";
import type { ApprovalDecisions } from "@/ui/application/lib/workbench-owners";
import type { SnapshotStore } from "@/ui/application/lib/snapshot-cache";
import type {
	AgentActions,
	AgentContext,
	AgentView,
	AgentVoiceView,
} from "@/ui/workbench/contracts";
import type { DraftStore } from "@/ui/workbench";
import { useConversation } from "@archboard/workbench/conversation-runtime";

/** What the agent hook reads beyond the workbench. */
interface AgentInputs {
	readonly workbench: Workbench;
	readonly draft: DraftStore;
	readonly context: AgentContext;
	readonly openPanel: () => void;
	readonly showConversation: (checkout: string) => void;
}

/**
 * Nothing to listen to without owners.
 * @returns How to stop listening.
 */
function subscribeToNothing(): () => void {
	return () => undefined;
}

const NO_DECISION_STATE: ApprovalDecisions = Object.freeze({ busy: [], errors: {} });

/** No decisions while the pane has no owners. */
const NO_DECISIONS: SnapshotStore<ApprovalDecisions> = Object.freeze({
	subscribe: subscribeToNothing,
	/**
	 * No decisions.
	 * @returns None.
	 */
	getSnapshot: (): ApprovalDecisions => NO_DECISION_STATE,
});

/** No progress while the pane has no owners. */
const NO_PROGRESS: SnapshotStore<number | null> = Object.freeze({
	subscribe: subscribeToNothing,
	/**
	 * No progress.
	 * @returns Null.
	 */
	getSnapshot: (): null => null,
});

/** The stores a pane's owners publish, or none while it has no owners. */
const NO_OWNER_STORES = { approvalDecisions: NO_DECISIONS, progress: NO_PROGRESS };

/**
 * A store's snapshot, heard as it publishes.
 * @param store The store.
 * @returns The snapshot.
 */
function useStore<T>(store: SnapshotStore<T>): T {
	return useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
}

/**
 * What the agent surfaces show: the conversation, the approvals on the wire and
 * the progress clock, all of which change while the agent works. Called where
 * they are drawn, never at the application's root, which would draw the whole
 * shell again for every piece of a reply (TASK-385.03).
 * @param inputs The workbench and the context.
 * @param voice The voice, as the agent dock shows it.
 * @returns The view.
 */
function useAgentView(
	inputs: Pick<AgentInputs, "workbench" | "context">,
	voice: AgentVoiceView,
): AgentView {
	const { workbench, context } = inputs;
	const { setup, owners } = workbench;
	const setupSnapshot = useSyncExternalStore(setup.subscribe, setup.snapshot, setup.snapshot);
	const stores = owners ?? NO_OWNER_STORES;
	const conversation = useConversation(owners?.transport ?? null);
	const decisions = useStore(stores.approvalDecisions);
	const lastProgressAtMs = useStore(stores.progress);
	const snapshot = conversation.snapshot;
	return useMemo<AgentView>(
		() => ({
			setup: setupSnapshot,
			snapshot,
			conversation,
			voice,
			context,
			busyApprovals: decisions.busy,
			approvalErrors: decisions.errors,
			lastProgressAtMs,
		}),
		[setupSnapshot, snapshot, conversation, voice, context, decisions, lastProgressAtMs],
	);
}

/**
 * What a person can do from the agent surfaces, and the voice as they show it:
 * neither changes while the agent works, so the application's root holds them.
 * @param inputs The workbench, the draft and the panel.
 * @returns The voice and the actions.
 */
function useAgent(inputs: Omit<AgentInputs, "context">): {
	readonly voice: AgentVoiceView;
	readonly actions: AgentActions;
} {
	const { workbench, draft, openPanel, showConversation } = inputs;
	const { setup, owners, voice, releaseVoice } = workbench;
	const setupSnapshot = useSyncExternalStore(setup.subscribe, setup.snapshot, setup.snapshot);
	const voiceView = useVoiceView(voice, setupSnapshot);
	const actions = useMemo(
		() => agentActions({ setup, owners, voice, releaseVoice, draft, openPanel, showConversation }),
		[setup, owners, voice, releaseVoice, draft, openPanel, showConversation],
	);
	return { voice: voiceView, actions };
}

export { useAgent, useAgentView, type AgentInputs };
