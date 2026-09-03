import type {
	BrowserAccount,
	BrowserCommandLease,
	BrowserCoordinator,
	BrowserLogin,
	BrowserOperationOutcome,
	BrowserReadiness,
	BrowserSemanticDelivery,
	BrowserSettings,
	BrowserSnapshot,
	BrowserThreadLink,
	BrowserTimeline,
} from "../../../shared/codex-browser-model/index.js";
import type {
	BrowserCommandId,
	ChildEpoch,
	ChildId,
	ThreadId,
} from "../../../shared/codex-workbench-identity/index.js";
import type {
	CodexResponseByMethod,
	CodexServerNotificationParamsByMethod,
} from "../../../shared/codex-app-server-contract/index.js";
import type { ApprovalOwnerView } from "../../../runtime/codex-approvals/index.js";
import type { DynamicToolApprovalRequest } from "../../../runtime/codex-dynamic-tools/index.js";
import type { SessionQueuedSubmission } from "../../../runtime/codex-session/index.js";
import type { RealtimeTranscriptRecord } from "../../../shared/codex-realtime-host/index.js";

export interface CodexAccountProjectionInput {
	readonly kind: "codex_account_response";
	readonly response: CodexResponseByMethod["account/read"];
}

export type BrowserAccountProjectionInput =
	| CodexAccountProjectionInput
	| Extract<
			BrowserAccount,
			{ readonly state: "unknown" | "signed_out" | "login_pending" | "failed" }
	  >;

type CodexThreadSettings =
	CodexServerNotificationParamsByMethod["thread/settings/updated"]["threadSettings"];

export interface CodexSettingsProjectionInput {
	readonly kind: "codex_thread_settings";
	readonly owner: BrowserSettings["owner"];
	readonly settings: Pick<
		CodexThreadSettings,
		| "model"
		| "effort"
		| "serviceTier"
		| "approvalPolicy"
		| "approvalsReviewer"
		| "sandboxPolicy"
		| "activePermissionProfile"
	>;
}

export interface CodexQueueProjectionInput {
	readonly kind: "codex_queue";
	readonly submissions: readonly Pick<SessionQueuedSubmission, "id" | "input">[] | null;
}

export interface CodexSemanticProjectionInput {
	readonly kind: "codex_semantic";
	readonly outcome: {
		readonly targetThreadId: BrowserSemanticDelivery["threadId"] | null;
		readonly outcome: BrowserSemanticDelivery["delivery"];
		readonly reason: string | null;
	} | null;
	readonly freshness: {
		readonly capturedAtMs: number;
		readonly freshUntilMs: number;
	} | null;
}

export interface CodexCoordinatorProjectionInput {
	readonly kind: "codex_coordinator";
	readonly state: BrowserCoordinator["state"] | "inspect_only";
	readonly threadId: BrowserCoordinator["threadId"];
	readonly configured: {
		readonly model: string;
		readonly effort: string | null;
	} | null;
	readonly effective: {
		readonly model: string;
		readonly effort: string | null;
		readonly serviceTier: string | null;
	} | null;
	readonly reason: string | null;
}

export interface CodexVoiceProjectionInput {
	readonly kind: "codex_voice";
	readonly mediaReady: boolean;
	readonly generation: { readonly browserSessionId: string } | null;
	readonly coordinatorState: CodexCoordinatorProjectionInput["state"];
	readonly transcript: readonly Pick<
		RealtimeTranscriptRecord,
		"itemId" | "sequence" | "role" | "text" | "status"
	>[];
}

export interface DynamicApprovalOwnerBinding {
	readonly commandId: BrowserCommandId;
	readonly paneId: string;
	readonly capturedLink: {
		readonly threadId: ThreadId;
		readonly childId: ChildId;
		readonly epoch: ChildEpoch;
	};
}

/** The dynamic owner exposes authoritative state; browser presentation is projected elsewhere. */
export interface DynamicApprovalOwnerView {
	readonly request: DynamicToolApprovalRequest;
	readonly binding: DynamicApprovalOwnerBinding;
}

export interface BrowserProjectionInput {
	readonly readiness: BrowserReadiness;
	readonly account: BrowserAccountProjectionInput;
	readonly login: BrowserLogin;
	readonly threadLink: BrowserThreadLink;
	readonly timeline: BrowserTimeline | null;
	readonly queue: CodexQueueProjectionInput;
	readonly settings: readonly CodexSettingsProjectionInput[];
	readonly approvals: readonly ApprovalOwnerView[];
	readonly dynamicApprovals: readonly DynamicApprovalOwnerView[];
	readonly semantic: CodexSemanticProjectionInput;
	readonly coordinator: CodexCoordinatorProjectionInput;
	readonly voice: CodexVoiceProjectionInput;
	readonly lease: BrowserCommandLease | null;
	readonly operation: BrowserOperationOutcome | null;
}

export type BrowserProjectionResult =
	| { readonly tag: "projected"; readonly snapshot: BrowserSnapshot }
	| {
			readonly tag: "refused";
			readonly reason: "secret_input" | "invalid_projection";
			readonly message: string;
	  };

export type BrowserOwnerProjection = Omit<
	BrowserProjectionInput,
	"threadLink" | "lease" | "operation"
>;
