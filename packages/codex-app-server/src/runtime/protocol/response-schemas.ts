import { z } from "zod";

import type { CodexResponseByMethod } from "@archboard/codex-app-server/app-server-contract";
import {
	ConfigLayerMetadataSchema,
	ConfigLayerSchema,
	ConfigRequirementsSchema,
	ConfigSchema,
	ModelSchema,
} from "#runtime/schemas/config-schemas.ts";
import {
	AccountSchema,
	ActivePermissionProfileSchema,
	ApprovalsReviewerSchema,
	AskForApprovalSchema,
	MultiAgentModeSchema,
	ReasoningEffortSchema,
	SandboxPolicySchema,
} from "#runtime/schemas/core-schemas.ts";
import {
	LoadedThreadPageSchema,
	QueueStartSchema,
	ThreadItemPageSchema,
	ThreadPageSchema,
	ThreadReadSchema,
	ThreadRealtimeTimelineStateSchema,
	ThreadTurnPageSchema,
	ThreadSchema,
	TurnStartSchema,
} from "#runtime/schemas/thread-schemas.ts";
import { QueuedSubmissionSchema } from "#runtime/schemas/item-schemas.ts";
import type { ResponseMethod } from "#runtime/protocol/protocol-methods.ts";
import { FiniteNumberSchema, looseObject } from "#runtime/schemas/scalars.ts";
import { codexIngressSchemas } from "#runtime/schemas/vendor-schema.ts";

const InitializeResponseSchema = looseObject({
	userAgent: z.string(),
	codexHome: z.string(),
	platformFamily: z.string(),
	platformOs: z.string(),
});

const ConfigReadResponseSchema = looseObject({
	config: ConfigSchema,
	/** Config keys are generated map keys supplied by the server. */
	origins: z.record(z.string(), ConfigLayerMetadataSchema),
	layers: z.array(ConfigLayerSchema).nullable(),
});

const ConfigRequirementsReadResponseSchema = looseObject({
	requirements: ConfigRequirementsSchema.nullable(),
});

const WorkspaceRoutingSchema = looseObject({
	chatgptAccountId: z.string(),
	backendOrigin: z.string(),
	accountRoutingOverride: z.enum(["NO_CONSTRAINT", "us", "us_cr"]),
});

const AccountReadResponseSchema = looseObject({
	account: AccountSchema.nullable(),
	requiresOpenaiAuth: z.boolean(),
	workspaceRouting: WorkspaceRoutingSchema.nullable(),
});

const LoginAccountResponseSchema = z.discriminatedUnion("type", [
	looseObject({ type: z.literal("apiKey") }),
	looseObject({ type: z.literal("chatgpt"), loginId: z.string(), authUrl: z.string() }),
	looseObject({
		type: z.literal("chatgptDeviceCode"),
		loginId: z.string(),
		verificationUrl: z.string(),
		userCode: z.string(),
	}),
	looseObject({ type: z.literal("chatgptAuthTokens") }),
	looseObject({ type: z.literal("amazonBedrock") }),
]);

const CancelLoginAccountResponseSchema = looseObject({
	status: z.enum(["canceled", "notFound"]),
});

const ModelListResponseSchema = looseObject({
	data: z.array(ModelSchema),
	nextCursor: z.string().nullable(),
});

const ThreadStartResponseShape = {
	thread: ThreadSchema,
	model: z.string(),
	modelProvider: z.string(),
	serviceTier: z.string().nullable(),
	cwd: z.string(),
	runtimeWorkspaceRoots: z.array(z.string()),
	instructionSources: z.array(z.string()),
	approvalPolicy: AskForApprovalSchema,
	approvalsReviewer: ApprovalsReviewerSchema,
	sandbox: SandboxPolicySchema,
	activePermissionProfile: ActivePermissionProfileSchema.nullable(),
	reasoningEffort: ReasoningEffortSchema.nullable(),
	multiAgentMode: MultiAgentModeSchema,
	disabledPluginIds: z.array(z.string()),
};

const ThreadStartResponseSchema = looseObject(ThreadStartResponseShape);
const ThreadForkResponseSchema = looseObject(ThreadStartResponseShape);

const TurnSteerResponseSchema = looseObject({ turnId: z.string() });

const ThreadQueueAddResponseSchema = looseObject({
	queuedSubmission: QueuedSubmissionSchema,
});
const ThreadQueueListResponseSchema = looseObject({
	data: z.array(QueuedSubmissionSchema),
	nextCursor: z.string().nullable(),
});
const ThreadQueueUpdateResponseSchema = looseObject({
	queuedSubmission: QueuedSubmissionSchema,
});
const ThreadQueueDeleteResponseSchema = looseObject({ deleted: z.boolean() });

const ThreadTimelineListResponseSchema = ThreadRealtimeTimelineStateSchema;
const CurrentTimeReadResponseSchema = looseObject({ currentTimeAt: FiniteNumberSchema });

const EmptyResponseSchema = z.strictObject({});
const ThreadUnsubscribeResponseSchema = looseObject({
	status: z.enum(["notLoaded", "notSubscribed", "unsubscribed"]),
});

/** Every response schema used by the public session port. */
const RESPONSE_SCHEMAS = codexIngressSchemas<Pick<CodexResponseByMethod, ResponseMethod>>()({
	initialize: InitializeResponseSchema,
	"config/read": ConfigReadResponseSchema,
	"configRequirements/read": ConfigRequirementsReadResponseSchema,
	"account/read": AccountReadResponseSchema,
	"account/login/start": LoginAccountResponseSchema,
	"account/login/cancel": CancelLoginAccountResponseSchema,
	"account/logout": EmptyResponseSchema,
	"model/list": ModelListResponseSchema,
	"thread/start": ThreadStartResponseSchema,
	"thread/fork": ThreadForkResponseSchema,
	"thread/list": ThreadPageSchema,
	"thread/loaded/list": LoadedThreadPageSchema,
	"thread/read": ThreadReadSchema,
	"thread/turns/list": ThreadTurnPageSchema,
	"thread/items/list": ThreadItemPageSchema,
	"thread/delete": EmptyResponseSchema,
	"thread/unsubscribe": ThreadUnsubscribeResponseSchema,
	"thread/settings/update": EmptyResponseSchema,
	"turn/start": TurnStartSchema,
	"turn/steer": TurnSteerResponseSchema,
	"turn/interrupt": EmptyResponseSchema,
	"thread/queue/add": ThreadQueueAddResponseSchema,
	"thread/queue/list": ThreadQueueListResponseSchema,
	"thread/queue/update": ThreadQueueUpdateResponseSchema,
	"thread/queue/delete": ThreadQueueDeleteResponseSchema,
	"thread/queue/reorder": EmptyResponseSchema,
	"thread/queue/start": QueueStartSchema,
	"thread/inject_items": EmptyResponseSchema,
	"thread/realtime/start": EmptyResponseSchema,
	"thread/realtime/appendText": EmptyResponseSchema,
	"thread/realtime/appendSpeech": EmptyResponseSchema,
	"thread/realtime/stop": EmptyResponseSchema,
	"thread/timeline/list": ThreadTimelineListResponseSchema,
	"currentTime/read": CurrentTimeReadResponseSchema,
} as const);

type ResponseSchemas = typeof RESPONSE_SCHEMAS;

export {
	InitializeResponseSchema,
	ConfigReadResponseSchema,
	ConfigRequirementsReadResponseSchema,
	AccountReadResponseSchema,
	LoginAccountResponseSchema,
	CancelLoginAccountResponseSchema,
	ModelListResponseSchema,
	ThreadStartResponseSchema,
	ThreadForkResponseSchema,
	TurnSteerResponseSchema,
	ThreadQueueAddResponseSchema,
	ThreadQueueListResponseSchema,
	ThreadQueueUpdateResponseSchema,
	ThreadQueueDeleteResponseSchema,
	ThreadTimelineListResponseSchema,
	CurrentTimeReadResponseSchema,
	EmptyResponseSchema,
	RESPONSE_SCHEMAS,
	type ResponseSchemas,
};
