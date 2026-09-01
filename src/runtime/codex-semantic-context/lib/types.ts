import type {
	ChildEpoch,
	ChildId,
	RealtimeSessionId,
	ThreadId,
	TurnId,
} from "../../../shared/codex-workbench-identity/index.js";

export type SemanticChangeOrigin = "human" | "agent" | "mixed";
export type SemanticChangeSignificance = "layout" | "structural" | "cosmetic";
export type SemanticBriefSource =
	| "settled_change"
	| "pane_focus"
	| "pane_selection"
	| "fresh_brief";
export type SemanticThreadLinkState = "executable" | "inspect_only" | "unbound";
export type SemanticClaimHolder = "human" | "agent" | "none";
export type SemanticPublisherPort = "settled_change" | "pane_focus" | "pane_selection";

export type SemanticUnsubscribe = () => void;

export interface SemanticCursor {
	readonly feedId: string;
	readonly sequence: number;
}

export type SemanticCursorInput = SemanticCursor;

/** The settled fields consumed from the existing change feed. */
export interface SettledChangeSourceEvent {
	readonly cursor: number;
	readonly board: string;
	readonly at: string;
	readonly origin: SemanticChangeOrigin;
	readonly significance: SemanticChangeSignificance;
	readonly text: string;
}

/** The one settled-change callback the existing change feed provides. */
export interface SettledChangeSource {
	readonly onChange: (listener: (event: SettledChangeSourceEvent) => void) => SemanticUnsubscribe;
}

/** A source adapter for immediate pane telemetry. It owns no settle timer. */
export interface PaneSignalSource {
	readonly onFocus: (listener: (input: SemanticContextInput) => void) => SemanticUnsubscribe;
	readonly onSelection: (listener: (input: SemanticContextInput) => void) => SemanticUnsubscribe;
}

/** A board/context reader used only by the on-demand fresh-brief port. */
export interface FreshBriefSource {
	readonly read: () => SemanticContextInput;
}

export interface SemanticBoardInput {
	readonly key: string;
	readonly note: string;
	readonly version: number | null;
}

export interface SemanticPaneInput {
	readonly paneId: string;
	readonly focused: boolean;
}

export interface SemanticThreadLinkInput {
	readonly state: SemanticThreadLinkState;
	readonly reason: string | null;
}

export interface SemanticWorkhorseInput {
	readonly threadId: ThreadId | null;
	readonly turnId: TurnId | null;
}

export interface SemanticCoordinatorInput {
	readonly threadId: ThreadId | null;
	readonly realtimeSessionId: RealtimeSessionId | null;
}

export interface SemanticChildInput {
	readonly id: ChildId | null;
	readonly epoch: ChildEpoch | null;
}

export interface SemanticClaimInput {
	readonly holder: SemanticClaimHolder;
	readonly doing: string | null;
}

/**
 * Scalar context supplied by a composition adapter.
 *
 * `description` is already the compact result of the public board-description
 * port. The publisher never receives board elements and never stores a board
 * document.
 */
export interface SemanticContextInput {
	readonly repository: string;
	readonly child?: SemanticChildInput;
	readonly threadLink?: SemanticThreadLinkInput;
	readonly workhorse?: SemanticWorkhorseInput;
	readonly coordinator?: SemanticCoordinatorInput;
	readonly board: SemanticBoardInput;
	readonly pane: SemanticPaneInput;
	readonly selection: readonly string[];
	readonly claim?: SemanticClaimInput;
	readonly doing: string | null;
	readonly cursor: SemanticCursorInput | null;
	readonly description: string;
	readonly ambiguity?: readonly string[];
	readonly stale?: boolean;
	readonly staleReasons?: readonly string[];
}

export interface SemanticBoard {
	readonly key: string;
	readonly note: string;
}

export interface SemanticPane {
	readonly paneId: string;
	readonly focused: boolean;
}

export interface SemanticThreadLink {
	readonly state: SemanticThreadLinkState;
	readonly reason: string | null;
}

export interface SemanticWorkhorse {
	readonly threadId: ThreadId | null;
	readonly turnId: TurnId | null;
}

export interface SemanticCoordinator {
	readonly threadId: ThreadId | null;
	readonly realtimeSessionId: RealtimeSessionId | null;
}

export interface SemanticChild {
	readonly id: ChildId | null;
	readonly epoch: ChildEpoch | null;
}

export interface SemanticClaim {
	readonly holder: SemanticClaimHolder;
	readonly doing: string | null;
}

export interface SemanticFreshness {
	readonly capturedAtMs: number;
	readonly freshUntilMs: number;
	readonly state: "fresh" | "stale";
}

export interface SemanticStaleness {
	readonly state: "current" | "stale";
	readonly reasons: readonly string[];
}

export interface SemanticBriefFields {
	readonly source: SemanticBriefSource;
	readonly origin: SemanticChangeOrigin | null;
	readonly feedId: string;
	readonly repository: string;
	readonly child: SemanticChild;
	readonly threadLink: SemanticThreadLink;
	readonly workhorse: SemanticWorkhorse;
	readonly coordinator: SemanticCoordinator;
	readonly board: SemanticBoard;
	readonly pane: SemanticPane;
	readonly version: number | null;
	readonly selection: readonly string[];
	readonly claim: SemanticClaim;
	readonly doing: string | null;
	readonly cursor: SemanticCursor | null;
	readonly description: string;
	readonly freshness: SemanticFreshness;
	readonly truncated: boolean;
	readonly ambiguity: readonly string[];
	readonly staleness: SemanticStaleness;
	/** Compact, deterministic JSON for the later instruction/delivery adapter. */
	readonly brief: string;
	readonly bytes: number;
}

export interface SettledSemanticChangeEvent extends SemanticBriefFields {
	readonly kind: "settled_change";
	readonly change: {
		readonly feedId: string;
		readonly cursor: SemanticCursor;
		readonly board: string;
		readonly at: string;
		readonly origin: SemanticChangeOrigin;
		readonly significance: SemanticChangeSignificance;
		readonly text: string;
	};
}

export interface PaneFocusEvent extends SemanticBriefFields {
	readonly kind: "pane_focus";
	readonly focus: {
		readonly paneId: string;
		readonly focused: boolean;
		readonly capturedAtMs: number;
	};
}

export interface PaneSelectionEvent extends SemanticBriefFields {
	readonly kind: "pane_selection";
	readonly selectionCapturedAtMs: number;
}

export interface FreshSemanticBrief extends SemanticBriefFields {
	readonly kind: "fresh_brief";
}

export interface SemanticListenerFailure {
	readonly port: SemanticPublisherPort;
	readonly eventKind: SemanticBrief["kind"];
	readonly listenerIndex: number;
	readonly errorName: string;
	readonly message: string;
}

export interface SemanticListenerFailureBatch {
	readonly entries: readonly SemanticListenerFailure[];
	readonly droppedCount: number;
}

export interface SemanticListenerDiagnosticPolicy {
	/** Maximum number of oldest failure entries retained before a drain. */
	readonly maxEntries: number;
	/** Maximum UTF-8 bytes of the JSON string token used for an error name. */
	readonly errorNameBytes: number;
	/** Maximum UTF-8 bytes of the JSON string token used for a message. */
	readonly messageBytes: number;
	/** Maximum UTF-8 bytes of JSON.stringify({ entries, droppedCount }). */
	readonly maxBatchBytes: number;
}

export type SemanticBrief =
	| SettledSemanticChangeEvent
	| PaneFocusEvent
	| PaneSelectionEvent
	| FreshSemanticBrief;

export interface SemanticContextPublisherOptions {
	readonly feed: SettledChangeSource;
	/** Feed identity makes a cursor from one process distinct after reload. */
	readonly feedId: string;
	readonly fresh: FreshBriefSource;
	/** Must provide scalar state only; it must not read or retain board elements. */
	readonly contextForChange: (event: SettledChangeSourceEvent) => SemanticContextInput;
	readonly pane?: PaneSignalSource;
	readonly now?: () => number;
}

export interface SemanticContextPublisher {
	readonly subscribeSettledChange: (
		listener: (event: SettledSemanticChangeEvent) => void,
	) => SemanticUnsubscribe;
	readonly subscribePaneFocus: (listener: (event: PaneFocusEvent) => void) => SemanticUnsubscribe;
	readonly subscribePaneSelection: (
		listener: (event: PaneSelectionEvent) => void,
	) => SemanticUnsubscribe;
	readonly publishPaneFocus: (input: SemanticContextInput) => PaneFocusEvent;
	readonly publishPaneSelection: (input: SemanticContextInput) => PaneSelectionEvent;
	readonly freshBrief: () => FreshSemanticBrief;
	/** Build the same canonical brief from one already-captured exact pane snapshot. */
	readonly freshBriefFor: (input: SemanticContextInput) => FreshSemanticBrief;
	/** Returns and clears the oldest bounded failures and the dropped count. */
	readonly drainListenerFailures: () => SemanticListenerFailureBatch;
	readonly dispose: () => void;
}
