import type { BrowserDynamicApproval } from "#shared/schemas/dynamic-approval/approval.ts";
import type { BrowserSchemas } from "#shared/schemas/browser/snapshot.ts";

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
	BrowserVoiceContext,
	BrowserWorkhorses,
} from "#shared/schemas/browser/snapshot.ts";
import type { OperationId, ThreadId, TurnId } from "@archboard/codex-app-server/identity";
import type {
	CodexResponseByMethod,
	CodexServerNotificationParamsByMethod,
} from "@archboard/codex-app-server/contract";
import type {
	ApprovalOwnerView,
	ApprovalState,
	DeepReadonly,
	ItemApprovalIdentity,
} from "#runtime/services/approvals/contract.ts";
import type {
	SessionQueuedSubmission,
	SessionResponsePayloads,
	SessionThreadItem,
	SessionTurn,
} from "@archboard/codex-app-server/session";
import type { ThreadLinkSnapshot } from "#runtime/rules/thread-link/contract.ts";
import type { RealtimeTranscriptRecord } from "#shared/protocol/realtime-contract.ts";
import type { SpokenApprovalSnapshot } from "#runtime/protocol/spoken-approval/contract.ts";

/** The schemas that project and parse the browser state. */
type BrowserProjectionModel = Pick<
	BrowserSchemas,
	"BrowserSnapshotSchema" | "BrowserSpokenApprovalSchema"
>;

interface CodexAccountProjectionInput {
	readonly kind: "codex_account_response";
	readonly response: CodexResponseByMethod["account/read"];
}

type BrowserAccountProjectionInput =
	| CodexAccountProjectionInput
	| Extract<
			BrowserAccount,
			{ readonly state: "unknown" | "signed_out" | "login_pending" | "failed" }
	  >;

type CodexThreadSettings =
	CodexServerNotificationParamsByMethod["thread/settings/updated"]["threadSettings"];

interface CodexSettingsProjectionInput {
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
 * One authoritative queued submission, with the operation that queued
 * it when this workbench queued it.
 *
 * The queue port sets a submission's `clientUserMessageId` to the serialized
 * OperationId on every add it makes, so the composition root can recover the
 * operation from the authoritative list and hand it over here. A null operation
 * is a submission this workbench did not queue, and this pane has no authority to
 * reorder it.
 */
interface CodexQueuedSubmissionProjectionInput extends Pick<
	SessionQueuedSubmission,
	"id" | "input"
> {
	readonly operationId: OperationId | null;
}

interface CodexQueueProjectionInput {
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

interface CodexTimelineUserMessageProjectionInput extends Readonly<Record<string, unknown>> {
	readonly kind: "user_message";
	readonly item: TimelineSessionItem<"userMessage", "type" | "id">;
	/** What the person said, bounded, with each non-text input named in brackets. */
	readonly text: string;
}

interface CodexTimelineAgentMessageProjectionInput extends Readonly<Record<string, unknown>> {
	readonly kind: "agent_message";
	readonly item: TimelineSessionItem<"agentMessage", "type" | "id" | "text">;
}

interface CodexTimelineToolProjectionInput extends Readonly<Record<string, unknown>> {
	readonly kind: "tool_call";
	readonly item: TimelineSessionItem<
		"mcpToolCall" | "dynamicToolCall",
		"type" | "id" | "tool" | "status" | "durationMs"
	>;
	/** The MCP server, or the dynamic tool's namespace. */
	readonly server: string | null;
	/** The call's arguments as bounded compact JSON. */
	readonly arguments: string | null;
	/** Why the call failed, when it reported a failure. */
	readonly error: string | null;
}

interface CodexTimelineCommandProjectionInput extends Readonly<Record<string, unknown>> {
	readonly kind: "command_execution";
	readonly item: TimelineSessionItem<
		"commandExecution",
		"type" | "id" | "command" | "status" | "exitCode" | "durationMs"
	>;
	/** The working directory, bounded; null when Codex reported none. */
	readonly cwd: string | null;
	/** The bounded tail of the aggregated output, and whether anything before it was cut. */
	readonly output: { readonly tail: string | null; readonly truncated: boolean };
}

type CodexPatchChangeKind = SessionItem<"fileChange">["changes"][number]["kind"]["type"];

/** One changed file, its diff reduced to line counts. */
interface CodexTimelineFileChangeEntry extends Readonly<Record<string, unknown>> {
	readonly path: string;
	readonly kind: CodexPatchChangeKind;
	readonly movePath: string | null;
	readonly added: number;
	readonly removed: number;
}

interface CodexTimelineFileChangeProjectionInput extends Readonly<Record<string, unknown>> {
	readonly kind: "file_change";
	readonly item: TimelineSessionItem<"fileChange", "type" | "id" | "status">;
	readonly changes: readonly CodexTimelineFileChangeEntry[];
	readonly changesTruncated: boolean;
}

interface CodexTimelineWebSearchProjectionInput extends Readonly<Record<string, unknown>> {
	readonly kind: "web_search";
	readonly item: TimelineSessionItem<"webSearch", "type" | "id">;
	/** The bounded query, or null while Codex has not said what it searched for. */
	readonly query: string | null;
}

interface CodexTimelineCompactionProjectionInput extends Readonly<Record<string, unknown>> {
	readonly kind: "context_compaction";
	readonly item: TimelineSessionItem<"contextCompaction", "type" | "id">;
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
type CodexTimelineItemProjectionInput =
	| CodexTimelineUserMessageProjectionInput
	| CodexTimelineAgentMessageProjectionInput
	| CodexTimelineToolProjectionInput
	| CodexTimelineCommandProjectionInput
	| CodexTimelineFileChangeProjectionInput
	| CodexTimelineReasoningProjectionInput
	| CodexTimelinePlanProjectionInput
	| CodexTimelineWebSearchProjectionInput
	| CodexTimelineCompactionProjectionInput
	| CodexTimelineApprovalProjectionInput;

interface CodexTimelineTurnPresentation extends Readonly<Record<string, unknown>> {
	readonly summary: string;
	readonly outputs: Readonly<{
		included: boolean;
		truncated: boolean;
	}>;
}

type CodexTurnPlanUpdate = CodexServerNotificationParamsByMethod["turn/plan/updated"];

/** The latest plan Codex published for one turn, bounded by the owner that holds it. */
type CodexTimelinePlanInput = DeepReadonly<Pick<CodexTurnPlanUpdate, "explanation" | "plan">> &
	Readonly<Record<string, unknown>>;

/** Why a turn failed, bounded. */
interface CodexTimelineTurnErrorInput extends Readonly<Record<string, unknown>> {
	readonly message: string;
	readonly details: string | null;
}

interface CodexTimelineTurnProjectionInput extends Readonly<Record<string, unknown>> {
	/** Codex's own turn fields; `startedAt` and `completedAt` are Unix seconds. */
	readonly turn: DeepReadonly<
		Pick<SessionTurn, "id" | "status" | "startedAt" | "completedAt" | "durationMs">
	> &
		Readonly<Record<string, unknown>>;
	readonly items: readonly CodexTimelineItemProjectionInput[];
	readonly presentation: CodexTimelineTurnPresentation;
	readonly error: CodexTimelineTurnErrorInput | null;
	readonly plan: CodexTimelinePlanInput | null;
}

/** The thread's latest token usage, as Codex last reported it. */
type CodexTimelineUsageInput = DeepReadonly<
	CodexServerNotificationParamsByMethod["thread/tokenUsage/updated"]["tokenUsage"]
> &
	Readonly<Record<string, unknown>>;

/** Readonly owner view; TASK-143.01.10 owns the live producer. */
interface CodexTimelineProjectionInput extends Readonly<Record<string, unknown>> {
	readonly kind: "codex_timeline";
	readonly threadId: ThreadId;
	readonly turns: readonly CodexTimelineTurnProjectionInput[];
	readonly cursor: SessionResponsePayloads["thread/timeline/list"]["nextCursor"];
	readonly usage: CodexTimelineUsageInput | null;
}

interface CodexSemanticProjectionInput {
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

interface CodexCoordinatorProjectionInput {
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

interface CodexVoiceProjectionInput {
	readonly kind: "codex_voice";
	readonly mediaReady: boolean;
	readonly generation: { readonly browserSessionId: string } | null;
	/** Whether the live session is a recording's (TASK-304). */
	readonly recording: boolean;
	readonly coordinatorState: CodexCoordinatorProjectionInput["state"];
	readonly transcript: readonly Pick<
		RealtimeTranscriptRecord,
		"itemId" | "sequence" | "role" | "text" | "status"
	>[];
}

interface BrowserProjectionInput {
	readonly readiness: BrowserReadiness;
	readonly account: BrowserAccountProjectionInput;
	readonly login: BrowserLogin;
	readonly threadLink: ThreadLinkSnapshot;
	readonly timeline: CodexTimelineProjectionInput | null;
	/** The voice coordinator's own turns, read the way the timeline is (TASK-319). */
	readonly coordinatorTimeline?: CodexTimelineProjectionInput | null;
	/** Which coordinator turn delegated each workhorse turn the server has been told of. */
	readonly delegations?: ReadonlyMap<TurnId, TurnId>;
	readonly queue: CodexQueueProjectionInput;
	readonly settings: readonly CodexSettingsProjectionInput[];
	readonly approvals: readonly ApprovalOwnerView[];
	readonly dynamicApprovals: readonly BrowserDynamicApproval[];
	readonly semantic: CodexSemanticProjectionInput;
	readonly coordinator: CodexCoordinatorProjectionInput;
	readonly voice: CodexVoiceProjectionInput;
	readonly spokenApproval: SpokenApprovalSnapshot;
	readonly voiceContext?: BrowserVoiceContext | null;
	/** The tab session's workhorses and the one whose conversation it shows (ADR 0050). */
	readonly workhorses?: BrowserWorkhorses;
	readonly lease: BrowserCommandLease | null;
	readonly operation: BrowserOperationOutcome | null;
}

type BrowserProjectionResult =
	| { readonly tag: "projected"; readonly snapshot: BrowserSnapshot }
	| {
			readonly tag: "refused";
			readonly reason: "secret_input" | "invalid_projection";
			readonly message: string;
	  };

type BrowserOwnerProjection = Omit<BrowserProjectionInput, "threadLink" | "lease" | "operation">;

export {
	type BrowserProjectionModel,
	type CodexAccountProjectionInput,
	type BrowserAccountProjectionInput,
	type CodexSettingsProjectionInput,
	type CodexQueuedSubmissionProjectionInput,
	type CodexQueueProjectionInput,
	type CodexTimelineItemProjectionInput,
	type CodexTimelineTurnProjectionInput,
	type CodexTimelinePlanInput,
	type CodexTimelineUsageInput,
	type CodexTimelineFileChangeEntry,
	type CodexTimelineProjectionInput,
	type CodexSemanticProjectionInput,
	type CodexCoordinatorProjectionInput,
	type CodexVoiceProjectionInput,
	type BrowserProjectionInput,
	type BrowserProjectionResult,
	type BrowserOwnerProjection,
};
