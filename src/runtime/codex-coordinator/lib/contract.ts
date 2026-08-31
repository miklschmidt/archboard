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

export type CoordinatorModel = SessionResponse<"model/list">["data"][number];
export type CoordinatorStartResponse = SessionResponse<"thread/start">;
export type CoordinatorThreadStartParams = SessionParams<"thread/start">;
export type CoordinatorSettingsUpdateParams = SessionParams<"thread/settings/update">;
export type CoordinatorApprovalPolicy = CoordinatorStartResponse["approvalPolicy"];
export type CoordinatorApprovalsReviewer = CoordinatorStartResponse["approvalsReviewer"];
export type CoordinatorSandboxPolicy = CoordinatorStartResponse["sandbox"];
export type CoordinatorPermissionProfile = CoordinatorStartResponse["activePermissionProfile"];

export type CoordinatorSettingsNotification = Extract<
	TransportServerNotification["notification"],
	{ readonly method: "thread/settings/updated" }
>;
export type CoordinatorThreadSettings = CoordinatorSettingsNotification["params"]["threadSettings"];

export type CoordinatorSessionPort = Pick<
	CodexSession,
	"modelList" | "threadStart" | "threadSettingsUpdate"
>;
export type CoordinatorThreadLinkPort = Pick<CodexThreadLinkPort, "classify">;
export type CoordinatorEpochPort = Pick<
	CodexEpochStore,
	| "snapshot"
	| "assertCurrent"
	| "stageOperation"
	| "commitOperation"
	| "rollbackOperation"
	| "markOutcomeUnknown"
>;
export interface CoordinatorIdentityPort {
	readonly validator: Pick<IdentityValidator, "childId" | "epoch">;
	readonly decoder: Pick<TrustedIdentityDecoder, "resolveThreadId">;
}

export interface CoordinatorConfiguredSettings {
	readonly model: "gpt-5.6-luna";
	readonly effort: "medium";
	readonly serviceTier: "priority" | null;
}

export interface CoordinatorEffectiveSettings {
	readonly model: string;
	readonly effort: CoordinatorStartResponse["reasoningEffort"];
	readonly serviceTier: string | null;
}

/** Settings are host facts, not a second mutable settings authority. */
export interface CoordinatorSettings {
	readonly configured: CoordinatorConfiguredSettings;
	readonly effective: CoordinatorEffectiveSettings;
	readonly approvalPolicy: CoordinatorApprovalPolicy;
	readonly approvalsReviewer: CoordinatorApprovalsReviewer;
	readonly sandboxPolicy: CoordinatorSandboxPolicy;
	readonly activePermissionProfile: CoordinatorPermissionProfile;
}

export interface CoordinatorReviewHashes {
	readonly instructionHash: string;
	/** A stable digest over both reviewed dynamic-tool manifest digests. */
	readonly catalogueHash: string;
	readonly workhorseCatalogueHash: string;
	readonly voiceCatalogueHash: string;
	readonly settingsHash: string;
}

/** The serializable evidence the composition root may retain across reload. */
export interface CoordinatorPersistedState {
	readonly childId: ChildId;
	readonly epoch: ChildEpoch;
	readonly threadId: ThreadId;
	readonly operationId: string;
	readonly review: CoordinatorReviewHashes;
	readonly settings: CoordinatorSettings;
}

export type CoordinatorLifecycleState =
	| "unbound"
	| "starting"
	| "ready"
	| "inspect_only"
	| "failed";

export interface CoordinatorCapabilityPolicy {
	readonly web: true;
	readonly shell: true;
	readonly repository: true;
	readonly approvals: true;
	readonly boundedBoardAction: true;
	readonly sustainedWork: "instruction_policy";
}

export const COORDINATOR_CAPABILITY_POLICY: CoordinatorCapabilityPolicy = Object.freeze({
	web: true,
	shell: true,
	repository: true,
	approvals: true,
	boundedBoardAction: true,
	sustainedWork: "instruction_policy",
});

export interface CoordinatorSnapshot {
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

export interface CoordinatorEnsureInput {
	/** A fresh host-issued operation id is required for a new or replacement start. */
	readonly operationId?: string;
	/** Undefined uses the coordinator's current retained evidence; null clears it. */
	readonly persisted?: CoordinatorPersistedState | null;
}

export interface CodexCoordinatorOptions {
	readonly session: CoordinatorSessionPort;
	readonly threadLink: CoordinatorThreadLinkPort;
	readonly epoch: CoordinatorEpochPort;
	readonly identity: CoordinatorIdentityPort;
	readonly checkoutRoot: string;
	readonly persisted?: CoordinatorPersistedState | null;
}

export interface CodexCoordinator {
	readonly ensure: (input?: CoordinatorEnsureInput) => Promise<CoordinatorSnapshot>;
	readonly snapshot: () => CoordinatorSnapshot;
	readonly persisted: () => CoordinatorPersistedState | null;
	readonly onNotification: (event: TransportServerNotification) => void;
}

export type CoordinatorThreadLinkClassification = ThreadLinkClassification;
export type CoordinatorThreadLinkTarget = ThreadLinkTarget;
export type CoordinatorEpochSnapshot = EpochSnapshot;
export type CoordinatorEpochRecord = EpochOperationRecord;
export type CoordinatorEpochTransaction = EpochTransaction;

export type CoordinatorErrorCode =
	| "invalid_input"
	| "model_list_failed"
	| "model_unavailable"
	| "model_ambiguous"
	| "unsupported_effort"
	| "repeated_cursor"
	| "epoch_unavailable"
	| "transaction_failed"
	| "invalid_start_response"
	| "settings_mismatch";

export class CodexCoordinatorError extends Error {
	override readonly name = "CodexCoordinatorError";
	readonly code: CoordinatorErrorCode;
	override readonly cause: unknown;

	constructor(code: CoordinatorErrorCode, message: string, cause?: unknown) {
		super(message);
		this.code = code;
		this.cause = cause;
	}
}
