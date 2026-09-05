import type {
	CodexEpochStore,
	EpochOperationRecord,
	EpochSnapshot,
	EpochTransaction,
} from "../../codex-epoch/index.js";
import type { CodexSession, SessionParams, SessionResponse } from "../../codex-session/index.js";
import type {
	CodexThreadLinkPort,
	ThreadLinkClassification,
	ThreadLinkTarget,
} from "../../codex-thread-link/index.js";
import type { TransportServerNotification } from "../../codex-transport/server-requests.js";
import type {
	ChildEpoch,
	ChildId,
	IdentityValidator,
	ThreadId,
	TrustedIdentityDecoder,
} from "../../../shared/codex-workbench-identity/index.js";

type CoordinatorModel = SessionResponse<"model/list">["data"][number];
type CoordinatorStartResponse = SessionResponse<"thread/start">;
type CoordinatorThreadStartParams = SessionParams<"thread/start">;
type CoordinatorSettingsUpdateParams = SessionParams<"thread/settings/update">;
type CoordinatorApprovalPolicy = CoordinatorStartResponse["approvalPolicy"];
type CoordinatorApprovalsReviewer = CoordinatorStartResponse["approvalsReviewer"];
type CoordinatorSandboxPolicy = CoordinatorStartResponse["sandbox"];
type CoordinatorPermissionProfile = CoordinatorStartResponse["activePermissionProfile"];

type CoordinatorSettingsNotification = Extract<
	TransportServerNotification["notification"],
	{ readonly method: "thread/settings/updated" }
>;
type CoordinatorThreadSettings = CoordinatorSettingsNotification["params"]["threadSettings"];

type CoordinatorSessionPort = Pick<
	CodexSession,
	"modelList" | "threadStart" | "threadSettingsUpdate"
>;
type CoordinatorThreadLinkPort = Pick<CodexThreadLinkPort, "classify">;
type CoordinatorEpochPort = Pick<
	CodexEpochStore,
	| "snapshot"
	| "assertCurrent"
	| "stageOperation"
	| "commitOperation"
	| "rollbackOperation"
	| "markOutcomeUnknown"
>;
interface CoordinatorIdentityPort {
	readonly validator: Pick<IdentityValidator, "childId" | "epoch">;
	readonly decoder: Pick<TrustedIdentityDecoder, "resolveThreadId">;
}

interface CoordinatorConfiguredSettings {
	readonly model: "gpt-5.6-luna";
	readonly effort: "medium";
	readonly serviceTier: "priority" | null;
}

interface CoordinatorEffectiveSettings {
	readonly model: string;
	readonly effort: CoordinatorStartResponse["reasoningEffort"];
	readonly serviceTier: string | null;
}

/** Settings are host facts, not a second mutable settings authority. */
interface CoordinatorSettings {
	readonly configured: CoordinatorConfiguredSettings;
	readonly effective: CoordinatorEffectiveSettings;
	readonly approvalPolicy: CoordinatorApprovalPolicy;
	readonly approvalsReviewer: CoordinatorApprovalsReviewer;
	readonly sandboxPolicy: CoordinatorSandboxPolicy;
	readonly activePermissionProfile: CoordinatorPermissionProfile;
}

interface CoordinatorReviewHashes {
	readonly instructionHash: string;
	/** A stable digest over both reviewed dynamic-tool manifest digests. */
	readonly catalogueHash: string;
	readonly workhorseCatalogueHash: string;
	readonly voiceCatalogueHash: string;
	readonly settingsHash: string;
}

/** The serializable evidence the composition root may retain across reload. */
interface CoordinatorPersistedState {
	readonly childId: ChildId;
	readonly epoch: ChildEpoch;
	readonly threadId: ThreadId;
	readonly operationId: string;
	readonly review: CoordinatorReviewHashes;
	readonly settings: CoordinatorSettings;
}

type CoordinatorLifecycleState = "unbound" | "starting" | "ready" | "inspect_only" | "failed";

interface CoordinatorCapabilityPolicy {
	readonly web: true;
	readonly shell: true;
	readonly repository: true;
	readonly approvals: true;
	readonly boundedBoardAction: true;
	readonly sustainedWork: "instruction_policy";
}

const COORDINATOR_CAPABILITY_POLICY: CoordinatorCapabilityPolicy = Object.freeze({
	web: true,
	shell: true,
	repository: true,
	approvals: true,
	boundedBoardAction: true,
	sustainedWork: "instruction_policy",
});

interface CoordinatorSnapshot {
	readonly state: CoordinatorLifecycleState;
	readonly threadId: ThreadId | null;
	readonly childId: ChildId | null;
	readonly epoch: ChildEpoch | null;
	readonly operationId: string | null;
	readonly configured: CoordinatorConfiguredSettings | null;
	readonly effective: CoordinatorEffectiveSettings | null;
	readonly approvalPolicy: CoordinatorApprovalPolicy | null;
	readonly approvalsReviewer: CoordinatorApprovalsReviewer | null;
	readonly sandboxPolicy: CoordinatorSandboxPolicy | null;
	readonly activePermissionProfile: CoordinatorPermissionProfile | null;
	readonly review: CoordinatorReviewHashes | null;
	readonly capabilities: CoordinatorCapabilityPolicy;
	readonly persistence: CoordinatorPersistedState | null;
	readonly reason: string | null;
}

interface CoordinatorEnsureInput {
	/** A fresh host-issued operation id is required for a new or replacement start. */
	readonly operationId?: string;
	/** Undefined uses the coordinator's current retained evidence; null clears it. */
	readonly persisted?: CoordinatorPersistedState | null;
}

interface CodexCoordinatorOptions {
	readonly session: CoordinatorSessionPort;
	readonly threadLink: CoordinatorThreadLinkPort;
	readonly epoch: CoordinatorEpochPort;
	readonly identity: CoordinatorIdentityPort;
	readonly checkoutRoot: string;
	readonly persisted?: CoordinatorPersistedState | null;
}

interface CodexCoordinator {
	readonly ensure: (input?: CoordinatorEnsureInput) => Promise<CoordinatorSnapshot>;
	readonly snapshot: () => CoordinatorSnapshot;
	readonly persisted: () => CoordinatorPersistedState | null;
	readonly onNotification: (event: TransportServerNotification) => void;
}

type CoordinatorThreadLinkClassification = ThreadLinkClassification;
type CoordinatorThreadLinkTarget = ThreadLinkTarget;
type CoordinatorEpochSnapshot = EpochSnapshot;
type CoordinatorEpochRecord = EpochOperationRecord;
type CoordinatorEpochTransaction = EpochTransaction;

type CoordinatorErrorCode =
	| "invalid_input"
	| "model_list_failed"
	| "model_unavailable"
	| "model_ambiguous"
	| "unsupported_effort"
	| "repeated_cursor"
	| "epoch_unavailable"
	| "transaction_failed"
	| "invalid_start_response"
	| "settings_mismatch"
	| "settings_timeout";

class CodexCoordinatorError extends Error {
	override readonly name = "CodexCoordinatorError";
	readonly code: CoordinatorErrorCode;
	override readonly cause: unknown;

	constructor(code: CoordinatorErrorCode, message: string, cause?: unknown) {
		super(message);
		this.code = code;
		this.cause = cause;
	}
}

export {
	type CoordinatorModel,
	type CoordinatorStartResponse,
	type CoordinatorThreadStartParams,
	type CoordinatorSettingsUpdateParams,
	type CoordinatorApprovalPolicy,
	type CoordinatorApprovalsReviewer,
	type CoordinatorSandboxPolicy,
	type CoordinatorPermissionProfile,
	type CoordinatorSettingsNotification,
	type CoordinatorThreadSettings,
	type CoordinatorSessionPort,
	type CoordinatorThreadLinkPort,
	type CoordinatorEpochPort,
	type CoordinatorIdentityPort,
	type CoordinatorConfiguredSettings,
	type CoordinatorEffectiveSettings,
	type CoordinatorSettings,
	type CoordinatorReviewHashes,
	type CoordinatorPersistedState,
	type CoordinatorLifecycleState,
	type CoordinatorCapabilityPolicy,
	COORDINATOR_CAPABILITY_POLICY,
	type CoordinatorSnapshot,
	type CoordinatorEnsureInput,
	type CodexCoordinatorOptions,
	type CodexCoordinator,
	type CoordinatorThreadLinkClassification,
	type CoordinatorThreadLinkTarget,
	type CoordinatorEpochSnapshot,
	type CoordinatorEpochRecord,
	type CoordinatorEpochTransaction,
	type CoordinatorErrorCode,
	CodexCoordinatorError,
};
