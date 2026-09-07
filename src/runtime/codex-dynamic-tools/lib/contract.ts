import type { CodexEpochStore, EpochExecutionProof, EpochTransaction } from "@/runtime/codex-epoch";
import type { ArchboardContext } from "@/runtime/codex-instructions";
import type { CodexSession, SessionThread } from "@/runtime/codex-session";
import type {
	CodexThreadLinkPort,
	ThreadLinkClassification,
	ThreadLinkSource,
	ThreadLinkTarget,
} from "@/runtime/codex-thread-link";
import type { CodexWaitGraph } from "@/runtime/codex-wait-graph";
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
import type {
	ArchboardAppNamespaceSpec,
	ToolArguments,
	DynamicToolCallResponse,
} from "@/runtime/codex-thread-tools";
import type { DynamicAuthorityToken } from "@/runtime/codex-dynamic-tools/lib/authority-token";
import type { DynamicOperationTerminalDisposition } from "@/runtime/codex-dynamic-tools/lib/errors";
import type { DynamicImmutableEffect } from "@/runtime/codex-dynamic-tools/lib/effect-contract";
import type {
	DynamicFailClosedShutdownOwner,
	DynamicFailClosedShutdownReason,
	DynamicFatalLifecycleFault,
	DynamicMutationQuarantineIdentity,
	DynamicMutationQuarantineInspection,
	DynamicMutationQuarantineOwner,
	DynamicMutationTerminalProof,
	DynamicWaitEvent,
	DynamicWaitOwner,
	DynamicWaitReleaseCause,
} from "@/runtime/codex-dynamic-tools/lib/lifecycle-contract";
import type {
	DynamicApprovalCause,
	DynamicApprovalOutcome,
	DynamicEpochState,
	DynamicLifecyclePhase,
	DynamicOwnership,
	DynamicRelation,
	DynamicStatus,
	DynamicToolName,
} from "@/runtime/codex-dynamic-tools/lib/vocabulary";

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

type DynamicContextKind =
	| "create_thread_initial_turn"
	| "fork_thread_initial_turn"
	| "send_message_to_thread";

interface DynamicContextPort {
	readonly issueAndRevalidatePaneLinkAuthority: (input: {
		readonly caller: DynamicCallerAuthority;
		readonly existing?: DynamicContextAuthority;
	}) => Promise<DynamicContextAuthority> | DynamicContextAuthority;
	readonly readOneFreshArchboardContext: (input: {
		readonly caller: DynamicCallerAuthority;
		readonly authority: DynamicContextAuthority;
		readonly operationId: OperationId;
		readonly kind: DynamicContextKind;
		readonly rpc: "turn/start";
		readonly targetThreadId?: ThreadId;
	}) => Promise<ArchboardContext>;
}

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

export {
	type DynamicAuthorityToken,
	type DynamicAuthorityTokenIssuer,
	createDynamicAuthorityTokenIssuer,
} from "@/runtime/codex-dynamic-tools/lib/authority-token";
export type {
	DynamicApprovalCause,
	DynamicApprovalOutcome,
	DynamicDispatchErrorCode,
	DynamicEpochState,
	DynamicLifecyclePhase,
	DynamicMutationToolName,
	DynamicOwnership,
	DynamicReadToolName,
	DynamicRefusalReason,
	DynamicRelation,
	DynamicStatus,
	DynamicToolName,
} from "@/runtime/codex-dynamic-tools/lib/vocabulary";
export {
	type DynamicOperationTerminalDisposition,
	CodexDynamicEpochQuarantinedError,
	CodexDynamicOperationTerminalizationError,
	CodexDynamicToolsError,
} from "@/runtime/codex-dynamic-tools/lib/errors";
export type {
	DynamicEffectFields,
	DynamicForkEffectArguments,
	DynamicImmutableEffect,
} from "@/runtime/codex-dynamic-tools/lib/effect-contract";
export type {
	DynamicEpochTeardownProof,
	DynamicFailClosedShutdownOwner,
	DynamicFailClosedShutdownReason,
	DynamicFatalLifecycleFault,
	DynamicMutationQuarantineExit,
	DynamicMutationQuarantineIdentity,
	DynamicMutationQuarantineInspection,
	DynamicMutationQuarantineOwner,
	DynamicMutationQuarantineState,
	DynamicMutationTerminalProof,
	DynamicWaitEvent,
	DynamicWaitOwner,
	DynamicWaitReleaseCause,
} from "@/runtime/codex-dynamic-tools/lib/lifecycle-contract";
export type {
	DynamicToolLifecyclePort,
	CodexDynamicTools,
	CodexDynamicToolsOptions,
	DynamicApprovalIdentity,
	DynamicCallerAuthority,
	DynamicCatalogueDependency,
	DynamicContextAuthority,
	DynamicContextKind,
	DynamicContextPort,
	DynamicEpochDependency,
	DynamicEpochTransaction,
	DynamicObservedTarget,
	DynamicOperationIdPort,
	DynamicOperationTerminalResult,
	DynamicReverseResponse,
	DynamicSessionDependency,
	DynamicTargetAuthority,
	DynamicThreadAuthorityPort,
	DynamicThreadAuthorityRecord,
	DynamicThreadLinkDependency,
	DynamicToolApprovalDecision,
	DynamicToolApprovalPort,
	DynamicToolApprovalRequest,
	DynamicToolArguments,
	DynamicToolCallIdValue,
	DynamicTransportDependency,
	DynamicWaitGraphDependency,
};
