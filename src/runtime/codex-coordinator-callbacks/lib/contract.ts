import type { CoordinatorSnapshot } from "../../codex-coordinator/index.js";
import type { CodexSession, SessionParams } from "../../codex-session/index.js";
import type {
	PaneFocusEvent,
	PaneSelectionEvent,
	SemanticChangeOrigin,
	SemanticChangeSignificance,
	SemanticContextPublisher,
	SettledSemanticChangeEvent,
} from "../../codex-semantic-context/index.js";
import type {
	CodexThreadLinkClassifier,
	ThreadLinkBindingSnapshot,
	ThreadLinkClassification,
	ThreadLinkTarget,
} from "../../codex-thread-link/index.js";
import type {
	CodexWorkhorseOperations,
	WorkhorseOperationEvent,
} from "../../codex-workhorse-operations/index.js";
import type {
	RealtimeCorrelationId,
	RealtimeSessionId as BrowserRealtimeSessionId,
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

export type SemanticCallbackSource =
	| SettledSemanticChangeEvent
	| PaneFocusEvent
	| PaneSelectionEvent;
export type CoordinatorCallbackSource = WorkhorseOperationEvent | SemanticCallbackSource;

export interface CoordinatorCallbackLinkCorrelation {
	readonly binding: ThreadLinkBindingSnapshot;
	readonly target: ThreadLinkTarget;
}

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
	readonly workhorseLink: CoordinatorCallbackLinkCorrelation;
	readonly realtimeGeneration: CoordinatorCallbackRealtimeGeneration | null;
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
	| (CoordinatorOperationCallbackBase & { readonly type: "accepted"; readonly outcome: "pending" })
	| (CoordinatorOperationCallbackBase & { readonly type: "queued"; readonly outcome: "delivered" })
	| (CoordinatorOperationCallbackBase & { readonly type: "started"; readonly outcome: "delivered" })
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
	| (CoordinatorSemanticCallbackBase & { readonly type: "change" })
	| (CoordinatorSemanticCallbackBase & { readonly type: "focus" })
	| (CoordinatorSemanticCallbackBase & { readonly type: "selection" });
export type CoordinatorCallback = CoordinatorOperationCallback | CoordinatorSemanticCallback;

export interface CoordinatorCallbackRealtimeGeneration {
	readonly childId: ChildId;
	readonly epoch: ChildEpoch;
	readonly coordinatorThreadId: ThreadId;
	readonly wireSessionId: RealtimeSessionId;
	readonly browserSessionId: BrowserRealtimeSessionId;
	readonly browserCorrelationId: RealtimeCorrelationId;
}

export interface CoordinatorCallbackRealtimeRequest {
	readonly generation: CoordinatorCallbackRealtimeGeneration;
	readonly params: SessionParams<"thread/realtime/appendText">;
}

export type CoordinatorCallbackDeliveryOutcome = "delivered" | "not_delivered" | "outcome_unknown";
export interface CoordinatorCallbackMutationResult {
	readonly attempted: boolean;
	readonly outcome: CoordinatorCallbackDeliveryOutcome;
	readonly reason: "stale_session" | "session_rejected" | "response_lost" | null;
}

export interface CoordinatorCallbackRealtimePort {
	readonly appendDeveloper: (
		request: CoordinatorCallbackRealtimeRequest,
	) => Promise<CoordinatorCallbackMutationResult>;
}

export interface CoordinatorCallbackCurrentChild {
	readonly childId: ChildId;
	readonly epoch: ChildEpoch;
}

export type CoordinatorCallbackReadyCoordinator = CoordinatorSnapshot & {
	readonly state: "ready";
	readonly threadId: ThreadId;
	readonly childId: ChildId;
	readonly epoch: ChildEpoch;
};

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
	| "not_ready"
	| "prior_epoch"
	| "stale_child"
	| "stale_coordinator"
	| "stale_link"
	| "stale_session"
	| "voice_inactive"
	| "session_rejected"
	| "response_lost"
	| "transport_failure";

export interface CoordinatorCallbackDelivery {
	readonly kind: "coordinator_callback_delivery";
	readonly callback: CoordinatorCallback | null;
	readonly attempted: boolean;
	readonly path: CoordinatorCallbackDeliveryPath;
	readonly outcome: CoordinatorCallbackDeliveryOutcome;
	readonly reason: CoordinatorCallbackDeliveryReason | null;
	readonly text: string | null;
	readonly payload: SessionParams<"thread/inject_items"> | null;
	readonly realtimeRequest: CoordinatorCallbackRealtimeRequest | null;
}

export interface CoordinatorCallbackOptions {
	readonly semantic: Pick<
		SemanticContextPublisher,
		"subscribeSettledChange" | "subscribePaneFocus" | "subscribePaneSelection"
	>;
	readonly operations: Pick<CodexWorkhorseOperations, "subscribe">;
	readonly session: Pick<CodexSession, "threadInjectItems">;
	readonly realtime: CoordinatorCallbackRealtimePort;
	readonly threadLink: Pick<CodexThreadLinkClassifier, "classify">;
	readonly currentChild: () => CoordinatorCallbackCurrentChild | null;
	readonly currentCoordinator: () => CoordinatorCallbackReadyCoordinator | null;
	readonly currentWorkhorseLink: () => CoordinatorCallbackLinkCorrelation | null;
	readonly currentRealtimeGeneration: () => CoordinatorCallbackRealtimeGeneration | null;
}

export interface CoordinatorCallbacks {
	readonly enqueue: (event: CoordinatorCallbackSource) => Promise<CoordinatorCallbackDelivery>;
	readonly flush: () => Promise<void>;
	readonly inspect: () => readonly CoordinatorCallbackDelivery[];
	readonly get: (event: CoordinatorCallbackSource) => CoordinatorCallbackDelivery | undefined;
	readonly pendingCount: () => number;
	readonly dispose: () => void;
}

export interface CoordinatorCallbacksRetainedState {
	current: CoordinatorCallbacks | null;
}

export interface CoordinatorCallbackClassification {
	readonly captured: CoordinatorCallbackLinkCorrelation;
	readonly live: ThreadLinkClassification;
}
