import { z } from "zod";

import {
	AuthModeSchema,
	RealtimeConversationVersionSchema,
	RateLimitSnapshotSchema,
	ThreadRealtimeAudioChunkSchema,
	ThreadGoalSchema,
	ThreadSettingsSchema,
	ThreadStatusSchema,
	ThreadTokenUsageSchema,
	TurnErrorSchema,
	TurnPlanStepSchema,
	PlanTypeSchema,
} from "./core-schemas.js";
import { FileUpdateChangeSchema, ThreadItemSchema } from "./item-schemas.js";
import { SERVER_NOTIFICATION_METHODS, type ServerNotificationMethod } from "./methods.js";
import {
	FiniteNumberSchema,
	JsonValueSchema,
	ObjectSchema,
	RequestIdSchema,
	looseObject,
} from "./scalars.js";
import { ThreadSchema, TurnSchema } from "./thread-schemas.js";
import { ThreadRealtimeItemSchema } from "./core-schemas.js";

const ThreadIdSchema = looseObject({ threadId: z.string() });
const TurnItemDeltaSchema = looseObject({
	threadId: z.string(),
	turnId: z.string(),
	itemId: z.string(),
	delta: z.string(),
});

const ThreadTurnSchema = looseObject({ threadId: z.string(), turn: TurnSchema });

const SpecificNotificationSchemas = {
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
	"turn/completed": ThreadTurnSchema,
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
	"item/completed": looseObject({
		item: ThreadItemSchema,
		threadId: z.string(),
		turnId: z.string(),
		completedAtMs: FiniteNumberSchema,
	}),
	"item/agentMessage/delta": TurnItemDeltaSchema,
	"item/plan/delta": TurnItemDeltaSchema,
	"command/exec/outputDelta": ObjectSchema,
	"process/outputDelta": ObjectSchema,
	"process/exited": ObjectSchema,
	"item/commandExecution/outputDelta": TurnItemDeltaSchema,
	"item/commandExecution/terminalInteraction": looseObject({
		threadId: z.string(),
		turnId: z.string(),
		itemId: z.string(),
		processId: z.string(),
		stdin: z.string(),
	}),
	"item/fileChange/outputDelta": TurnItemDeltaSchema,
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
	"account/updated": looseObject({
		authMode: AuthModeSchema.nullable(),
		planType: PlanTypeSchema.nullable(),
	}),
	"account/rateLimits/updated": looseObject({ rateLimits: RateLimitSnapshotSchema }),
	"fs/changed": looseObject({ watchId: z.string(), changedPaths: z.array(z.string()) }),
	"item/reasoning/summaryTextDelta": looseObject({
		...TurnItemDeltaSchema.shape,
		summaryIndex: FiniteNumberSchema,
	}),
	"item/reasoning/summaryPartAdded": looseObject({
		threadId: z.string(),
		turnId: z.string(),
		itemId: z.string(),
		summaryIndex: FiniteNumberSchema,
	}),
	"item/reasoning/textDelta": looseObject({
		...TurnItemDeltaSchema.shape,
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
	"turn/moderationMetadata": looseObject({
		threadId: z.string(),
		turnId: z.string(),
		metadata: JsonValueSchema,
	}),
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
		range: ObjectSchema.optional(),
	}),
	"thread/realtime/started": looseObject({
		threadId: z.string(),
		realtimeSessionId: z.string().nullable(),
		version: RealtimeConversationVersionSchema,
	}),
	"thread/realtime/itemAdded": looseObject({ threadId: z.string(), item: JsonValueSchema }),
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
		role: z.string(),
		delta: z.string(),
	}),
	"thread/realtime/transcript/done": looseObject({
		threadId: z.string(),
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
	"account/login/completed": looseObject({
		success: z.boolean(),
		error: z.string().nullable(),
		loginId: z.string().nullable(),
		onboardingEntrypoint: JsonValueSchema.nullable(),
	}),
} as const;

const GenericNotificationSchema = ObjectSchema;
const GenericNotificationSchemas = Object.fromEntries(
	SERVER_NOTIFICATION_METHODS.map((method) => [method, GenericNotificationSchema]),
) as Record<ServerNotificationMethod, typeof GenericNotificationSchema>;

export const SERVER_NOTIFICATION_SCHEMAS = {
	...GenericNotificationSchemas,
	...SpecificNotificationSchemas,
} as typeof GenericNotificationSchemas & typeof SpecificNotificationSchemas;

export const ServerNotificationEnvelopeSchema = looseObject({
	emittedAtMs: FiniteNumberSchema.optional(),
	method: z.string(),
	params: ObjectSchema,
});

export type ServerNotificationSchemas = typeof SERVER_NOTIFICATION_SCHEMAS;
