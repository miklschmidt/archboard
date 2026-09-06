import type { CodexEpochStore, EpochExecutionProof, EpochTransaction } from "@/runtime/codex-epoch";
import type { ArchboardContext } from "@/runtime/codex-instructions";
import type { CodexSession, SessionThread } from "@/runtime/codex-session";
import type {
	CodexThreadLinkPort,
	ThreadLinkClassification,
	ThreadLinkSource,
	ThreadLinkTarget,
} from "@/runtime/codex-thread-link";
import type { CodexWaitGraph, OwnedWaitCleanupCause, WaitOwner } from "@/runtime/codex-wait-graph";
import type { CodexTransport } from "@/runtime/codex-transport";
import type {
	DynamicServerRequest,
	ReverseResponse,
} from "@/runtime/codex-transport/server-requests";
import type {
	ChildEpoch,
	ChildId,
	DynamicToolCallId,
	LogicalToolCallCorrelation,
	OperationId,
	ThreadId,
	TurnId,
} from "@/shared/codex-workbench-identity";
import { randomUUID } from "node:crypto";
import type {
	ArchboardAppNamespaceSpec,
	GeneralThreadToolName,
	ToolArgument,
	ToolArguments,
	DynamicToolCallResponse,
} from "@/runtime/codex-thread-tools";

/** The only opaque authority value that may enter a dynamic effect. */
declare const dynamicAuthorityBrand: unique symbol;
type DynamicAuthorityToken = string & {
	readonly [dynamicAuthorityBrand]: "dynamic-authority";
};

interface DynamicAuthorityTokenIssuer {
	readonly issue: () => DynamicAuthorityToken;
	readonly owns: (token: DynamicAuthorityToken) => boolean;
	readonly retire: (token: DynamicAuthorityToken) => void;
	readonly retireAll: () => void;
}

/** Process-local opaque authority; only the owning production adapter can validate it. */
function createDynamicAuthorityTokenIssuer(): DynamicAuthorityTokenIssuer {
	const live = new Set<string>();
	return Object.freeze({
		issue: () => {
			const token = `dynamic-authority:${randomUUID()}`;
			live.add(token);
			return token as DynamicAuthorityToken;
		},
		owns: (token: DynamicAuthorityToken) => live.has(token),
		retire: (token: DynamicAuthorityToken) => void live.delete(token),
		retireAll: () => live.clear(),
	});
}

type DynamicToolName = GeneralThreadToolName;
type DynamicMutationToolName = "create_thread" | "fork_thread" | "send_message_to_thread";
type DynamicReadToolName = "list_threads" | "read_thread";
type DynamicStatus = SessionThread["status"]["type"];
type DynamicOwnership = "created" | "attached" | "foreign";
type DynamicEpochState = "current" | "prior" | "unknown";
type DynamicRelation = "self" | "other";

type DynamicRefusalReason =
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

type DynamicApprovalOutcome = "approved" | "declined" | "expired" | "cancelled" | "disconnected";

type DynamicApprovalCause =
	| "person_approved"
	| "person_declined"
	| "deadline_reached"
	| "call_cancelled"
	| "caller_turn_interrupted"
	| "host_shutdown"
	| "browser_disconnected"
	| "child_disconnected";

type DynamicLifecyclePhase = "before_approval" | "after_approval" | "before_effect";

type DynamicSessionDependency = Pick<
	CodexSession,
	| "threadStart"
	| "threadFork"
	| "threadListPage"
	| "threadLoadedListPage"
	| "threadTurnsListPage"
	| "threadItemsListPage"
	| "turnStart"
>;
type DynamicEpochDependency = Pick<
	CodexEpochStore,
	"stageOperation" | "snapshot" | "commitOperation" | "rollbackOperation" | "markOutcomeUnknown"
>;
type DynamicThreadLinkDependency = Pick<CodexThreadLinkPort, "classify">;
type DynamicTransportDependency = Pick<CodexTransport, "ownsPendingReverseRequest" | "respond">;

interface DynamicToolApprovalRequest {
	readonly identity: DynamicApprovalIdentity;
	readonly effect: DynamicImmutableEffect;
	readonly effectHash: string;
	readonly createdAtMs: number;
	readonly expiresAtMs: number;
}

interface DynamicApprovalIdentity extends LogicalToolCallCorrelation {
	readonly operationId: string;
}

interface DynamicToolApprovalDecision {
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
interface DynamicToolApprovalPort {
	readonly presentImmutableRequest: (request: DynamicToolApprovalRequest) => Promise<void> | void;
	readonly awaitOneExactVisualDecision: (
		request: DynamicToolApprovalRequest,
	) => Promise<DynamicToolApprovalDecision>;
	readonly settleIdentityAndEffectHashOnce: (input: {
		readonly request: DynamicToolApprovalRequest;
		readonly decision: DynamicToolApprovalDecision;
	}) => Promise<void> | void;
}

interface DynamicThreadAuthorityRecord {
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

interface DynamicCallerAuthority extends DynamicThreadAuthorityRecord {
	readonly role: "caller";
	readonly childId: ChildId;
	readonly epoch: ChildEpoch;
	readonly turnId: TurnId;
	readonly wireTurnId: string;
	readonly executing: true;
}

interface DynamicTargetAuthority extends DynamicThreadAuthorityRecord {
	readonly role: "target";
}

interface DynamicObservedTarget {
	readonly thread: SessionThread | null;
	readonly persistedRows: number;
	readonly loadedOccurrences: number;
}

interface DynamicThreadAuthorityPort {
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

interface DynamicContextAuthority {
	readonly token: DynamicAuthorityToken;
	readonly paneId: string;
	readonly childId: ChildId;
	readonly epoch: ChildEpoch;
	readonly threadId: ThreadId;
	readonly turnId: TurnId;
}

interface DynamicContextPort {
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

type DynamicOperationTerminalDisposition = "consumed" | "retired";

interface DynamicOperationTerminalResult {
	readonly operationId: OperationId;
	readonly disposition: DynamicOperationTerminalDisposition;
	readonly terminal: true;
}

interface DynamicOperationIdPort {
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

interface DynamicWaitOwner extends WaitOwner {
	readonly epoch: ChildEpoch;
	readonly namespace: "archboard_app";
	readonly tool: "wait_threads";
	readonly manifestHash: string;
	readonly sortedTargetThreadIds: readonly ThreadId[];
	readonly operationId: null;
}

interface DynamicMutationQuarantineIdentity {
	readonly child: ChildId;
	readonly epoch: ChildEpoch;
	readonly threadId: ThreadId;
	readonly turnId: TurnId;
	readonly callId: DynamicToolCallId;
	readonly namespace: "archboard_app";
	readonly tool: DynamicMutationToolName;
	readonly manifestHash: string;
}

interface DynamicMutationTerminalProof {
	readonly terminal: true;
	readonly unresolvedOperationCount: 0;
}

interface DynamicMutationQuarantineExit {
	readonly child: ChildId;
	readonly epoch: ChildEpoch;
	readonly exited: true;
}

interface DynamicMutationQuarantineOwner {
	readonly child: ChildId;
	readonly epoch: ChildEpoch;
	readonly poisoned: true;
	readonly childExit: Promise<DynamicMutationQuarantineExit>;
}

type DynamicFailClosedShutdownReason =
	| "poison_acquisition_failed"
	| "wire_capacity_exceeded"
	| "response_write_failed";

interface DynamicEpochTeardownProof {
	readonly child: ChildId;
	readonly epoch: ChildEpoch;
	readonly sessionClosed: true;
	readonly transportClosed: true;
}

interface DynamicFailClosedShutdownOwner {
	readonly child: ChildId;
	readonly epoch: ChildEpoch;
	readonly shutdownInitiated: true;
	readonly teardown: Promise<DynamicEpochTeardownProof>;
}

interface DynamicFatalLifecycleFault {
	readonly child: ChildId;
	readonly epoch: ChildEpoch;
	readonly reason: DynamicFailClosedShutdownReason | "invalid_child_exit_proof";
	readonly message: string;
	readonly cause: unknown;
}

type DynamicMutationQuarantineState =
	| "poisoning"
	| "poisoned"
	| "terminalizing"
	| "shutdown_pending"
	| "fatal";

interface DynamicMutationQuarantineInspection {
	readonly epochCount: number;
	readonly callCount: number;
	readonly ordinaryInFlightWireCount: number;
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

type DynamicWaitEvent =
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

type DynamicWaitReleaseCause = Exclude<OwnedWaitCleanupCause, "decline">;

interface DynamicToolLifecyclePort {
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

type DynamicForkEffectArguments = Readonly<{
	readonly threadId: string;
	readonly beforeTurnId: string | null;
	readonly prompt: string | null;
}>;

type DynamicImmutableEffect =
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
type DynamicEffectFields = {
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

type DynamicEpochTransaction = EpochTransaction;
type DynamicWaitGraphDependency = CodexWaitGraph;
type DynamicCatalogueDependency = ArchboardAppNamespaceSpec;

interface CodexDynamicToolsOptions {
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

interface CodexDynamicTools {
	readonly dispatch: (request: DynamicServerRequest) => Promise<DynamicToolCallResponse>;
	readonly inspectMutationQuarantine: () => DynamicMutationQuarantineInspection;
	readonly dispose: () => void;
}

type DynamicToolArguments = ToolArguments[DynamicToolName];
type DynamicReverseResponse = ReverseResponse;
type DynamicToolCallIdValue = DynamicToolCallId;

type DynamicDispatchErrorCode = DynamicRefusalReason | "not_delivered" | "outcome_unknown";

class CodexDynamicToolsError extends Error {
	override readonly name = "CodexDynamicToolsError";
	readonly code: DynamicDispatchErrorCode;
	override readonly cause: unknown;

	constructor(code: DynamicDispatchErrorCode, message: string, cause?: unknown) {
		super(message);
		this.code = code;
		this.cause = cause;
	}
}

class CodexDynamicOperationTerminalizationError extends CodexDynamicToolsError {
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

class CodexDynamicEpochQuarantinedError extends CodexDynamicToolsError {
	readonly retryEligible = false;

	constructor(message: string, cause?: unknown) {
		super("system_error", message, cause);
	}
}

export {
	type DynamicAuthorityToken,
	type DynamicAuthorityTokenIssuer,
	createDynamicAuthorityTokenIssuer,
	type DynamicToolName,
	type DynamicMutationToolName,
	type DynamicReadToolName,
	type DynamicStatus,
	type DynamicOwnership,
	type DynamicEpochState,
	type DynamicRelation,
	type DynamicRefusalReason,
	type DynamicApprovalOutcome,
	type DynamicApprovalCause,
	type DynamicLifecyclePhase,
	type DynamicSessionDependency,
	type DynamicEpochDependency,
	type DynamicThreadLinkDependency,
	type DynamicTransportDependency,
	type DynamicToolApprovalRequest,
	type DynamicApprovalIdentity,
	type DynamicToolApprovalDecision,
	type DynamicToolApprovalPort,
	type DynamicThreadAuthorityRecord,
	type DynamicCallerAuthority,
	type DynamicTargetAuthority,
	type DynamicObservedTarget,
	type DynamicThreadAuthorityPort,
	type DynamicContextAuthority,
	type DynamicContextPort,
	type DynamicOperationTerminalDisposition,
	type DynamicOperationTerminalResult,
	type DynamicOperationIdPort,
	type DynamicWaitOwner,
	type DynamicMutationQuarantineIdentity,
	type DynamicMutationTerminalProof,
	type DynamicMutationQuarantineExit,
	type DynamicMutationQuarantineOwner,
	type DynamicFailClosedShutdownReason,
	type DynamicEpochTeardownProof,
	type DynamicFailClosedShutdownOwner,
	type DynamicFatalLifecycleFault,
	type DynamicMutationQuarantineState,
	type DynamicMutationQuarantineInspection,
	type DynamicWaitEvent,
	type DynamicWaitReleaseCause,
	type DynamicToolLifecyclePort,
	type DynamicForkEffectArguments,
	type DynamicImmutableEffect,
	type DynamicEffectFields,
	type DynamicEpochTransaction,
	type DynamicWaitGraphDependency,
	type DynamicCatalogueDependency,
	type CodexDynamicToolsOptions,
	type CodexDynamicTools,
	type DynamicToolArguments,
	type DynamicReverseResponse,
	type DynamicToolCallIdValue,
	type DynamicDispatchErrorCode,
	CodexDynamicToolsError,
	CodexDynamicOperationTerminalizationError,
	CodexDynamicEpochQuarantinedError,
};
