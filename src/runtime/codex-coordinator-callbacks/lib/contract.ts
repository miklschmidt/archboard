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

type SemanticCallbackSource = SettledSemanticChangeEvent | PaneFocusEvent | PaneSelectionEvent;
type CoordinatorCallbackSource = WorkhorseOperationEvent | SemanticCallbackSource;

interface CoordinatorCallbackLinkCorrelation {
	readonly binding: ThreadLinkBindingSnapshot;
	readonly target: ThreadLinkTarget;
}

interface CoordinatorCallbackCorrelation {
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

type CoordinatorOperationCallback =
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

interface CoordinatorSemanticCallbackData {
	readonly feedId: string;
	readonly sequence: number | null;
	readonly origin: SemanticChangeOrigin | null;
	readonly significance: SemanticChangeSignificance | null;
	readonly brief: string;
	readonly capturedAtMs: number;
	readonly freshUntilMs: number;
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

type CoordinatorSemanticCallback =
	| (CoordinatorSemanticCallbackBase & { readonly type: "change" })
	| (CoordinatorSemanticCallbackBase & { readonly type: "focus" })
	| (CoordinatorSemanticCallbackBase & { readonly type: "selection" });
type CoordinatorCallback = CoordinatorOperationCallback | CoordinatorSemanticCallback;

interface CoordinatorCallbackRealtimeGeneration {
	readonly childId: ChildId;
	readonly epoch: ChildEpoch;
	readonly coordinatorThreadId: ThreadId;
	readonly wireSessionId: RealtimeSessionId;
	readonly browserSessionId: BrowserRealtimeSessionId;
	readonly browserCorrelationId: RealtimeCorrelationId;
}

interface CoordinatorCallbackRealtimeRequest {
	readonly generation: CoordinatorCallbackRealtimeGeneration;
	readonly params: SessionParams<"thread/realtime/appendText">;
}

type CoordinatorCallbackDeliveryOutcome = "delivered" | "not_delivered" | "outcome_unknown";
interface CoordinatorCallbackMutationResult {
	readonly attempted: boolean;
	readonly outcome: CoordinatorCallbackDeliveryOutcome;
	readonly reason: "stale_session" | "session_rejected" | "response_lost" | null;
}

interface CoordinatorCallbackRealtimePort {
	readonly appendDeveloper: (
		request: CoordinatorCallbackRealtimeRequest,
	) => Promise<CoordinatorCallbackMutationResult>;
}

interface CoordinatorCallbackCurrentChild {
	readonly childId: ChildId;
	readonly epoch: ChildEpoch;
}

type CoordinatorCallbackReadyCoordinator = CoordinatorSnapshot & {
	readonly state: "ready";
	readonly threadId: ThreadId;
	readonly childId: ChildId;
	readonly epoch: ChildEpoch;
};

type CoordinatorCallbackDeliveryPath =
	| "none"
	| "silent"
	| "realtime_appendText"
	| "thread_inject_items";
type CallbackBufferOverflowReason = "buffer_overflow" | "coalesced";
type CoordinatorCallbackDeliveryReason =
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

interface CoordinatorCallbackDeliveryBase {
	readonly kind: "coordinator_callback_delivery";
	readonly callback: CoordinatorCallback | null;
	/** Monotonic first-seen order assigned by this callback owner. */
	readonly sourceOrder: number;
	readonly freshness: {
		readonly capturedAtMs: number;
		readonly freshUntilMs: number;
	};
	readonly path: CoordinatorCallbackDeliveryPath;
	readonly reason: CoordinatorCallbackDeliveryReason | null;
	readonly text: string | null;
	readonly payload: SessionParams<"thread/inject_items"> | null;
	readonly realtimeRequest: CoordinatorCallbackRealtimeRequest | null;
}

type CoordinatorCallbackDelivery = CoordinatorCallbackDeliveryBase &
	(
		| {
				readonly attempted: false;
				readonly attemptedAtMs: null;
				readonly outcome: "not_delivered";
		  }
		| {
				readonly attempted: true;
				readonly attemptedAtMs: number;
				readonly outcome: CoordinatorCallbackDeliveryOutcome;
		  }
	);

interface CoordinatorCallbackOptions {
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
	/** Captures callback receipt and the instant immediately before an outbound attempt. */
	readonly now?: () => number;
	/** Publishes one settled immutable record to presentation subscribers. */
	readonly onSettled?: () => void;
	/** Injectable bounded history capacity; production uses CALLBACK_BUFFER_LIMIT. */
	readonly settledLedgerLimit?: number;
}

interface CoordinatorCallbackHistory {
	readonly deliveries: readonly CoordinatorCallbackDelivery[];
	/** Records evicted before the retained suffix for this exact realtime generation. */
	readonly omittedPrefixCount: number;
}

interface CoordinatorCallbacks {
	readonly enqueue: (event: CoordinatorCallbackSource) => Promise<CoordinatorCallbackDelivery>;
	readonly flush: () => Promise<void>;
	readonly inspect: () => readonly CoordinatorCallbackDelivery[];
	readonly inspectHistory: (
		generation: CoordinatorCallbackRealtimeGeneration,
	) => CoordinatorCallbackHistory;
	readonly get: (event: CoordinatorCallbackSource) => CoordinatorCallbackDelivery | undefined;
	readonly pendingCount: () => number;
	readonly dispose: () => void;
}

interface CoordinatorCallbacksRetainedState {
	current: CoordinatorCallbacks | null;
}

interface CoordinatorCallbackClassification {
	readonly captured: CoordinatorCallbackLinkCorrelation;
	readonly live: ThreadLinkClassification;
}

export {
	type SemanticCallbackSource,
	type CoordinatorCallbackSource,
	type CoordinatorCallbackLinkCorrelation,
	type CoordinatorCallbackCorrelation,
	type CoordinatorOperationCallback,
	type CoordinatorSemanticCallbackData,
	type CoordinatorSemanticCallback,
	type CoordinatorCallback,
	type CoordinatorCallbackRealtimeGeneration,
	type CoordinatorCallbackRealtimeRequest,
	type CoordinatorCallbackDeliveryOutcome,
	type CoordinatorCallbackMutationResult,
	type CoordinatorCallbackRealtimePort,
	type CoordinatorCallbackCurrentChild,
	type CoordinatorCallbackReadyCoordinator,
	type CoordinatorCallbackDeliveryPath,
	type CallbackBufferOverflowReason,
	type CoordinatorCallbackDeliveryReason,
	type CoordinatorCallbackDelivery,
	type CoordinatorCallbackOptions,
	type CoordinatorCallbackHistory,
	type CoordinatorCallbacks,
	type CoordinatorCallbacksRetainedState,
	type CoordinatorCallbackClassification,
};
