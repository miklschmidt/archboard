import type {
	CodexEpochStore,
	EpochExecutionProof,
	EpochOperationRecord,
	EpochSnapshot,
	EpochTransaction,
} from "../../codex-epoch/index.js";
import type {
	CodexSession,
	SessionParams,
	SessionResponse,
	SessionThread,
} from "../../codex-session/index.js";
import type {
	CodexThreadLinkPort,
	ThreadLinkBindingSnapshot,
	ThreadLinkCasToken,
	ThreadLinkTarget,
} from "../../codex-thread-link/index.js";
import type {
	ChildEpoch,
	ChildId,
	IdentityValidator,
	OperationAuthority,
	OperationId,
	ThreadId,
	TrustedIdentityDecoder,
} from "../../../shared/codex-workbench-identity/index.js";

export type WorkhorseThreadStartParams = SessionParams<"thread/start">;
export type WorkhorseStartResponse = SessionResponse<"thread/start">;
export type WorkhorseThreadReadResponse = SessionResponse<"thread/read">;
export type WorkhorseThreadDeleteResponse = SessionResponse<"thread/delete">;

export type WorkhorseApprovalPolicy = WorkhorseStartResponse["approvalPolicy"];
export type WorkhorseApprovalsReviewer = WorkhorseStartResponse["approvalsReviewer"];
export type WorkhorseSandboxPolicy = WorkhorseStartResponse["sandbox"];
export type WorkhorsePermissionProfile = WorkhorseStartResponse["activePermissionProfile"];

export type WorkhorseSessionPort = Pick<
	CodexSession,
	"threadStart" | "threadRead" | "threadDelete"
>;
export type WorkhorseThreadLinkPort = Pick<CodexThreadLinkPort, "classifyAndBind">;
export type WorkhorseEpochPort = Pick<
	CodexEpochStore,
	| "snapshot"
	| "assertCurrent"
	| "stageOperation"
	| "commitOperation"
	| "rollbackOperation"
	| "markOutcomeUnknown"
>;

/** The identity half of the authority is used only to validate returned server threads. */
export interface WorkhorseIdentityPort {
	readonly validator: Pick<IdentityValidator, "childId" | "epoch">;
	readonly decoder: Pick<TrustedIdentityDecoder, "parseThreadId">;
}

/** The operation half is the sole host-owned OperationId issuing capability. */
export type WorkhorseOperationPort = Pick<OperationAuthority, "issuer" | "validator">;

export interface WorkhorseStartInput {
	readonly paneId: string;
	/** The caller's last pane-binding CAS; null is valid only for an unbound pane. */
	readonly expected: ThreadLinkCasToken | null;
}

export interface CodexWorkhorseStartOptions {
	readonly session: WorkhorseSessionPort;
	readonly threadLink: WorkhorseThreadLinkPort;
	readonly epoch: WorkhorseEpochPort;
	readonly identity: WorkhorseIdentityPort;
	readonly operation: WorkhorseOperationPort;
	readonly checkoutRoot: string;
}

export type WorkhorseLifecycleState = "unbound" | "starting" | "ready" | "inspect_only" | "failed";

export type WorkhorseSettlementOutcome =
	| "pending"
	| "delivered"
	| "not_delivered"
	| "outcome_unknown";

/** The reviewed values returned by thread/start and retained as host evidence. */
export interface WorkhorseStartFacts {
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

export interface WorkhorseCleanupFacts {
	readonly operationId: OperationId;
	readonly threadId: ThreadId;
	readonly outcome: Exclude<WorkhorseSettlementOutcome, "pending">;
	readonly reason: string | null;
}

export interface WorkhorseSnapshot {
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

export type WorkhorseStartTransaction = EpochTransaction;
export type WorkhorseEpochSnapshot = EpochSnapshot;
export type WorkhorseEpochProof = EpochExecutionProof;
export type WorkhorseEpochRecord = EpochOperationRecord;
export type WorkhorseThread = SessionThread;
export type WorkhorseThreadLinkTarget = ThreadLinkTarget;

export interface CodexWorkhorseStart {
	readonly start: (input: WorkhorseStartInput) => Promise<WorkhorseSnapshot>;
	readonly snapshot: () => WorkhorseSnapshot;
}
import type { CODEX_SESSION_THREAD_SOURCE } from "../../codex-session/index.js";
