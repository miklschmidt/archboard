// The conversation as an assistant-ui runtime: the transport's published
// timeline, projected into turns and adapted into messages at the one seam.
// The runtime only shows; nothing is sent through it — messages go through the
// agent setup from the composer in the agent bar.

import { useExternalStoreRuntime, type AssistantRuntime } from "@assistant-ui/react";
import { useMemo, useSyncExternalStore } from "react";

import { toThreadMessageLike } from "@/ui/workbench-runtime/lib/messages";
import { projectTimelineTurns, type ConversationTurn } from "@/ui/workbench-timeline";
import type { BrowserWorkbenchTransport } from "@/ui/workbench-transport";

/** The conversation, or why it could not be read. */
interface Conversation {
	readonly turns: readonly ConversationTurn[];
	/** A timeline that could not be projected, in words, or null. */
	readonly failure: string | null;
}

const EMPTY: Conversation = Object.freeze({ turns: [], failure: null });

/**
 * The conversation a transport publishes.
 * @param transport The transport.
 * @returns The conversation.
 */
function useConversation(transport: BrowserWorkbenchTransport): Conversation {
	const state = useSyncExternalStore(transport.subscribe, transport.state, transport.state);
	const timeline = state.snapshot?.timeline ?? null;
	return useMemo(() => {
		if (timeline === null) return EMPTY;
		try {
			return { turns: projectTimelineTurns(timeline), failure: null };
		} catch (error) {
			return { turns: [], failure: error instanceof Error ? error.message : String(error) };
		}
	}, [timeline]);
}

/**
 * The assistant-ui runtime over a transport's conversation.
 * @param transport The transport.
 * @returns The runtime and the conversation it shows.
 */
function useAgentRuntime(transport: BrowserWorkbenchTransport): {
	readonly runtime: AssistantRuntime;
	readonly conversation: Conversation;
} {
	const conversation = useConversation(transport);
	const running = conversation.turns.some((turn) => turn.outcome === "running");
	const runtime = useExternalStoreRuntime<ConversationTurn>({
		messages: conversation.turns,
		convertMessage: toThreadMessageLike,
		isRunning: running,
		/** Messages are sent from the agent bar, never through this runtime. */
		onNew: () => Promise.resolve(),
		unstable_capabilities: { copy: true },
	});
	return { runtime, conversation };
}

export { useAgentRuntime, useConversation, type Conversation };
