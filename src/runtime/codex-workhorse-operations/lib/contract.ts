import type {
	CodexEpochStore,
	EpochExecutionProof,
	EpochTransaction,
} from "../../codex-epoch/index.js";
import type { ArchboardContext } from "../../codex-instructions/index.js";
import type { CodexSession, SessionParams, SessionTurn } from "../../codex-session/index.js";
import type { TransportServerNotification } from "../../codex-transport/server-requests.js";
import type {
	CodexThreadLinkPort,
	ThreadLinkClassification,
	ThreadLinkTarget,
} from "../../codex-thread-link/index.js";
import type {
	CodexWorkhorseQueue,
	WorkhorseQueueOperation as QueueOperation,
	WorkhorseQueueMutation,
} from "../../codex-workhorse-queue/index.js";
import type {
	ChildEpoch,
	ChildId,
	IdentityAuthority,
	LogicalToolCallCorrelation,
	OperationAuthority,
	OperationId,
	QueuedSubmissionId,
	ThreadId,
	TurnId,
} from "../../../shared/codex-workbench-identity/index.js";

/** The only four operations the coordinator may dispatch to its workhorse. */
export const WORKHORSE_OPERATION_NAMES = Object.freeze([
	"inspect_workhorse",
	"delegate_to_workhorse",
	"manage_workhorse_queue",
	"steer_workhorse",
] as const);
export type WorkhorseOperationName = (typeof WORKHORSE_OPERATION_NAMES)[number];

export type WorkhorseTurnOperation = "delegate_to_workhorse" | "steer_workhorse";
export type WorkhorseOperationRpc =
	| "turn/start"
	| "turn/steer"
	| `thread/queue/${WorkhorseQueueMutation}`;
export type WorkhorseOperationDelivery =
	| "pending"
	| "delivered"
	| "not_delivered"
	| "outcome_unknown";

/** A target supplied by the composition root; callers cannot choose one. */
export type WorkhorseOperationTarget = ThreadLinkTarget & {
	readonly childId: ChildId;
	readonly epoch: ChildEpoch;
	readonly operationId: string;
};

/** The two exact links that every operation revalidates before and after effect. */
export interface WorkhorseOperationBinding {
	readonly childId: ChildId;
	readonly epoch: ChildEpoch;
	readonly coordinator: WorkhorseOperationTarget;
	readonly workhorse: WorkhorseOperationTarget;
}

export type CurrentWorkhorseOperationBinding = () => WorkhorseOperationBinding | null;

export type WorkhorseOperationThreadLinkPort = Pick<CodexThreadLinkPort, "classify">;
export type WorkhorseOperationSessionPort = Pick<CodexSession, "turnStart" | "turnSteer">;
export type WorkhorseOperationEpochPort = Pick<
	CodexEpochStore,
	| "snapshot"
	| "stageOperation"
	| "commitOperation"
	| "rollbackOperation"
	| "markOutcomeUnknown"
	| "confirmOutcome"
>;

/** The coordinator call remains an exact, host-validated logical correlation. */
export type WorkhorseCoordinatorCall = LogicalToolCallCorrelation;
export type CurrentWorkhorseCoordinatorCall = () => WorkhorseCoordinatorCall | null;

export interface WorkhorseOperationContextInput {
	readonly operationId: OperationId;
	readonly kind: WorkhorseTurnOperation;
	readonly rpc: "turn/start" | "turn/steer";
}

export interface WorkhorseOperationOptions {
	readonly session: WorkhorseOperationSessionPort;
	readonly threadLink: WorkhorseOperationThreadLinkPort;
	readonly queue: CodexWorkhorseQueue<OperationId>;
	readonly epoch: WorkhorseOperationEpochPort;
	readonly identity: IdentityAuthority;
	readonly operation: Pick<OperationAuthority, "issuer" | "validator" | "decoder">;
	readonly currentBinding: CurrentWorkhorseOperationBinding;
	readonly currentCoordinatorCall: CurrentWorkhorseCoordinatorCall;
	/** Returns the fresh canonical context used by turn/start and turn/steer. */
	readonly contextFor: (input: WorkhorseOperationContextInput) => ArchboardContext;
}

export interface InspectWorkhorseRequest {
	readonly call: WorkhorseCoordinatorCall;
}

export interface DelegateToWorkhorseRequest {
	readonly call: WorkhorseCoordinatorCall;
	/** Reuse this host-issued identity when the dispatcher already owns the effect. */
	readonly operationId?: OperationId;
	readonly input: string;
	readonly transcriptDelta: string;
}

type ManageWorkhorseQueueMutationRequest =
	| {
			readonly operation: "add";
			readonly prompt: string;
	  }
	| {
			readonly operation: "update";
			readonly submissionId: QueuedSubmissionId;
			readonly prompt: string;
	  }
	| {
			readonly operation: "delete";
			readonly submissionId: QueuedSubmissionId;
	  }
	| {
			readonly operation: "reorder";
			readonly orderedSubmissionIds: readonly QueuedSubmissionId[];
	  }
	| {
			readonly operation: "start";
			readonly submissionId: QueuedSubmissionId;
	  };

export type ManageWorkhorseQueueRequest =
	| {
			readonly call: WorkhorseCoordinatorCall;
			readonly operation: "list";
	  }
	| (ManageWorkhorseQueueMutationRequest & {
			readonly call: WorkhorseCoordinatorCall;
			/** Reuse this host-issued identity when the dispatcher already owns the effect. */
			readonly operationId?: OperationId;
	  });

export interface SteerWorkhorseRequest {
	readonly call: WorkhorseCoordinatorCall;
	/** Reuse this host-issued identity when the dispatcher already owns the effect. */
	readonly operationId?: OperationId;
	/** Captured by the host from the exact active workhorse classification. */
	readonly expectedTurnId: TurnId;
	readonly input: string;
}

export interface InspectWorkhorseResult {
	readonly threadId: ThreadId;
	readonly status: "notLoaded" | "idle" | "systemError" | "active";
	readonly activeTurnId: TurnId | null;
	readonly queuedSubmissionIds: readonly QueuedSubmissionId[];
}

export interface DelegateToWorkhorseResult {
	readonly mode: "started" | "queued";
	readonly clientUserMessageId: string;
	readonly queuedSubmissionId: QueuedSubmissionId | null;
	readonly turnId: TurnId | null;
}

export interface ManageWorkhorseQueueResult {
	readonly operation: QueueOperation;
	readonly queuedSubmissionIds: readonly QueuedSubmissionId[];
}

export interface SteerWorkhorseResult {
	readonly turnId: TurnId;
	readonly delivery: Exclude<WorkhorseOperationDelivery, "pending">;
}

export interface WorkhorseOperationCorrelation {
	readonly operationId: OperationId;
	readonly childId: ChildId;
	readonly epoch: ChildEpoch;
	readonly coordinatorThreadId: ThreadId;
	readonly coordinatorTurnId: TurnId;
	readonly workhorseThreadId: ThreadId;
	readonly coordinatorCall: WorkhorseCoordinatorCall;
	readonly clientUserMessageId: string | null;
	readonly queuedSubmissionId: QueuedSubmissionId | null;
	readonly turnId: TurnId | null;
}

interface WorkhorseOperationEventBase {
	readonly operation: Exclude<WorkhorseOperationName, "inspect_workhorse">;
	readonly queueOperation: WorkhorseQueueMutation | null;
	readonly rpc: WorkhorseOperationRpc;
	readonly correlation: WorkhorseOperationCorrelation;
	readonly queuedSubmissionIds: readonly QueuedSubmissionId[];
	readonly detail: string | null;
}

export type WorkhorseOperationEvent =
	| (WorkhorseOperationEventBase & { readonly type: "accepted"; readonly outcome: "pending" })
	| (WorkhorseOperationEventBase & { readonly type: "queued"; readonly outcome: "delivered" })
	| (WorkhorseOperationEventBase & { readonly type: "started"; readonly outcome: "delivered" })
	| (WorkhorseOperationEventBase & { readonly type: "progress"; readonly outcome: "delivered" })
	| (WorkhorseOperationEventBase & { readonly type: "attention"; readonly outcome: "delivered" })
	| (WorkhorseOperationEventBase & { readonly type: "completed"; readonly outcome: "delivered" })
	| (WorkhorseOperationEventBase & {
			readonly type: "failed";
			readonly outcome: "delivered" | "not_delivered";
	  })
	| (WorkhorseOperationEventBase & {
			readonly type: "outcome_unknown";
			readonly outcome: "outcome_unknown";
	  });

export type WorkhorseOperationEventListener = (event: WorkhorseOperationEvent) => void;

export type WorkhorseOperationErrorCode =
	| "invalid_call"
	| "invalid_input"
	| "not_ready"
	| "stale_child"
	| "prior_epoch"
	| "unknown_provenance"
	| "not_loaded"
	| "not_controllable"
	| "system_error"
	| "busy"
	| "stale_link"
	| "transport_failure"
	| "transaction_failed"
	| "outcome_unknown";

export class CodexWorkhorseOperationsError extends Error {
	override readonly name = "CodexWorkhorseOperationsError";
	readonly code: WorkhorseOperationErrorCode;
	readonly operation: WorkhorseOperationName | null;
	readonly outcome: Exclude<WorkhorseOperationDelivery, "pending"> | null;
	readonly operationId: OperationId | null;
	override readonly cause: unknown;

	constructor(
		code: WorkhorseOperationErrorCode,
		message: string,
		options: {
			readonly operation?: WorkhorseOperationName;
			readonly outcome?: Exclude<WorkhorseOperationDelivery, "pending">;
			readonly operationId?: OperationId;
			readonly cause?: unknown;
		} = {},
	) {
		super(message);
		this.code = code;
		this.operation = options.operation ?? null;
		this.outcome = options.outcome ?? null;
		this.operationId = options.operationId ?? null;
		this.cause = options.cause;
	}
}

export interface CodexWorkhorseOperations {
	readonly inspect: (request: InspectWorkhorseRequest) => Promise<InspectWorkhorseResult>;
	readonly delegate: (request: DelegateToWorkhorseRequest) => Promise<DelegateToWorkhorseResult>;
	readonly manageQueue: (
		request: ManageWorkhorseQueueRequest,
	) => Promise<ManageWorkhorseQueueResult>;
	readonly steer: (request: SteerWorkhorseRequest) => Promise<SteerWorkhorseResult>;
	/** Raw notifications are an input boundary only; no raw event leaves this port. */
	readonly onNotification: (event: TransportServerNotification) => void;
	readonly subscribe: (listener: WorkhorseOperationEventListener) => () => void;
}

export type WorkhorseOperationClassification = ThreadLinkClassification;
export type WorkhorseOperationEpochProof = EpochExecutionProof;
export type WorkhorseOperationTransaction = EpochTransaction;
export type WorkhorseOperationTurn = SessionTurn;
export type WorkhorseOperationTurnStartParams = SessionParams<"turn/start">;
export type WorkhorseOperationTurnSteerParams = SessionParams<"turn/steer">;
