import type {
	ActiveEpoch,
	CodexEpochStore,
	EpochExecutionProof,
	EpochOperationRecord,
	EpochOperationStatus,
	EpochOperationOutcome,
} from "../../codex-epoch/index.js";
import type {
	CodexSession,
	SessionLoadedThreadPageResult,
	SessionThread,
	SessionThreadPageResult,
	SessionThreadSource,
} from "../../codex-session/index.js";
import type {
	ChildEpoch,
	ChildId,
	ThreadId,
} from "../../../shared/codex-workbench-identity/index.js";
import type {
	ThreadLinkReason as AuthoredThreadLinkReason,
	ThreadLinkState as AuthoredThreadLinkState,
} from "../../codex-instructions/index.js";
import type { AdditionalContextPolicy } from "../../codex-instructions/index.js";

export type ThreadLinkReason = AuthoredThreadLinkReason;
export type ThreadLinkReasonCode = ThreadLinkReason;
export type ThreadLinkCondition =
	AdditionalContextPolicy["threadLink"]["reasonPrecedence"][number]["condition"];
export type ThreadLinkState = AuthoredThreadLinkState;
export type ThreadLinkStatus = SessionThread["status"]["type"];
export type ThreadLinkSource = SessionThreadSource;
export type ThreadLinkAllowedSource = Extract<
	ThreadLinkSource,
	"cli" | "vscode" | "exec" | "appServer"
>;
export type ThreadLinkExecutableStatus = Exclude<ThreadLinkStatus, "notLoaded" | "systemError">;

export type ThreadLinkCurrentEpoch = Pick<ActiveEpoch, "childId" | "epoch">;
export type ThreadLinkCurrentEpochSource =
	| ThreadLinkCurrentEpoch
	| (() => ThreadLinkCurrentEpoch | null);

/** The live durable authority required before a link can become executable. */
export type ThreadLinkEpochAuthority = Pick<CodexEpochStore, "assertCurrent" | "snapshot">;

/** A committed epoch record or a proof returned by `assertCurrent`. */
export type ThreadLinkEpochProof = EpochOperationRecord | EpochExecutionProof;

/** The identity and durable ownership evidence captured by a pane link. */
export interface ThreadLinkTarget {
	readonly threadId: ThreadId;
	readonly childId: ChildId | null;
	readonly epoch: ChildEpoch | null;
	readonly operationId?: string;
	readonly provenance?: ThreadLinkEpochProof | null;
}

export interface CodexThreadLinkClassifierOptions {
	readonly session: Pick<CodexSession, "threadListPage" | "threadLoadedListPage">;
	/** Prefer this live source when supplied; `epoch.snapshot()` is the fallback. */
	readonly currentEpoch?: ThreadLinkCurrentEpochSource;
	readonly epoch?: ThreadLinkEpochAuthority;
}

export interface ThreadLinkObservation {
	readonly persisted: boolean;
	readonly persistedRows: number;
	readonly loaded: boolean;
	readonly loadedOccurrences: number;
	readonly source: ThreadLinkSource;
	readonly status: ThreadLinkStatus;
	readonly canAcceptDirectInput: boolean | null;
}

export interface ExecutableThreadLink {
	readonly kind: "thread_link";
	readonly state: "executable";
	readonly childId: ChildId;
	readonly epoch: ChildEpoch;
	readonly threadId: ThreadId;
	readonly source: ThreadLinkAllowedSource;
	readonly status: ThreadLinkExecutableStatus;
	readonly loaded: true;
	readonly canAcceptDirectInput: true;
	readonly reason: null;
}

export interface InspectOnlyThreadLink {
	readonly kind: "thread_link";
	readonly state: "inspect_only";
	readonly childId: null;
	readonly epoch: null;
	readonly threadId: ThreadId;
	readonly source: ThreadLinkSource;
	readonly status: ThreadLinkStatus;
	readonly loaded: boolean;
	/** False for every inspect-only link, including an observed null capability. */
	readonly canAcceptDirectInput: false;
	readonly reason: ThreadLinkReason;
}

export type ThreadLink = ExecutableThreadLink | InspectOnlyThreadLink;

export interface UnboundThreadLink {
	readonly kind: "thread_link";
	readonly state: "unbound";
	readonly childId: null;
	readonly epoch: null;
	readonly threadId: null;
	readonly source: null;
	readonly status: "notLoaded";
	readonly loaded: false;
	readonly canAcceptDirectInput: false;
	readonly reason: null;
}

export type ThreadLinkSnapshot = ThreadLink | UnboundThreadLink;

export interface ThreadLinkClassification {
	readonly link: ThreadLink;
	readonly thread: SessionThread | null;
	readonly observation: ThreadLinkObservation;
	readonly currentEpoch: ThreadLinkCurrentEpoch | null;
	/** The matching proof read from the live durable epoch authority, if any. */
	readonly proof: EpochExecutionProof | null;
}

export type ThreadLinkCandidateSource = ThreadLinkAllowedSource | "custom" | "subAgent" | "unknown";

/** The complete browser-safe projection for one host-retained candidate. */
export interface ThreadLinkCandidate {
	readonly selectionId: string;
	readonly threadId: ThreadId;
	readonly state: Exclude<ThreadLinkState, "unbound">;
	readonly reason: ThreadLinkReason | null;
	readonly source: ThreadLinkCandidateSource;
	readonly status: ThreadLinkStatus;
	readonly loaded: boolean;
	readonly canAcceptDirectInput: boolean | null;
}

/** One authoritative inventory. No member comes from a partial page or another generation. */
export interface ThreadLinkCandidateDiscovery {
	readonly candidates: readonly ThreadLinkCandidate[];
}

export type ThreadLinkClassificationErrorCode =
	| "invalid_input"
	| "invalid_result"
	| "current_epoch_unavailable"
	| "repeated_cursor"
	| "transport_failure"
	| "list_exhaustion_failure"
	| "conflict";

export class CodexThreadLinkError extends Error {
	override readonly name: string = "CodexThreadLinkError";
	readonly code: ThreadLinkClassificationErrorCode;
	override readonly cause: unknown;

	constructor(code: ThreadLinkClassificationErrorCode, message: string, cause?: unknown) {
		super(message);
		this.code = code;
		this.cause = cause;
	}
}

export class CodexThreadLinkConflictError extends CodexThreadLinkError {
	override readonly name: string = "CodexThreadLinkConflictError";

	constructor(message: string) {
		super("conflict", message);
	}
}

export interface ThreadLinkCasToken {
	readonly revision: number;
	readonly paneId: string;
	readonly childId: ChildId | null;
	readonly epoch: ChildEpoch | null;
	readonly threadId: ThreadId | null;
}

export interface ThreadLinkBindingSnapshot {
	readonly paneId: string;
	readonly revision: number;
	readonly link: ThreadLinkSnapshot;
	readonly cas: ThreadLinkCasToken;
}

/** Public CAS accepts only unbound or explicitly inspect-only links. */
export type ThreadLinkNonExecutableSnapshot = InspectOnlyThreadLink | UnboundThreadLink;

export interface ThreadLinkCompareAndSwapInput {
	readonly paneId: string;
	readonly expected: ThreadLinkCasToken | null;
	readonly next: ThreadLinkNonExecutableSnapshot;
}

export interface ThreadLinkBindingStore {
	readonly snapshot: (paneId: string) => ThreadLinkBindingSnapshot;
	readonly read: (paneId: string) => ThreadLinkBindingSnapshot;
	readonly compareAndSwap: (input: ThreadLinkCompareAndSwapInput) => ThreadLinkBindingSnapshot;
	readonly clear: (
		paneId: string,
		expected: ThreadLinkCasToken | null,
	) => ThreadLinkBindingSnapshot;
}

export interface CodexThreadLinkClassifier {
	readonly classify: (target: ThreadLinkTarget) => Promise<ThreadLinkClassification>;
}

export interface CodexThreadLinkPort extends CodexThreadLinkClassifier, ThreadLinkBindingStore {
	/** Exhaust and classify the candidates browser consumers may offer for explicit binding. */
	readonly discoverCandidates: () => Promise<ThreadLinkCandidateDiscovery>;
	/** Resolve one opaque candidate once, then adopt it through fresh classification and pane CAS. */
	readonly bindCandidate: (
		paneId: string,
		expected: ThreadLinkCasToken | null,
		selectionId: string,
	) => Promise<ThreadLinkBindingSnapshot>;
	/** Classify twice through the live authorities, then adopt the fresh result by CAS. */
	readonly classifyAndBind: (
		paneId: string,
		expected: ThreadLinkCasToken | null,
		target: ThreadLinkTarget,
	) => Promise<ThreadLinkBindingSnapshot>;
}

export type {
	EpochExecutionProof,
	EpochOperationOutcome,
	EpochOperationRecord,
	EpochOperationStatus,
	SessionLoadedThreadPageResult,
	SessionThread,
	SessionThreadPageResult,
	SessionThreadSource,
};
