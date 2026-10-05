// The conversation as an assistant-ui runtime: the transport's published
// timeline, projected into turns and adapted into messages at the one seam.
// The runtime only shows; nothing is sent through it — messages go through the
// agent setup from the composer in the conversation.

import { useExternalStoreRuntime, type AssistantRuntime } from "@assistant-ui/react";
import { useMemo, useSyncExternalStore } from "react";

import { toThreadMessageLike } from "@/ui/workbench-runtime/lib/messages";
import { projectTimelineTurns, type ConversationTurn } from "@/ui/workbench-timeline";
import type { BrowserTimeline } from "@/shared/codex-browser-model";
import type { BrowserWorkbenchState, BrowserWorkbenchTransport } from "@/ui/workbench-transport";

/** The conversation, or why it could not be read. */
interface Conversation {
	/** The snapshot it was read from, or null before one arrives. */
	readonly snapshot: BrowserWorkbenchState["snapshot"];
	readonly turns: readonly ConversationTurn[];
	/** A timeline that could not be projected, in words, or null. */
	readonly failure: string | null;
}

/** What the conversation is read from: a transport, or nothing. */
type ConversationSource = Pick<BrowserWorkbenchTransport, "subscribe"> & {
	readonly state: () => BrowserWorkbenchState | null;
};

/** No transport: nothing to hear, no state. */
const NO_TRANSPORT: ConversationSource = Object.freeze({
	/**
	 * Nothing to listen to.
	 * @returns How to stop listening.
	 */
	subscribe: () => () => undefined,
	/**
	 * No state.
	 * @returns Null.
	 */
	state: () => null,
});

/** The turns of a timeline, or why they could not be read. */
type Projection = Pick<Conversation, "turns" | "failure">;

const NO_TURNS: Projection = Object.freeze({ turns: [], failure: null });

/**
 * The turns of a timeline, or why they could not be read.
 * @param timeline The timeline, or null before there is one.
 * @returns The turns and the failure.
 */
function projectionOf(timeline: BrowserTimeline | null): Projection {
	if (timeline === null) return NO_TURNS;
	try {
		return { turns: projectTimelineTurns(timeline), failure: null };
	} catch (error) {
		return { turns: [], failure: error instanceof Error ? error.message : String(error) };
	}
}

/**
 * The conversation a transport publishes.
 * @param transport The transport, or null while the pane has none.
 * @returns The conversation.
 */
function useConversation(transport: BrowserWorkbenchTransport | null): Conversation {
	const source: ConversationSource = transport ?? NO_TRANSPORT;
	const state = useSyncExternalStore(source.subscribe, source.state, source.state);
	const snapshot = state?.snapshot ?? null;
	// Projected again only when the timeline changes: a voice or queue delta
	// publishes a new snapshot around the same timeline, and must not redraw
	// every turn.
	const timeline = snapshot?.timeline ?? null;
	const projection = useMemo(() => projectionOf(timeline), [timeline]);
	return useMemo(() => ({ snapshot, ...projection }), [snapshot, projection]);
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
		/**
		 * Messages are sent from the composer, never through this runtime.
		 * @returns Nothing sent.
		 */
		onNew: () => Promise.resolve(),
	});
	return { runtime, conversation };
}

export { useAgentRuntime, useConversation, type Conversation };
