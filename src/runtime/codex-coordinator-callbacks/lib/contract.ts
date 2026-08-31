import type { ArchboardContext, ThreadInjectItemsParams } from "../../codex-instructions/index.js";
import type { CodexSession } from "../../codex-session/index.js";
import type {
	AppendTextRequest,
	RealtimeCorrelation,
	RealtimeHost,
} from "../../../shared/codex-realtime-host/index.js";
import type {
	ChildEpoch,
	ChildId,
	LogicalToolCallCorrelation,
	OperationId,
	QueuedSubmissionId,
	RealtimeSessionId,
	ThreadId,
	TurnId,
} from "../../../shared/codex-workbench-identity/index.js";
import type {
	PaneFocusEvent,
	PaneSelectionEvent,
	SemanticChangeOrigin,
	SemanticChangeSignificance,
	SemanticContextPublisher,
	SettledSemanticChangeEvent,
} from "../../codex-semantic-context/index.js";
import type { ThreadLinkSnapshot } from "../../codex-thread-link/index.js";
import type {
	CodexWorkhorseOperations,
	WorkhorseOperationEvent,
} from "../../codex-workhorse-operations/index.js";

export type SemanticCallbackSource =
	| SettledSemanticChangeEvent
	| PaneFocusEvent
	| PaneSelectionEvent;

export type CoordinatorCallbackSource = WorkhorseOperationEvent | SemanticCallbackSource;

/** Correlation copied from a source event at the callback boundary. */
export interface CoordinatorCallbackCorrelation {
	readonly operationId: OperationId | null;
	readonly childId: ChildId | null;
	readonly epoch: ChildEpoch | null;
	readonly coordinatorThreadId: ThreadId | null;
	readonly coordinatorTurnId: TurnId | null;
	readonly workhorseThreadId: ThreadId | null;
	readonly turnId: TurnId | null;
	readonly queuedSubmissionId: QueuedSubmissionId | null;
	readonly clientUserMessageId: string | null;
	readonly realtimeSessionId: RealtimeSessionId | null;
	readonly coordinatorCall: LogicalToolCallCorrelation | null;
}

interface CoordinatorOperationCallbackBase {
	readonly kind: "operation";
	readonly operation: Exclude<WorkhorseOperationEvent["operation"], "inspect_workhorse">;
	readonly queueOperation: WorkhorseOperationEvent["queueOperation"];
	readonly rpc: WorkhorseOperationEvent["rpc"];
	readonly correlation: CoordinatorCallbackCorrelation;
	readonly queuedSubmissionIds: readonly QueuedSubmissionId[];
	readonly detail: string | null;
}

export type CoordinatorOperationCallback =
	| (CoordinatorOperationCallbackBase & {
			readonly type: "accepted";
			readonly outcome: "pending";
	  })
	| (CoordinatorOperationCallbackBase & {
			readonly type: "queued";
			readonly outcome: "delivered";
	  })
	| (CoordinatorOperationCallbackBase & {
			readonly type: "started";
			readonly outcome: "delivered";
	  })
	| (CoordinatorOperationCallbackBase & {
			readonly type: "progress";
			readonly outcome: "delivered";
	  })
	| (CoordinatorOperationCallbackBase & {
			readonly type: "attention";
			readonly outcome: "delivered";
	  })
	| (CoordinatorOperationCallbackBase & {
			readonly type: "completed";
			readonly outcome: "delivered";
	  })
	| (CoordinatorOperationCallbackBase & {
			readonly type: "failed";
			readonly outcome: "delivered" | "not_delivered";
	  })
	| (CoordinatorOperationCallbackBase & {
			readonly type: "outcome_unknown";
			readonly outcome: "outcome_unknown";
	  });

export interface CoordinatorSemanticCallbackData {
	readonly feedId: string;
	readonly sequence: number | null;
	readonly origin: SemanticChangeOrigin | null;
	readonly significance: SemanticChangeSignificance | null;
	readonly brief: string;
	readonly capturedAtMs: number;
	readonly paneId: string;
	readonly focused: boolean;
	readonly selection: readonly string[];
	readonly detail: string | null;
}

interface CoordinatorSemanticCallbackBase {
	readonly kind: "semantic";
	readonly correlation: CoordinatorCallbackCorrelation;
	readonly threadLinkState: "executable" | "inspect_only" | "unbound";
	readonly threadLinkReason: string | null;
	readonly semantic: CoordinatorSemanticCallbackData;
}

export type CoordinatorSemanticCallback =
	| (CoordinatorSemanticCallbackBase & {
			readonly type: "change";
	  })
	| (CoordinatorSemanticCallbackBase & {
			readonly type: "focus";
	  })
	| (CoordinatorSemanticCallbackBase & {
			readonly type: "selection";
	  });

export type CoordinatorCallback = CoordinatorOperationCallback | CoordinatorSemanticCallback;

export interface CoordinatorCallbackRealtime {
	/** The wire identity that gates the active browser session. */
	readonly wireSessionId: RealtimeSessionId;
	/** The browser identity sent to `thread/realtime/appendText`. */
	readonly correlation: RealtimeCorrelation;
}

/** The complete current authority snapshot used after a callback leaves the FIFO. */
export interface CoordinatorCallbackCurrent {
	readonly childId: ChildId;
	readonly epoch: ChildEpoch;
	readonly coordinatorThreadId: ThreadId;
	readonly link: ThreadLinkSnapshot | null;
	readonly realtime: CoordinatorCallbackRealtime | null;
}

export type CoordinatorCallbackDeliveryOutcome = "delivered" | "not_delivered" | "outcome_unknown";

export type CoordinatorCallbackDeliveryPath =
	| "none"
	| "silent"
	| "realtime_appendText"
	| "thread_inject_items";

export type CallbackBufferOverflowReason = "buffer_overflow" | "coalesced";

export type CoordinatorCallbackDeliveryReason =
	| CallbackBufferOverflowReason
	| "child_exit"
	| "disposed"
	| "invalid_callback"
	| "invalid_context"
	| "not_ready"
	| "prior_epoch"
	| "stale_child"
	| "stale_coordinator"
	| "stale_link"
	| "stale_session"
	| "voice_inactive"
	| "rejected"
	| "cancelled"
	| "session_rejected"
	| "response_lost"
	| "transport_failure";

export interface CoordinatorCallbackDelivery {
	readonly kind: "coordinator_callback_delivery";
	/** Null is used only for an invalid runtime input rejected before enqueue. */
	readonly callback: CoordinatorCallback | null;
	readonly attempted: boolean;
	readonly path: CoordinatorCallbackDeliveryPath;
	readonly outcome: CoordinatorCallbackDeliveryOutcome;
	readonly reason: CoordinatorCallbackDeliveryReason | null;
	/** Canonical context bytes used by the route, or built before a stale refusal. */
	readonly text: string | null;
	readonly payload: ThreadInjectItemsParams | null;
	readonly realtimeRequest: AppendTextRequest | null;
}

export interface CoordinatorCallbackOptions {
	readonly semantic: Pick<
		SemanticContextPublisher,
		"subscribeSettledChange" | "subscribePaneFocus" | "subscribePaneSelection"
	>;
	readonly operations: Pick<CodexWorkhorseOperations, "subscribe">;
	readonly realtime: Pick<RealtimeHost, "appendText">;
	readonly session: Pick<CodexSession, "threadInjectItems">;
	readonly current: () => CoordinatorCallbackCurrent | null;
	/** Supplies the scalar context that this immutable callback is allowed to send. */
	readonly contextFor: (
		callback: CoordinatorCallback,
		current: CoordinatorCallbackCurrent,
	) => ArchboardContext;
}

export interface CoordinatorCallbacks {
	/** Enqueue a source event; settlement never rejects. */
	readonly enqueue: (event: CoordinatorCallbackSource) => Promise<CoordinatorCallbackDelivery>;
	/** Wait for the scheduled FIFO drain, including callbacks enqueued by callbacks. */
	readonly flush: () => Promise<void>;
	/** Returns settled records in first-settlement order. */
	readonly inspect: () => readonly CoordinatorCallbackDelivery[];
	readonly get: (event: CoordinatorCallbackSource) => CoordinatorCallbackDelivery | undefined;
	readonly pendingCount: () => number;
	readonly dispose: () => void;
}
