import type {
	CodexEpochStore,
	EpochExecutionProof,
	EpochTransaction,
} from "../../codex-epoch/index.js";
import type { ArchboardContext } from "../../codex-instructions/index.js";
import type { CodexSession, SessionThread } from "../../codex-session/index.js";
import type {
	CodexThreadLinkPort,
	ThreadLinkClassification,
	ThreadLinkSource,
	ThreadLinkTarget,
} from "../../codex-thread-link/index.js";
import type {
	CodexWaitGraph,
	OwnedWaitCleanupCause,
	WaitOwner,
} from "../../codex-wait-graph/index.js";
import type { CodexTransport } from "../../codex-transport/index.js";
import type {
	DynamicServerRequest,
	ReverseResponse,
} from "../../codex-transport/server-requests.js";
import type {
	ChildEpoch,
	ChildId,
	DynamicToolCallId,
	LogicalToolCallCorrelation,
	OperationId,
	ThreadId,
	TurnId,
} from "../../../shared/codex-workbench-identity/index.js";
import type {
	ArchboardAppNamespaceSpec,
	GeneralThreadToolName,
	ToolArgument,
	ToolArguments,
	DynamicToolCallResponse,
} from "../../codex-thread-tools/index.js";

/** The only opaque authority value that may enter a dynamic effect. */
declare const dynamicAuthorityBrand: unique symbol;
export type DynamicAuthorityToken = string & {
	readonly [dynamicAuthorityBrand]: "dynamic-authority";
};

export type DynamicToolName = GeneralThreadToolName;
export type DynamicMutationToolName = "create_thread" | "fork_thread" | "send_message_to_thread";
export type DynamicReadToolName = "list_threads" | "read_thread";
export type DynamicStatus = SessionThread["status"]["type"];
export type DynamicOwnership = "created" | "attached" | "foreign";
export type DynamicEpochState = "current" | "prior" | "unknown";
export type DynamicRelation = "self" | "other";

export type DynamicRefusalReason =
	| "invalid_call"
	| "not_ready"
	| "not_loaded"
	| "not_controllable"
	| "system_error"
	| "stale_child"
	| "prior_epoch"
	| "unknown_provenance"
	| "approval_declined"
	| "cycle"
	| "busy"
	| "expired"
	| "unsupported";

export type DynamicApprovalOutcome =
	| "approved"
	| "declined"
	| "expired"
	| "cancelled"
	| "disconnected";

export type DynamicApprovalCause =
	| "person_approved"
	| "person_declined"
	| "deadline_reached"
	| "call_cancelled"
	| "caller_turn_interrupted"
	| "host_shutdown"
	| "browser_disconnected"
	| "child_disconnected";

export type DynamicLifecyclePhase = "before_approval" | "after_approval" | "before_effect";

export type DynamicSessionDependency = Pick<
	CodexSession,
	| "threadStart"
	| "threadFork"
	| "threadListPage"
	| "threadLoadedListPage"
	| "threadTurnsListPage"
	| "threadItemsListPage"
	| "turnStart"
>;
export type DynamicEpochDependency = Pick<
	CodexEpochStore,
	"stageOperation" | "snapshot" | "commitOperation" | "rollbackOperation" | "markOutcomeUnknown"
>;
export type DynamicThreadLinkDependency = Pick<CodexThreadLinkPort, "classify">;
export type DynamicTransportDependency = Pick<CodexTransport, "respond">;

export interface DynamicToolApprovalRequest {
	readonly identity: DynamicApprovalIdentity;
	readonly effect: DynamicImmutableEffect;
	readonly effectHash: string;
	readonly createdAtMs: number;
	readonly expiresAtMs: number;
}

export interface DynamicApprovalIdentity extends LogicalToolCallCorrelation {
	readonly operationId: string;
}

export interface DynamicToolApprovalDecision {
	readonly outcome: DynamicApprovalOutcome;
	readonly identity: DynamicApprovalIdentity;
	readonly effectHash: string;
	readonly decidedAtMs: number;
	readonly cause: DynamicApprovalCause;
}

/**
 * Visual approvals are deliberately not the seven-family app-server broker.
 * A port implementation owns the pending card and its terminal compare-and-set.
 */
export interface DynamicToolApprovalPort {
	readonly presentImmutableRequest: (request: DynamicToolApprovalRequest) => Promise<void> | void;
	readonly awaitOneExactVisualDecision: (
		request: DynamicToolApprovalRequest,
	) => Promise<DynamicToolApprovalDecision>;
	readonly settleIdentityAndEffectHashOnce: (input: {
		readonly request: DynamicToolApprovalRequest;
		readonly decision: DynamicToolApprovalDecision;
	}) => Promise<void> | void;
}

export interface DynamicThreadAuthorityRecord {
	readonly authority: DynamicAuthorityToken;
	readonly threadId: ThreadId;
	/** The raw Codex id that is safe to put in a dynamic-tool result. */
	readonly wireThreadId: string;
	readonly childId: ChildId | null;
	readonly epoch: ChildEpoch | null;
	readonly epochState: DynamicEpochState;
	readonly ownership: DynamicOwnership;
	readonly loaded: boolean;
	readonly directInput: boolean | null;
	readonly status: DynamicStatus;
	readonly source: ThreadLinkSource;
	readonly provenance: EpochExecutionProof | null;
	readonly threadLinkTarget: ThreadLinkTarget;
	/** A classifier may carry the exact result it obtained to avoid a second list sweep. */
	readonly linkClassification?: ThreadLinkClassification;
}

export interface DynamicCallerAuthority extends DynamicThreadAuthorityRecord {
	readonly role: "caller";
	readonly childId: ChildId;
	readonly epoch: ChildEpoch;
	readonly turnId: TurnId;
	readonly wireTurnId: string;
	readonly executing: true;
}

export interface DynamicTargetAuthority extends DynamicThreadAuthorityRecord {
	readonly role: "target";
}

export interface DynamicObservedTarget {
	readonly thread: SessionThread | null;
	readonly persistedRows: number;
	readonly loadedOccurrences: number;
}

export interface DynamicThreadAuthorityPort {
	readonly resolveExactLogicalCaller: (input: {
		readonly request: DynamicServerRequest;
	}) => Promise<DynamicCallerAuthority>;
	readonly classifyExactTarget: (input: {
		readonly caller: DynamicCallerAuthority;
		readonly threadId: unknown;
		readonly observed?: DynamicObservedTarget;
	}) => Promise<DynamicTargetAuthority>;
	readonly resolveExactTurnBoundary: (input: {
		readonly caller: DynamicCallerAuthority;
		readonly target: DynamicTargetAuthority;
		readonly requestedBeforeTurnId: unknown;
		readonly relation: DynamicRelation;
	}) => Promise<TurnId | null>;
	readonly revalidateCaller: (caller: DynamicCallerAuthority) => Promise<DynamicCallerAuthority>;
	readonly revalidateTarget: (target: DynamicTargetAuthority) => Promise<DynamicTargetAuthority>;
}

export interface DynamicContextAuthority {
	readonly token: DynamicAuthorityToken;
	readonly paneId: string;
	readonly childId: ChildId;
	readonly epoch: ChildEpoch;
	readonly threadId: ThreadId;
	readonly turnId: TurnId;
}

export interface DynamicContextPort {
	readonly issueAndRevalidatePaneLinkAuthority: (input: {
		readonly caller: DynamicCallerAuthority;
		readonly existing?: DynamicContextAuthority;
	}) => Promise<DynamicContextAuthority> | DynamicContextAuthority;
	readonly readOneFreshArchboardContext: (input: {
		readonly caller: DynamicCallerAuthority;
		readonly authority: DynamicContextAuthority;
		readonly operationId: OperationId;
		readonly kind:
			| "create_thread_initial_turn"
			| "fork_thread_initial_turn"
			| "send_message_to_thread";
		readonly rpc: "turn/start";
		readonly targetThreadId?: ThreadId;
	}) => Promise<ArchboardContext>;
}

export type DynamicOperationTerminalDisposition = "consumed" | "retired";

export interface DynamicOperationTerminalResult {
	readonly operationId: OperationId;
	readonly disposition: DynamicOperationTerminalDisposition;
	readonly terminal: true;
}

export interface DynamicOperationIdPort {
	readonly issueCanonicalOperationId: () => OperationId;
	readonly validateCurrentUnconsumedOperationId: (operationId: OperationId) => void;
	readonly serializeForOwnedWireFields: (operationId: OperationId) => string;
	/**
	 * Atomically terminalizes one issued identity. The operation is idempotent
	 * for the same disposition and returns the existing exact result after a
	 * prior transition. A different terminal disposition must be rejected.
	 */
	readonly terminalizeCanonicalOperationId: (input: {
		readonly operationId: OperationId;
		readonly disposition: DynamicOperationTerminalDisposition;
	}) => DynamicOperationTerminalResult;
	/** Returns null only while the exact issued identity is current and unconsumed. */
	readonly readCanonicalOperationTerminalResult: (
		operationId: OperationId,
	) => DynamicOperationTerminalResult | null;
}

export interface DynamicWaitOwner extends WaitOwner {
	readonly epoch: ChildEpoch;
	readonly namespace: "archboard_app";
	readonly tool: "wait_threads";
	readonly manifestHash: string;
	readonly sortedTargetThreadIds: readonly ThreadId[];
	readonly operationId: null;
}

export interface DynamicMutationQuarantineIdentity {
	readonly child: ChildId;
	readonly epoch: ChildEpoch;
	readonly threadId: ThreadId;
	readonly turnId: TurnId;
	readonly callId: DynamicToolCallId;
	readonly namespace: "archboard_app";
	readonly tool: DynamicMutationToolName;
	readonly manifestHash: string;
}

export interface DynamicMutationTerminalProof {
	readonly terminal: true;
	readonly unresolvedOperationCount: 0;
}

export interface DynamicMutationQuarantineExit {
	readonly child: ChildId;
	readonly epoch: ChildEpoch;
	readonly exited: true;
}

export interface DynamicMutationQuarantineOwner {
	readonly child: ChildId;
	readonly epoch: ChildEpoch;
	readonly poisoned: true;
	readonly childExit: Promise<DynamicMutationQuarantineExit>;
}

export type DynamicFailClosedShutdownReason =
	| "poison_acquisition_failed"
	| "wire_capacity_exceeded"
	| "response_write_failed";

export interface DynamicEpochTeardownProof {
	readonly child: ChildId;
	readonly epoch: ChildEpoch;
	readonly sessionClosed: true;
	readonly transportClosed: true;
}

export interface DynamicFailClosedShutdownOwner {
	readonly child: ChildId;
	readonly epoch: ChildEpoch;
	readonly shutdownInitiated: true;
	readonly teardown: Promise<DynamicEpochTeardownProof>;
}

export interface DynamicFatalLifecycleFault {
	readonly child: ChildId;
	readonly epoch: ChildEpoch;
	readonly reason: DynamicFailClosedShutdownReason | "invalid_child_exit_proof";
	readonly message: string;
	readonly cause: unknown;
}

export type DynamicMutationQuarantineState =
	| "poisoning"
	| "poisoned"
	| "terminalizing"
	| "shutdown_pending"
	| "fatal";

export interface DynamicMutationQuarantineInspection {
	readonly epochCount: number;
	readonly callCount: number;
	readonly wireCount: number;
	readonly blockedWireCount: number;
	readonly fatalEpochCount: number;
	readonly entries: readonly Readonly<{
		readonly identity: DynamicMutationQuarantineIdentity;
		readonly state: DynamicMutationQuarantineState;
		readonly unresolvedOperationCount: number;
		readonly wireCount: number;
		readonly blockedWireCount: number;
		readonly overflowed: boolean;
	}>[];
}

export type DynamicWaitEvent =
	| {
			readonly event: "completed" | "attention";
			readonly threadId: string;
			readonly sequence: number;
			readonly cursor: string | null;
			/** Required for attention unless the target is already systemError. */
			readonly targetOwned?: true;
	  }
	| {
			readonly event: "timeout";
			readonly threadId: null;
			readonly sequence: number;
			readonly cursor: string | null;
	  };

export type DynamicWaitReleaseCause = Exclude<OwnedWaitCleanupCause, "decline">;

export interface DynamicToolLifecyclePort {
	readonly assertCallExecuting: (input: {
		readonly request: DynamicServerRequest;
		readonly caller: DynamicCallerAuthority;
		readonly phase: DynamicLifecyclePhase;
	}) => Promise<void> | void;
	readonly registerWaitOwner: (input: { readonly owner: DynamicWaitOwner }) => Promise<void> | void;
	readonly releaseWaitOwner: (input: {
		readonly owner: DynamicWaitOwner;
		readonly cause: DynamicWaitReleaseCause;
	}) => Promise<void> | void;
	readonly releaseWaitOwnersForChild: (input: { readonly child: ChildId }) => Promise<void> | void;
	/**
	 * Synchronously poisons the exact child epoch before returning its owner.
	 * The owner may call retryTerminalization only on a host or lifecycle trigger;
	 * childExit resolves only after shutdown of that exact child epoch is confirmed.
	 */
	readonly poisonEpochAndOwnMutationQuarantine: (input: {
		readonly identity: DynamicMutationQuarantineIdentity;
		readonly retryTerminalization: () => Promise<DynamicMutationTerminalProof>;
	}) => DynamicMutationQuarantineOwner;
	/** Starts exact fail-closed shutdown synchronously and owns its teardown proof. */
	readonly failClosedShutdownEpoch: (input: {
		readonly child: ChildId;
		readonly epoch: ChildEpoch;
		readonly reason: DynamicFailClosedShutdownReason;
	}) => DynamicFailClosedShutdownOwner;
	/** Reports a retained fatal owner when neither poison nor teardown authority is proven. */
	readonly reportFatalLifecycleFault: (fault: DynamicFatalLifecycleFault) => void;
	readonly waitForTargets: (input: {
		readonly owner: DynamicWaitOwner;
		readonly cursor: string | null;
		readonly timeoutMs: number;
		readonly previousSequence: number;
	}) => Promise<DynamicWaitEvent>;
}

export type DynamicForkEffectArguments = Readonly<{
	readonly threadId: string;
	readonly beforeTurnId: string | null;
	readonly prompt: string | null;
}>;

export type DynamicImmutableEffect =
	| Readonly<{
			readonly tool: "create_thread";
			readonly arguments: ToolArgument<"create_thread">;
			readonly callerAuthority: DynamicAuthorityToken;
			readonly targetAuthority: null;
			readonly contextAuthority: DynamicAuthorityToken;
			readonly effectiveBoundary: null;
			readonly mutationOperationId: string;
			readonly initialTurnOperationId: string;
			readonly visualSummary: string;
	  }>
	| Readonly<{
			readonly tool: "fork_thread";
			readonly arguments: DynamicForkEffectArguments;
			readonly callerAuthority: DynamicAuthorityToken;
			readonly targetAuthority: DynamicAuthorityToken;
			readonly contextAuthority: DynamicAuthorityToken;
			readonly effectiveBoundary: Readonly<{
				readonly relation: DynamicRelation;
				readonly beforeTurnId: string | null;
			}>;
			readonly mutationOperationId: string;
			readonly initialTurnOperationId: string | null;
			readonly visualSummary: string;
	  }>
	| Readonly<{
			readonly tool: "send_message_to_thread";
			readonly arguments: ToolArgument<"send_message_to_thread">;
			readonly callerAuthority: DynamicAuthorityToken;
			readonly targetAuthority: DynamicAuthorityToken;
			readonly contextAuthority: DynamicAuthorityToken;
			readonly effectiveBoundary: null;
			readonly mutationOperationId: string;
			readonly initialTurnOperationId: null;
			readonly visualSummary: string;
	  }>;

/* The effect fields are deliberately repeated in each union member: tool and
 * arguments must narrow together at every remote boundary. */
export type DynamicEffectFields = {
	readonly callerAuthority: DynamicAuthorityToken;
	readonly targetAuthority: DynamicAuthorityToken | null;
	readonly contextAuthority: DynamicAuthorityToken;
	readonly effectiveBoundary: Readonly<{
		readonly relation: DynamicRelation;
		readonly beforeTurnId: string | null;
	}> | null;
	readonly mutationOperationId: string;
	readonly initialTurnOperationId: string | null;
	readonly visualSummary: string;
};

export type DynamicEpochTransaction = EpochTransaction;
export type DynamicWaitGraphDependency = CodexWaitGraph;
export type DynamicCatalogueDependency = ArchboardAppNamespaceSpec;

export interface CodexDynamicToolsOptions {
	readonly session: DynamicSessionDependency;
	readonly transport: DynamicTransportDependency;
	readonly threadLink: DynamicThreadLinkDependency;
	readonly epoch: DynamicEpochDependency;
	readonly waitGraph: DynamicWaitGraphDependency;
	readonly approval: DynamicToolApprovalPort;
	readonly threadAuthority: DynamicThreadAuthorityPort;
	readonly context: DynamicContextPort;
	readonly operationId: DynamicOperationIdPort;
	readonly lifecycle: DynamicToolLifecyclePort;
	readonly catalogue?: DynamicCatalogueDependency;
	readonly checkoutRoot: string;
	readonly now?: () => number;
}

export interface CodexDynamicTools {
	readonly dispatch: (request: DynamicServerRequest) => Promise<DynamicToolCallResponse>;
	readonly inspectMutationQuarantine: () => DynamicMutationQuarantineInspection;
	readonly dispose: () => void;
}

export type DynamicToolArguments = ToolArguments[DynamicToolName];
export type DynamicReverseResponse = ReverseResponse;
export type DynamicToolCallIdValue = DynamicToolCallId;

export type DynamicDispatchErrorCode = DynamicRefusalReason | "not_delivered" | "outcome_unknown";

export class CodexDynamicToolsError extends Error {
	override readonly name = "CodexDynamicToolsError";
	readonly code: DynamicDispatchErrorCode;
	override readonly cause: unknown;

	constructor(code: DynamicDispatchErrorCode, message: string, cause?: unknown) {
		super(message);
		this.code = code;
		this.cause = cause;
	}
}

export class CodexDynamicOperationTerminalizationError extends CodexDynamicToolsError {
	readonly retryEligible = false;
	readonly operationId: OperationId;
	readonly disposition: DynamicOperationTerminalDisposition;

	constructor(
		operationId: OperationId,
		disposition: DynamicOperationTerminalDisposition,
		message: string,
		cause?: unknown,
	) {
		super("system_error", message, cause);
		this.operationId = operationId;
		this.disposition = disposition;
	}
}

export class CodexDynamicEpochQuarantinedError extends CodexDynamicToolsError {
	readonly retryEligible = false;

	constructor(message: string, cause?: unknown) {
		super("system_error", message, cause);
	}
}
