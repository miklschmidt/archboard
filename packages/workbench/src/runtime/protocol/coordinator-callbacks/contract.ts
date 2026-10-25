export type {
	CoordinatorCallbackLinkCorrelation,
	CoordinatorCallbackCorrelation,
	CoordinatorCallbackContextPort,
	CoordinatorCallback,
	CoordinatorCallbackRealtimeGeneration,
	CoordinatorCallbackRealtimeRequest,
	CoordinatorCallbackTurnPort,
	CoordinatorCallbackCurrentChild,
	CoordinatorCallbackReadyCoordinator,
} from "@archboard/codex-realtime-voice/runtime";

import type {
	CoordinatorCallbackSource as CoreSource,
	CoordinatorCallbackOptions as CoreOptions,
	CoordinatorCallbacks as CoreCallbacks,
} from "@archboard/codex-realtime-voice/runtime";
import type {
	PaneFocusEvent,
	PaneSelectionEvent,
	SettledSemanticChangeEvent,
	SemanticContextPublisher,
} from "#runtime/schemas/semantic-context-types.ts";
export type SemanticCallbackSource =
	| SettledSemanticChangeEvent
	| PaneFocusEvent
	| PaneSelectionEvent;
export type CoordinatorCallbackSource = CoreSource | SemanticCallbackSource;
export type CoordinatorCallbackOptions = Omit<CoreOptions, "host"> & {
	readonly semantic: Pick<
		SemanticContextPublisher,
		"subscribeSettledChange" | "subscribePaneFocus" | "subscribePaneSelection"
	>;
	readonly canvas: () => CoordinatorCallbackCanvas;
};
export type CoordinatorCallbacks = Omit<CoreCallbacks, "enqueue" | "get"> & {
	readonly enqueue: (event: CoordinatorCallbackSource) => ReturnType<CoreCallbacks["enqueue"]>;
	readonly get: (event: CoordinatorCallbackSource) => ReturnType<CoreCallbacks["get"]>;
};

/**
 * One subject a person picked out, as the callback names it.
 *
 * Identities only. What it is called is in the brief, which the same callback
 * carries whole; repeating a label here would be a second answer to "what is
 * this called" that could disagree with the first.
 */
export interface CoordinatorSemanticSubject {
	readonly kind: string;
	readonly id: string;
}

/** Pane news as the voice model is given it (TASK-293). */
export interface CoordinatorPaneNews {
	/** The one sentence of names: where the user's reading now stands, or what changed under it. */
	readonly sentence: string;
	/**
	 * Whether, during a narration, it is a reason to stop the talk: a pick that is not empty, a
	 * view or variant the user chose, or anything an agent outside this session did. An emptied
	 * selection or a move to another pane is not.
	 */
	readonly stops: boolean;
	/**
	 * Who did what it tells: the user by hand, or an agent that is neither this session's workhorse
	 * nor its coordinator (TASK-293.06). Neither of those asked for an agent's change, so the
	 * coordinator is told it too.
	 */
	readonly by: "user" | "agent";
	/**
	 * For a board an outside agent wrote, its aggregate key: the write is told only while a pane of
	 * this canvas shows that board, and stops only a narration of it. Null for anything else.
	 */
	readonly board: string | null;
}

/** What the canvas of this tab session holds now, read when a callback is delivered. */
export interface CoordinatorCallbackCanvas {
	/** The boards its panes show, by aggregate key. */
	readonly boards: readonly string[];
	/**
	 * The board a live narration in one of its panes is on, by aggregate key, or null when none is
	 * under way. A recording is no narration: nobody is listening to stop for.
	 */
	readonly narrated: string | null;
}

/**
 * Archboard's payload of a host-context event: the pane, the board selection and the pane news
 * that Archboard's callback policy reads and encodes.
 */
export interface ArchboardHostContext {
	readonly origin: "human" | "agent" | "mixed" | null;
	readonly significance: string | null;
	readonly paneId: string;
	readonly focused: boolean;
	/** The selected subjects of the board, never anything that was drawn. */
	readonly selection: readonly CoordinatorSemanticSubject[];
	readonly detail: string | null;
	/**
	 * The pane news this event is, or null when nothing of it was the user's own doing and nobody
	 * is told (TASK-293, ADR 0034).
	 */
	readonly news: CoordinatorPaneNews | null;
}
