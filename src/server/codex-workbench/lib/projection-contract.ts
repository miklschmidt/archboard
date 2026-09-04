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
} from "../../../shared/codex-browser-model/index.js";
import type {
	BrowserCommandId,
	ChildEpoch,
	ChildId,
	OperationId,
	ThreadId,
} from "../../../shared/codex-workbench-identity/index.js";
import type {
	CodexResponseByMethod,
	CodexServerNotificationParamsByMethod,
} from "../../../shared/codex-app-server-contract/index.js";
import type {
	ApprovalOwnerView,
	ApprovalState,
	DeepReadonly,
	ItemApprovalIdentity,
} from "../../../runtime/codex-approvals/index.js";
import type { DynamicToolApprovalRequest } from "../../../runtime/codex-dynamic-tools/index.js";
import type {
	SessionQueuedSubmission,
	SessionResponsePayloads,
	SessionThreadItem,
	SessionTurn,
} from "../../../runtime/codex-session/index.js";
import type { ThreadLinkSnapshot } from "../../../runtime/codex-thread-link/index.js";
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

/**
 * One authoritative queued submission, with the Archboard operation that queued
 * it when Archboard queued it.
 *
 * The queue port sets a submission's `clientUserMessageId` to the serialized
 * OperationId on every add it makes, so the composition root can recover the
 * operation from the authoritative list and hand it over here. A null operation
 * is a submission Archboard did not queue, and this pane has no authority to
 * reorder it.
 */
export interface CodexQueuedSubmissionProjectionInput extends Pick<
	SessionQueuedSubmission,
	"id" | "input"
> {
	readonly operationId: OperationId | null;
}

export interface CodexQueueProjectionInput {
	readonly kind: "codex_queue";
	readonly submissions: readonly CodexQueuedSubmissionProjectionInput[] | null;
}

type SessionItem<Type extends SessionThreadItem["type"]> = Extract<
	SessionThreadItem,
	{ readonly type: Type }
>;
type TimelineSessionItem<
	Type extends SessionThreadItem["type"],
	Field extends keyof SessionItem<Type>,
> = DeepReadonly<Pick<SessionItem<Type>, Field>> & Readonly<Record<string, unknown>>;

interface CodexTimelineAgentMessageProjectionInput extends Readonly<Record<string, unknown>> {
	readonly kind: "agent_message";
	readonly item: TimelineSessionItem<"agentMessage", "type" | "id" | "text">;
}

interface CodexTimelineToolProjectionInput extends Readonly<Record<string, unknown>> {
	readonly kind: "tool_call";
	readonly item: TimelineSessionItem<
		"mcpToolCall" | "dynamicToolCall",
		"type" | "id" | "tool" | "status"
	>;
}

interface CodexTimelineCommandProjectionInput extends Readonly<Record<string, unknown>> {
	readonly kind: "command_execution";
	readonly item: TimelineSessionItem<"commandExecution", "type" | "id" | "command" | "status">;
}

interface CodexTimelineFileChangeProjectionInput extends Readonly<Record<string, unknown>> {
	readonly kind: "file_change";
	readonly item: TimelineSessionItem<"fileChange", "type" | "id" | "status">;
}

interface CodexTimelineReasoningProjectionInput extends Readonly<Record<string, unknown>> {
	readonly kind: "reasoning_summary";
	readonly item: TimelineSessionItem<"reasoning", "type" | "id">;
	/** The future owner chooses the bounded reasoning presentation from generated arrays. */
	readonly text: string;
}

interface CodexTimelinePlanProjectionInput extends Readonly<Record<string, unknown>> {
	readonly kind: "plan";
	readonly item: TimelineSessionItem<"plan", "type" | "id" | "text">;
}

type TimelineApprovalIdentity = DeepReadonly<
	Omit<ItemApprovalIdentity, "approvalId"> & {
		readonly approvalId: NonNullable<ItemApprovalIdentity["approvalId"]>;
	}
> &
	Readonly<Record<string, unknown>>;

interface CodexTimelineApprovalProjectionInput extends Readonly<Record<string, unknown>> {
	readonly kind: "approval_request";
	readonly identity: TimelineApprovalIdentity;
	readonly state: Extract<ApprovalState, "pending" | "settled" | "cancelled">;
}

/** Independent readonly owner presentation; the sole adapter chooses browser media arms. */
export type CodexTimelineItemProjectionInput =
	| CodexTimelineAgentMessageProjectionInput
	| CodexTimelineToolProjectionInput
	| CodexTimelineCommandProjectionInput
	| CodexTimelineFileChangeProjectionInput
	| CodexTimelineReasoningProjectionInput
	| CodexTimelinePlanProjectionInput
	| CodexTimelineApprovalProjectionInput;

interface CodexTimelineTurnPresentation extends Readonly<Record<string, unknown>> {
	readonly summary: string;
	readonly outputs: Readonly<{
		included: boolean;
		truncated: boolean;
	}>;
}

export interface CodexTimelineTurnProjectionInput extends Readonly<Record<string, unknown>> {
	readonly turn: DeepReadonly<Pick<SessionTurn, "id" | "status">> &
		Readonly<Record<string, unknown>>;
	readonly items: readonly CodexTimelineItemProjectionInput[];
	readonly presentation: CodexTimelineTurnPresentation;
}

/** Readonly owner view; TASK-143.01.10 owns the live producer. */
export interface CodexTimelineProjectionInput extends Readonly<Record<string, unknown>> {
	readonly kind: "codex_timeline";
	readonly threadId: ThreadId;
	readonly turns: readonly CodexTimelineTurnProjectionInput[];
	readonly cursor: SessionResponsePayloads["thread/timeline/list"]["nextCursor"];
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
export type DynamicApprovalOwnerRequest = DeepReadonly<DynamicToolApprovalRequest>;

export interface DynamicApprovalOwnerView {
	readonly request: DynamicApprovalOwnerRequest;
	readonly binding: DynamicApprovalOwnerBinding;
}

export interface BrowserProjectionInput {
	readonly readiness: BrowserReadiness;
	readonly account: BrowserAccountProjectionInput;
	readonly login: BrowserLogin;
	readonly threadLink: ThreadLinkSnapshot;
	readonly timeline: CodexTimelineProjectionInput | null;
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
