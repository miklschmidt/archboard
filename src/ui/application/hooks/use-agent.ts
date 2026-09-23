// The agent surfaces' one view and one set of actions, over the canvas-wide
// agent setup, the focused pane's owners and the voice session. Everything the
// agent bar and the conversation panel show comes through `AgentView`;
// everything a person does there goes out through `AgentActions`.

import { useMemo, useSyncExternalStore } from "react";

import { useVoiceView } from "@/ui/application/hooks/use-voice-view";
import type { WorkbenchHost } from "@/ui/application/hooks/use-workbench";
import { agentActions } from "@/ui/application/lib/agent-actions";
import type { ApprovalDecisions } from "@/ui/application/lib/workbench-owners";
import type { SnapshotStore } from "@/ui/application/lib/snapshot-cache";
import type { AgentActions, AgentContext, AgentView } from "@/ui/workbench/contracts";
import type { DraftStore } from "@/ui/workbench";
import { useConversation, type Conversation } from "@/ui/workbench-runtime";
import type { ConversationTurn } from "@/ui/workbench-timeline";

/** What the agent hook reads beyond the workbench. */
interface AgentInputs {
	readonly host: WorkbenchHost;
	readonly draft: DraftStore;
	readonly context: AgentContext;
	readonly openPanel: () => void;
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
 * The turn running now: the newest, should Codex still hold an older one open.
 * @param conversation The conversation.
 * @returns Its id, or null.
 */
function runningTurnOf(conversation: Conversation): ConversationTurn["turnId"] | null {
	return conversation.turns.findLast((turn) => turn.outcome === "running")?.turnId ?? null;
}

/**
 * The agent's view and actions.
 * @param inputs The workbench, the draft, the context and the panel.
 * @returns The view and the actions.
 */
function useAgent(inputs: AgentInputs): {
	readonly view: AgentView;
	readonly actions: AgentActions;
} {
	const { host, draft, context, openPanel } = inputs;
	const { setup, owners, voice, releaseVoice } = host;
	const setupSnapshot = useSyncExternalStore(setup.subscribe, setup.snapshot, setup.snapshot);
	const stores = owners ?? NO_OWNER_STORES;
	const conversation = useConversation(owners?.transport ?? null);
	const voiceView = useVoiceView(voice, setupSnapshot);
	const decisions = useStore(stores.approvalDecisions);
	const lastProgressAtMs = useStore(stores.progress);
	const snapshot = conversation.snapshot;

	const view = useMemo<AgentView>(
		() => ({
			setup: setupSnapshot,
			snapshot,
			conversation,
			voice: voiceView,
			context,
			busyApprovals: decisions.busy,
			approvalErrors: decisions.errors,
			lastProgressAtMs,
		}),
		[setupSnapshot, snapshot, conversation, voiceView, context, decisions, lastProgressAtMs],
	);
	const runningTurnId = runningTurnOf(conversation);
	const actions = useMemo(
		() => agentActions({ setup, owners, voice, releaseVoice, draft, runningTurnId, openPanel }),
		[setup, owners, voice, releaseVoice, draft, runningTurnId, openPanel],
	);
	return { view, actions };
}

export { useAgent, type AgentInputs };
