// The conversation as an assistant-ui runtime: the transport's published
// timelines, projected into turns and adapted into messages at the one seam.
// The workhorse's turns are what the dock and the composer read; the runtime
// shows the voice coordinator's among them. The runtime only shows; nothing is
// sent through it — messages go through the agent setup from the composer in
// the conversation.

import { useExternalStoreRuntime, type AssistantRuntime } from "@assistant-ui/react";
import { useMemo, useSyncExternalStore } from "react";

import { toThreadMessageLike } from "#ui/rules/runtime/messages.ts";
import { mergeConversation, projectTimelineTurns } from "@archboard/codex-realtime-voice/controllers";
import { type ConversationOwner, type ConversationTurn } from "@archboard/codex-realtime-voice/controllers";
import type { BrowserTimeline } from "@archboard/codex-realtime-voice/contract";
import type {
	BrowserWorkbenchState,
	BrowserWorkbenchTransport,
} from "@archboard/codex-realtime-voice/controllers";

/** The conversation, or why it could not be read. */
interface Conversation {
	/** The snapshot it was read from, or null before one arrives. */
	readonly snapshot: BrowserWorkbenchState["snapshot"];
	/** The workhorse's turns: what the dock's status and the composer's running state read. */
	readonly turns: readonly ConversationTurn[];
	/** The voice coordinator's turns, which the conversation shows among the workhorse's. */
	readonly coordinatorTurns: readonly ConversationTurn[];
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

/** One timeline's turns, or why they could not be read. */
interface Projection {
	readonly turns: readonly ConversationTurn[];
	readonly failure: string | null;
}

const NO_TURNS: Projection = Object.freeze({ turns: [], failure: null });

/**
 * The turns of a timeline, or why they could not be read.
 * @param timeline The timeline, or null before there is one.
 * @param owner Whose thread it is.
 * @returns The turns and the failure.
 */
function projectionOf(timeline: BrowserTimeline | null, owner: ConversationOwner): Projection {
	if (timeline === null) return NO_TURNS;
	try {
		return { turns: projectTimelineTurns(timeline, owner), failure: null };
	} catch (error) {
		return { turns: [], failure: error instanceof Error ? error.message : String(error) };
	}
}

/**
 * The two timelines a snapshot publishes.
 * @param snapshot The snapshot, or null before one arrives.
 * @returns The workhorse's timeline and the voice coordinator's, each null while there is none.
 */
function timelinesOf(snapshot: Conversation["snapshot"]): {
	readonly timeline: BrowserTimeline | null;
	readonly coordinatorTimeline: BrowserTimeline | null;
} {
	return {
		timeline: snapshot?.timeline ?? null,
		coordinatorTimeline: snapshot?.coordinatorTimeline ?? null,
	};
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
	// Each timeline is projected again only when it changes: a voice or queue
	// delta publishes a new snapshot around the same timelines, and must not
	// redraw every turn.
	const { timeline, coordinatorTimeline } = timelinesOf(snapshot);
	const workhorse = useMemo(() => projectionOf(timeline, "workhorse"), [timeline]);
	const coordinator = useMemo(
		() => projectionOf(coordinatorTimeline, "coordinator"),
		[coordinatorTimeline],
	);
	return useMemo(
		() => ({
			snapshot,
			turns: workhorse.turns,
			coordinatorTurns: coordinator.turns,
			failure: workhorse.failure ?? coordinator.failure,
		}),
		[snapshot, workhorse, coordinator],
	);
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
	const turns = useMemo(
		() => mergeConversation(conversation.turns, conversation.coordinatorTurns),
		[conversation.turns, conversation.coordinatorTurns],
	);
	const running = turns.some((turn) => turn.outcome === "running");
	const runtime = useExternalStoreRuntime<ConversationTurn>({
		messages: turns,
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
