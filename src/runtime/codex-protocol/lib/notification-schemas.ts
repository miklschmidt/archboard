import { z } from "zod";

import type { CodexServerNotificationParamsByMethod } from "../../../shared/codex-app-server-contract/index.js";
import {
	AuthModeSchema,
	PlanTypeSchema,
	RealtimeConversationVersionSchema,
	ThreadRealtimeAudioChunkSchema,
	ThreadRealtimeItemSchema,
	ThreadStatusSchema,
	ThreadGoalSchema,
	TurnErrorSchema,
	TurnPlanStepSchema,
} from "./core-schemas.js";
import {
	RateLimitSnapshotSchema,
	ThreadSettingsSchema,
	ThreadTokenUsageSchema,
} from "./config-schemas.js";
import { FileUpdateChangeSchema, ThreadItemSchema } from "./item-schemas.js";
import type { ServerNotificationMethod } from "./methods.js";
import {
	AccountLoginCompletedSchema,
	AppInfoSchema,
	AutoApprovalReviewCompletedSchema,
	AutoApprovalReviewStartedSchema,
	CommandExecOutputDeltaSchema,
	ExternalAgentConfigImportCompletedSchema,
	ExternalAgentConfigImportProgressSchema,
	FuzzyFileSearchResultSchema,
	HookRunSummarySchema,
	McpServerEventStreamNotificationSchema,
	McpServerStartupStatusUpdatedSchema,
	ProcessExitedSchema,
	ProcessOutputDeltaSchema,
	RawResponseCompletedSchema,
	RawResponseItemCompletedSchema,
	RemoteControlStatusChangedSchema,
	StrictReviewRequiredSchema,
	TextRangeSchema,
	ThreadRealtimeItemAddedSchema,
	TurnModerationMetadataSchema,
} from "./notification-support-schemas.js";
import { FiniteNumberSchema, JsonObjectSchema, RequestIdSchema, looseObject } from "./scalars.js";
import { ThreadSchema, TurnSchema } from "./thread-schemas.js";
import { codexIngressSchemas } from "./vendor-schema.js";

const ThreadIdSchema = looseObject({ threadId: z.string() });
const ThreadTurnSchema = looseObject({ threadId: z.string(), turn: TurnSchema });
const TextDeltaSchema = looseObject({
	threadId: z.string(),
	turnId: z.string(),
	itemId: z.string(),
	delta: z.string(),
});

const SERVER_NOTIFICATION_SCHEMAS = codexIngressSchemas<
	Pick<CodexServerNotificationParamsByMethod, ServerNotificationMethod>
>()({
	error: looseObject({
		error: TurnErrorSchema,
		willRetry: z.boolean(),
		threadId: z.string(),
		turnId: z.string(),
	}),
	"thread/started": looseObject({ thread: ThreadSchema }),
	"thread/status/changed": looseObject({ threadId: z.string(), status: ThreadStatusSchema }),
	"thread/archived": ThreadIdSchema,
	"thread/deleted": ThreadIdSchema,
	"thread/unarchived": ThreadIdSchema,
	"thread/closed": ThreadIdSchema,
	"thread/reverted": ThreadIdSchema,
	"skills/changed": z.strictObject({}),
	"thread/name/updated": looseObject({ threadId: z.string(), threadName: z.string().optional() }),
	"thread/goal/updated": looseObject({
		threadId: z.string(),
		turnId: z.string().nullable(),
		goal: ThreadGoalSchema,
	}),
	"thread/goal/cleared": ThreadIdSchema,
	"thread/queue/changed": ThreadIdSchema,
	"project/changed": looseObject({
		projectId: z.string(),
		changeType: z.enum(["created", "updated", "deleted"]),
	}),
	"thread/project/updated": looseObject({ threadId: z.string(), projectId: z.string().nullable() }),
	"thread/environment/connected": looseObject({ threadId: z.string(), environmentId: z.string() }),
	"thread/environment/disconnected": looseObject({
		threadId: z.string(),
		environmentId: z.string(),
	}),
	"thread/settings/updated": looseObject({
		threadId: z.string(),
		threadSettings: ThreadSettingsSchema,
	}),
	"thread/tokenUsage/updated": looseObject({
		threadId: z.string(),
		turnId: z.string(),
		tokenUsage: ThreadTokenUsageSchema,
	}),
	"turn/started": ThreadTurnSchema,
	"hook/started": looseObject({
		threadId: z.string(),
		turnId: z.string().nullable(),
		run: HookRunSummarySchema,
	}),
	"turn/completed": ThreadTurnSchema,
	"hook/completed": looseObject({
		threadId: z.string(),
		turnId: z.string().nullable(),
		run: HookRunSummarySchema,
	}),
	"turn/diff/updated": looseObject({ threadId: z.string(), turnId: z.string(), diff: z.string() }),
	"turn/plan/updated": looseObject({
		threadId: z.string(),
		turnId: z.string(),
		explanation: z.string().nullable(),
		plan: z.array(TurnPlanStepSchema),
	}),
	"item/started": looseObject({
		item: ThreadItemSchema,
		threadId: z.string(),
		turnId: z.string(),
		startedAtMs: FiniteNumberSchema,
	}),
	"item/autoApprovalReview/started": AutoApprovalReviewStartedSchema,
	"item/autoApprovalReview/completed": AutoApprovalReviewCompletedSchema,
	"autoApprovalReview/strictReviewRequired": StrictReviewRequiredSchema,
	"item/completed": looseObject({
		item: ThreadItemSchema,
		threadId: z.string(),
		turnId: z.string(),
		completedAtMs: FiniteNumberSchema,
	}),
	"rawResponseItem/completed": RawResponseItemCompletedSchema,
	"rawResponse/completed": RawResponseCompletedSchema,
	"item/agentMessage/delta": TextDeltaSchema,
	"item/plan/delta": TextDeltaSchema,
	"command/exec/outputDelta": CommandExecOutputDeltaSchema,
	"process/outputDelta": ProcessOutputDeltaSchema,
	"process/exited": ProcessExitedSchema,
	"item/commandExecution/outputDelta": TextDeltaSchema,
	"item/commandExecution/terminalInteraction": looseObject({
		threadId: z.string(),
		turnId: z.string(),
		itemId: z.string(),
		processId: z.string(),
		stdin: z.string(),
	}),
	"item/fileChange/outputDelta": TextDeltaSchema,
	"item/fileChange/patchUpdated": looseObject({
		threadId: z.string(),
		turnId: z.string(),
		itemId: z.string(),
		changes: z.array(FileUpdateChangeSchema),
	}),
	"serverRequest/resolved": looseObject({ threadId: z.string(), requestId: RequestIdSchema }),
	"item/mcpToolCall/progress": looseObject({
		threadId: z.string(),
		turnId: z.string(),
		itemId: z.string(),
		message: z.string(),
	}),
	"mcpServer/oauthLogin/completed": looseObject({
		name: z.string(),
		threadId: z.string().nullable(),
		success: z.boolean(),
		error: z.string().optional(),
	}),
	"mcpServer/startupStatus/updated": McpServerStartupStatusUpdatedSchema,
	"mcpServer/event/stream/notification": McpServerEventStreamNotificationSchema,
	"account/updated": looseObject({
		authMode: AuthModeSchema.nullable(),
		planType: PlanTypeSchema.nullable(),
	}),
	"account/rateLimits/updated": looseObject({ rateLimits: RateLimitSnapshotSchema }),
	"app/list/updated": looseObject({ data: z.array(AppInfoSchema) }),
	"remoteControl/status/changed": RemoteControlStatusChangedSchema,
	"externalAgentConfig/import/progress": ExternalAgentConfigImportProgressSchema,
	"externalAgentConfig/import/completed": ExternalAgentConfigImportCompletedSchema,
	"fs/changed": looseObject({ watchId: z.string(), changedPaths: z.array(z.string()) }),
	"item/reasoning/summaryTextDelta": looseObject({
		...TextDeltaSchema.shape,
		summaryIndex: FiniteNumberSchema,
	}),
	"item/reasoning/summaryPartAdded": looseObject({
		threadId: z.string(),
		turnId: z.string(),
		itemId: z.string(),
		summaryIndex: FiniteNumberSchema,
	}),
	"item/reasoning/textDelta": looseObject({
		...TextDeltaSchema.shape,
		contentIndex: FiniteNumberSchema,
	}),
	"thread/compacted": looseObject({ threadId: z.string(), turnId: z.string() }),
	"model/rerouted": looseObject({
		threadId: z.string(),
		turnId: z.string(),
		fromModel: z.string(),
		toModel: z.string(),
		reason: z.literal("highRiskCyberActivity"),
	}),
	"model/verification": looseObject({
		threadId: z.string(),
		turnId: z.string(),
		verifications: z.array(z.literal("trustedAccessForCyber")),
	}),
	"turn/moderationMetadata": TurnModerationMetadataSchema,
	"model/safetyBuffering/updated": looseObject({
		threadId: z.string(),
		turnId: z.string(),
		model: z.string(),
		useCases: z.array(z.string()),
		reasons: z.array(z.string()),
		showBufferingUi: z.boolean(),
		fasterModel: z.string().nullable(),
	}),
	warning: looseObject({ threadId: z.string().nullable(), message: z.string() }),
	guardianWarning: looseObject({ threadId: z.string(), message: z.string() }),
	deprecationNotice: looseObject({ summary: z.string(), details: z.string().nullable() }),
	configWarning: looseObject({
		summary: z.string(),
		details: z.string().nullable(),
		path: z.string().optional(),
		range: TextRangeSchema.optional(),
	}),
	"fuzzyFileSearch/sessionUpdated": looseObject({
		sessionId: z.string(),
		query: z.string(),
		files: z.array(FuzzyFileSearchResultSchema),
	}),
	"fuzzyFileSearch/sessionCompleted": looseObject({ sessionId: z.string() }),
	"thread/realtime/started": looseObject({
		threadId: z.string(),
		realtimeSessionId: z.string().nullable(),
		version: RealtimeConversationVersionSchema,
	}),
	"thread/realtime/itemAdded": ThreadRealtimeItemAddedSchema,
	"thread/realtime/item/started": looseObject({
		threadId: z.string(),
		item: ThreadRealtimeItemSchema,
	}),
	"thread/realtime/item/transcript/delta": looseObject({
		threadId: z.string(),
		itemId: z.string(),
		delta: z.string(),
	}),
	"thread/realtime/item/completed": looseObject({
		threadId: z.string(),
		item: ThreadRealtimeItemSchema,
	}),
	"thread/realtime/transcript/delta": looseObject({
		threadId: z.string(),
		/** Realtime transcript roles are an open generated string. */
		role: z.string(),
		delta: z.string(),
	}),
	"thread/realtime/transcript/done": looseObject({
		threadId: z.string(),
		/** Realtime transcript roles are an open generated string. */
		role: z.string(),
		text: z.string(),
	}),
	"thread/realtime/outputAudio/delta": looseObject({
		threadId: z.string(),
		audio: ThreadRealtimeAudioChunkSchema,
	}),
	"thread/realtime/sdp": looseObject({ threadId: z.string(), sdp: z.string() }),
	"thread/realtime/error": looseObject({ threadId: z.string(), message: z.string() }),
	"thread/realtime/closed": looseObject({ threadId: z.string(), reason: z.string().nullable() }),
	"windows/worldWritableWarning": looseObject({
		samplePaths: z.array(z.string()),
		extraCount: FiniteNumberSchema,
		failedScan: z.boolean(),
	}),
	"windowsSandbox/setupCompleted": looseObject({
		mode: z.enum(["elevated", "unelevated"]),
		success: z.boolean(),
		error: z.string().nullable(),
	}),
	"account/login/completed": AccountLoginCompletedSchema,
} as const);

export { SERVER_NOTIFICATION_SCHEMAS };

export const ServerNotificationEnvelopeSchema = z.strictObject({
	emittedAtMs: FiniteNumberSchema.optional(),
	method: z.string(),
	params: JsonObjectSchema,
});

export type ServerNotificationSchemas = typeof SERVER_NOTIFICATION_SCHEMAS;
