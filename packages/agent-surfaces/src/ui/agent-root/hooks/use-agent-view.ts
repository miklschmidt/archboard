// What the agent dock and the conversation panel show: everything comes through
// one `AgentView`, read where it is drawn.

import { useMemo, useSyncExternalStore } from "react";

import type { AgentOwners } from "#ui/agent-root/hooks/use-agent-owners.ts";
import type { ApprovalDecisions } from "#ui/agent-root/state/workbench-owners.ts";
import type { SnapshotStore } from "#ui/agent-root/state/snapshot-cache.ts";
import { useConversation } from "#ui/workbench-client/assistant-runtime/hooks/use-agent-runtime.ts";
import type { AgentView, AgentVoiceView } from "#ui/workbench-client/surfaces/state/contracts.ts";

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
 * they are drawn, never at the agent's root, which would draw the whole shell
 * again for every piece of a reply (TASK-385.03).
 * @param agent The setup and the focused pane's owners.
 * @param voice The voice, as the agent dock shows it.
 * @returns The view.
 */
function useAgentView(
	agent: Pick<AgentOwners, "setup" | "owners">,
	voice: AgentVoiceView,
): AgentView {
	const { setup, owners } = agent;
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
			busyApprovals: decisions.busy,
			approvalErrors: decisions.errors,
			lastProgressAtMs,
		}),
		[setupSnapshot, snapshot, conversation, voice, decisions, lastProgressAtMs],
	);
}

export { useAgentView };
