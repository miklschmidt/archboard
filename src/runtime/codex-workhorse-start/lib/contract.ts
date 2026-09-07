import type {
	CodexEpochStore,
	EpochExecutionProof,
	EpochOperationRecord,
	EpochSnapshot,
	EpochTransaction,
} from "@/runtime/codex-epoch";
import type {
	CodexSession,
	SessionParams,
	SessionResponse,
	SessionThread,
} from "@/runtime/codex-session";
import type {
	CodexThreadLinkPort,
	ThreadLinkBindingSnapshot,
	ThreadLinkCasToken,
	ThreadLinkTarget,
} from "@/runtime/codex-thread-link";
import type {
	ChildEpoch,
	ChildId,
	IdentityValidator,
	OperationAuthority,
	OperationId,
	ThreadId,
	TrustedIdentityDecoder,
} from "@/shared/codex-workbench-identity";

type WorkhorseThreadStartParams = SessionParams<"thread/start">;
type WorkhorseStartResponse = SessionResponse<"thread/start">;
type WorkhorseThreadReadResponse = SessionResponse<"thread/read">;
type WorkhorseThreadDeleteResponse = SessionResponse<"thread/delete">;

type WorkhorseApprovalPolicy = WorkhorseStartResponse["approvalPolicy"];
type WorkhorseApprovalsReviewer = WorkhorseStartResponse["approvalsReviewer"];
type WorkhorseSandboxPolicy = WorkhorseStartResponse["sandbox"];
type WorkhorsePermissionProfile = WorkhorseStartResponse["activePermissionProfile"];

type WorkhorseSessionPort = Pick<CodexSession, "threadStart" | "threadRead" | "threadDelete">;
type WorkhorseThreadLinkPort = Pick<CodexThreadLinkPort, "classifyAndBind">;
type WorkhorseEpochPort = Pick<
	CodexEpochStore,
	| "snapshot"
	| "assertCurrent"
	| "stageOperation"
	| "commitOperation"
	| "rollbackOperation"
	| "markOutcomeUnknown"
>;

/** The identity half of the authority is used only to validate returned server threads. */
interface WorkhorseIdentityPort {
	readonly validator: Pick<IdentityValidator, "childId" | "epoch">;
	readonly decoder: Pick<TrustedIdentityDecoder, "parseThreadId">;
}

/** The operation half is the sole host-owned OperationId issuing capability. */
type WorkhorseOperationPort = Pick<OperationAuthority, "issuer" | "validator">;

interface WorkhorseStartInput {
	readonly paneId: string;
	/** The caller's last pane-binding CAS; null is valid only for an unbound pane. */
	readonly expected: ThreadLinkCasToken | null;
}

interface CodexWorkhorseStartOptions {
	readonly session: WorkhorseSessionPort;
	readonly threadLink: WorkhorseThreadLinkPort;
	readonly epoch: WorkhorseEpochPort;
	readonly identity: WorkhorseIdentityPort;
	readonly operation: WorkhorseOperationPort;
	readonly checkoutRoot: string;
}

type WorkhorseLifecycleState = "unbound" | "starting" | "ready" | "inspect_only" | "failed";

type WorkhorseSettlementOutcome = "pending" | "delivered" | "not_delivered" | "outcome_unknown";

/** The reviewed values returned by thread/start and retained as host evidence. */
interface WorkhorseStartFacts {
	readonly threadId: ThreadId;
	readonly cwd: string;
	readonly runtimeWorkspaceRoots: readonly string[];
	readonly historyMode: "paginated";
	readonly source: typeof CODEX_SESSION_THREAD_SOURCE;
	readonly threadSource: "archboard";
	readonly model: string;
	readonly modelProvider: string;
	readonly serviceTier: string | null;
	readonly approvalPolicy: WorkhorseApprovalPolicy;
	readonly approvalsReviewer: WorkhorseApprovalsReviewer;
	readonly sandbox: WorkhorseSandboxPolicy;
	readonly activePermissionProfile: WorkhorsePermissionProfile;
	readonly instructionHash: string;
	readonly manifestHash: string;
}

interface WorkhorseCleanupFacts {
	readonly operationId: OperationId;
	readonly threadId: ThreadId;
	readonly outcome: Exclude<WorkhorseSettlementOutcome, "pending">;
	readonly reason: string | null;
}

interface WorkhorseSnapshot {
	readonly kind: "codex_workhorse";
	readonly state: WorkhorseLifecycleState;
	readonly paneId: string | null;
	readonly childId: ChildId | null;
	readonly epoch: ChildEpoch | null;
	readonly threadId: ThreadId | null;
	readonly operationId: OperationId | null;
	readonly outcome: WorkhorseSettlementOutcome | null;
	readonly start: WorkhorseStartFacts | null;
	readonly binding: ThreadLinkBindingSnapshot | null;
	readonly cleanup: WorkhorseCleanupFacts | null;
	readonly reason: string | null;
}

type WorkhorseStartTransaction = EpochTransaction;
type WorkhorseEpochSnapshot = EpochSnapshot;
type WorkhorseEpochProof = EpochExecutionProof;
type WorkhorseEpochRecord = EpochOperationRecord;
type WorkhorseThread = SessionThread;
type WorkhorseThreadLinkTarget = ThreadLinkTarget;

interface CodexWorkhorseStart {
	readonly start: (input: WorkhorseStartInput) => Promise<WorkhorseSnapshot>;
	readonly snapshot: () => WorkhorseSnapshot;
}
import type { CODEX_SESSION_THREAD_SOURCE } from "@/runtime/codex-session";

export {
	type WorkhorseThreadStartParams,
	type WorkhorseStartResponse,
	type WorkhorseThreadReadResponse,
	type WorkhorseThreadDeleteResponse,
	type WorkhorseApprovalPolicy,
	type WorkhorseApprovalsReviewer,
	type WorkhorseSandboxPolicy,
	type WorkhorsePermissionProfile,
	type WorkhorseSessionPort,
	type WorkhorseThreadLinkPort,
	type WorkhorseEpochPort,
	type WorkhorseIdentityPort,
	type WorkhorseOperationPort,
	type WorkhorseStartInput,
	type CodexWorkhorseStartOptions,
	type WorkhorseLifecycleState,
	type WorkhorseSettlementOutcome,
	type WorkhorseStartFacts,
	type WorkhorseCleanupFacts,
	type WorkhorseSnapshot,
	type WorkhorseStartTransaction,
	type WorkhorseEpochSnapshot,
	type WorkhorseEpochProof,
	type WorkhorseEpochRecord,
	type WorkhorseThread,
	type WorkhorseThreadLinkTarget,
	type CodexWorkhorseStart,
};
