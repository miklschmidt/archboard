import type { CoordinatorSnapshot } from "#runtime/protocol/coordinator/contract.ts";
import type { SessionParams } from "@archboard/codex-app-server/session";
import type {
	CodexThreadLinkClassifier,
	ThreadLinkBindingSnapshot,
	ThreadLinkClassification,
	ThreadLinkTarget,
} from "#runtime/rules/thread-link/contract.ts";
import type {
	CodexWorkhorseOperations,
	WorkhorseOperationEvent,
} from "#runtime/protocol/workhorse-operations/contract.ts";
import type {
	RealtimeCorrelationId,
	RealtimeSessionId as BrowserRealtimeSessionId,
} from "#shared/protocol/realtime-contract.ts";
import type {
	CodexTransport,
	DynamicServerRequest,
	TransportServerNotification,
} from "@archboard/codex-app-server/transport";
import type {
	ChildEpoch,
	ChildId,
	IdentityAuthority,
	LogicalToolCallCorrelation,
	OperationId,
	QueuedSubmissionId,
	RealtimeSessionId,
	ThreadId,
	TurnId,
} from "@archboard/codex-app-server/identity";

/**
 * One announced change for the coordinator or the voice of one tab session, under the execution
 * identities the agent read when it was announced. The callbacks capture their own correlation;
 * these identities only scope the change.
 */
interface ContextAnnouncementSource {
	readonly kind: "context";
	readonly audience: "coordinator" | "voice";
	readonly child: { readonly id: ChildId | null; readonly epoch: ChildEpoch | null };
	readonly coordinator: {
		readonly threadId: ThreadId | null;
		readonly realtimeSessionId: RealtimeSessionId | null;
	};
	readonly workhorse: { readonly threadId: ThreadId | null; readonly turnId: TurnId | null };
	readonly threadLink: {
		readonly state: "executable" | "inspect_only" | "unbound";
		readonly reason: string | null;
	};
	readonly context: AnnouncedContext;
	/**
	 * The thread that made the change, or null. A change this session's own workhorse or
	 * coordinator made is refused as `own_change` before delivery.
	 */
	readonly author: string | null;
}

/**
 * One event of the linked workhorse thread itself, whoever started the turn (TASK-321): a turn
 * that ended, one that began waiting on the user, or a message the workhorse sent the coordinator.
 */
interface WorkhorseNewsSource {
	readonly kind: "workhorse_news";
	readonly type: "completed" | "failed" | "stopped" | "waiting" | "message";
	/** Counts news from one observer, so two waits in one turn are two pieces of news. */
	readonly sequence: number;
	readonly childId: ChildId;
	readonly epoch: ChildEpoch;
	readonly coordinatorThreadId: ThreadId;
	readonly workhorseThreadId: ThreadId;
	readonly turnId: TurnId | null;
	/** What a failed turn's error said, or what the workhorse's message said; null otherwise. */
	readonly detail: string | null;
}

type CoordinatorCallbackSource =
	| WorkhorseOperationEvent
	| ContextAnnouncementSource
	| WorkhorseNewsSource;

interface CoordinatorCallbackLinkCorrelation {
	readonly binding: ThreadLinkBindingSnapshot;
	readonly target: ThreadLinkTarget;
	/** The checkout the workhorse works in, which news of it names (ADR 0050). */
	readonly checkout: string;
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

/**
 * What a callback carries of one announced change: its identity, its freshness and the host's
 * words. A change is identified by its feed and sequence; two with the same identity share one
 * delivery.
 */
interface AnnouncedContext {
	/** The host feed the change belongs to. Changes of two feeds never coalesce. */
	readonly feedId: string;
	readonly sequence: number;
	/** When the host captured the change; the delivery record's freshness starts here. */
	readonly capturedAtMs: number;
	/** Until when the change is fresh; the delivery record's freshness ends here. */
	readonly freshUntilMs: number;
	/** What the change is about: a later one of the same feed and topic replaces it while it waits. */
	readonly topic: string | null;
	/** The words to tell, or null when the host withheld them. */
	readonly text: string | null;
	/** Why the host told nothing, or null. */
	readonly withheld: string | null;
	/** Whether the voice answers the words now, rather than keeping them as quiet context. */
	readonly speech: boolean;
}

/** One normalized announced change, delivered to the coordinator or to the voice. */
interface CoordinatorContextCallback {
	readonly kind: "context";
	readonly audience: ContextAnnouncementSource["audience"];
	readonly correlation: CoordinatorCallbackCorrelation;
	readonly threadLinkState: "executable" | "inspect_only" | "unbound";
	readonly threadLinkReason: string | null;
	readonly context: AnnouncedContext;
}
/** Workhorse news about the linked workhorse thread, as the coordinator is given it (TASK-321). */
interface CoordinatorWorkhorseNewsCallback {
	readonly kind: "workhorse_news";
	readonly type: WorkhorseNewsSource["type"];
	readonly sequence: number;
	readonly correlation: CoordinatorCallbackCorrelation;
	readonly detail: string | null;
}

type CoordinatorCallback =
	| CoordinatorOperationCallback
	| CoordinatorContextCallback
	| CoordinatorWorkhorseNewsCallback;

interface CoordinatorCallbackRealtimeGeneration {
	readonly childId: ChildId;
	readonly epoch: ChildEpoch;
	readonly coordinatorThreadId: ThreadId;
	readonly wireSessionId: RealtimeSessionId;
	readonly browserSessionId: BrowserRealtimeSessionId;
	readonly browserCorrelationId: RealtimeCorrelationId;
}

/**
 * One append to the live voice session: quiet context the voice model may use, or speech it
 * answers now. In a full-duplex session appended text is quiet whatever role it carries; only
 * speakable text is something the voice model says (TASK-251).
 */
type CoordinatorCallbackRealtimeRequest =
	| {
			readonly generation: CoordinatorCallbackRealtimeGeneration;
			readonly channel: "context";
			readonly params: SessionParams<"thread/realtime/appendText">;
	  }
	| {
			readonly generation: CoordinatorCallbackRealtimeGeneration;
			readonly channel: "speech";
			readonly params: SessionParams<"thread/realtime/appendSpeech">;
	  };

type CoordinatorCallbackDeliveryOutcome = "delivered" | "not_delivered" | "outcome_unknown";
interface CoordinatorCallbackMutationResult {
	readonly attempted: boolean;
	readonly outcome: CoordinatorCallbackDeliveryOutcome;
	readonly reason: "stale_session" | "session_rejected" | "response_lost" | null;
}

interface CoordinatorCallbackRealtimePort {
	readonly append: (
		request: CoordinatorCallbackRealtimeRequest,
	) => Promise<CoordinatorCallbackMutationResult>;
}

/**
 * Puts one sentence into the coordinator thread's history as a developer message, through
 * `thread/inject_items`, which starts no turn: what an outside agent changed is something the
 * coordinator should know when it is next asked, not something to act on now.
 */
interface CoordinatorCallbackContextPort {
	readonly inject: (request: {
		readonly threadId: ThreadId;
		readonly text: string;
	}) => Promise<CoordinatorCallbackMutationResult>;
}

/** What news the coordinator is given is: work that ended, a wait on the user, or a message. */
type WorkhorseNewsSituation = "ended" | "waiting" | "message";

/**
 * What giving the coordinator a workhorse outcome came to: an ordinary mutation result, or
 * recording when a recording holds the voice and nothing was sent, since whatever the
 * coordinator answered would be spoken into the video (TASK-304).
 */
type CoordinatorCallbackTurnResult = CoordinatorCallbackMutationResult | "recording";

/**
 * Gives the coordinator one workhorse outcome while voice is live (TASK-291, TASK-321).
 *
 * In a full-duplex voice session text appended to the voice model is quiet context and nothing
 * answers it, so work that ended would sit unheard until the user asked again. The coordinator
 * is the one that knows whether the work came from a voice request, so it is given the outcome
 * at once, in the turn it is running or in a new one, and its reply decides what the user hears.
 * The server owns the message: its identity and its canonical context.
 */
interface CoordinatorCallbackTurnPort {
	readonly report: (request: {
		readonly threadId: ThreadId;
		/** What happened, as one plain sentence with no identities in it. */
		readonly news: string;
		/**
		 * What the news is: work that ended, the workhorse waiting on the user for an approval or an
		 * answer, or something the workhorse chose to tell the coordinator while it works.
		 */
		readonly situation: WorkhorseNewsSituation;
	}) => Promise<CoordinatorCallbackTurnResult>;
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
	/** Speech the voice model answers now, on the host's choice. */
	| "realtime_appendSpeech"
	/** A developer message in the coordinator's thread, which starts no turn. */
	| "coordinator_context"
	/** The coordinator's running turn or a new one, for a workhorse outcome while voice is live. */
	| "coordinator_turn";
type CallbackBufferOverflowReason = "buffer_overflow" | "coalesced";
type CoordinatorCallbackDeliveryReason =
	| CallbackBufferOverflowReason
	| "child_exit"
	| "disposed"
	| "invalid_callback"
	| "not_ready"
	| "own_change"
	| "prior_epoch"
	| "stale_child"
	| "stale_coordinator"
	| "stale_link"
	| "stale_session"
	| "voice_inactive"
	/** The host told this audience nothing of the change. */
	| "withheld"
	| "recorded_only"
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
	readonly operations: Pick<CodexWorkhorseOperations, "subscribe">;
	/** Reads Codex thread and turn identities in the notifications workhorse news comes from. */
	readonly identity: Pick<IdentityAuthority, "decoder" | "validator">;
	readonly realtime: CoordinatorCallbackRealtimePort;
	/** Absent where nothing can reach the coordinator; workhorse outcomes then stay quiet. */
	readonly coordinatorTurn?: CoordinatorCallbackTurnPort;
	/** Gives the coordinator thread one quiet sentence without starting a turn (TASK-293.06). */
	readonly coordinatorContext: CoordinatorCallbackContextPort;
	/** Answers the workhorse's tell_coordinator calls. */
	readonly transport: Pick<CodexTransport, "respond">;
	readonly threadLink: Pick<CodexThreadLinkClassifier, "classify">;
	readonly currentChild: () => CoordinatorCallbackCurrentChild | null;
	readonly currentCoordinator: () => CoordinatorCallbackReadyCoordinator | null;
	/**
	 * The link of every ready workhorse of the tab session, one for each checkout (ADR 0050). A
	 * callback is correlated with the workhorse its thread names, and an announced change with
	 * the one voice is bound to.
	 */
	readonly workhorseLinks: () => readonly CoordinatorCallbackLinkCorrelation[];
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
	/** Takes every Codex notification, and queues the workhorse news among them. */
	readonly onNotification: (event: TransportServerNotification) => void;
	/** Answers the workhorse's tell_coordinator call, queueing its message as workhorse news. */
	readonly onServerRequest: (request: DynamicServerRequest) => void;
	readonly flush: () => Promise<void>;
	readonly inspect: () => readonly CoordinatorCallbackDelivery[];
	readonly inspectHistory: (
		generation: CoordinatorCallbackRealtimeGeneration,
	) => CoordinatorCallbackHistory;
	readonly get: (event: CoordinatorCallbackSource) => CoordinatorCallbackDelivery | undefined;
	readonly pendingCount: () => number;
	readonly dispose: () => void;
}

interface CoordinatorCallbackClassification {
	readonly captured: CoordinatorCallbackLinkCorrelation;
	readonly live: ThreadLinkClassification;
}

export {
	type ContextAnnouncementSource,
	type CoordinatorCallbackSource,
	type WorkhorseNewsSource,
	type WorkhorseNewsSituation,
	type CoordinatorWorkhorseNewsCallback,
	type CoordinatorCallbackLinkCorrelation,
	type CoordinatorCallbackCorrelation,
	type CoordinatorOperationCallback,
	type AnnouncedContext,
	type CoordinatorCallbackContextPort,
	type CoordinatorContextCallback,
	type CoordinatorCallback,
	type CoordinatorCallbackRealtimeGeneration,
	type CoordinatorCallbackRealtimeRequest,
	type CoordinatorCallbackDeliveryOutcome,
	type CoordinatorCallbackMutationResult,
	type CoordinatorCallbackRealtimePort,
	type CoordinatorCallbackTurnPort,
	type CoordinatorCallbackTurnResult,
	type CoordinatorCallbackCurrentChild,
	type CoordinatorCallbackReadyCoordinator,
	type CoordinatorCallbackDeliveryPath,
	type CallbackBufferOverflowReason,
	type CoordinatorCallbackDeliveryReason,
	type CoordinatorCallbackDelivery,
	type CoordinatorCallbackOptions,
	type CoordinatorCallbackHistory,
	type CoordinatorCallbacks,
	type CoordinatorCallbackClassification,
};
