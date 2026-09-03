import { z } from "zod";

import type { CodexClientRequestParamsByMethod } from "../../../shared/codex-app-server-contract/index.js";
import type {
	LoginId,
	QueuedSubmissionId,
	RealtimeSessionId,
	ThreadId,
	TurnId,
} from "../../../shared/codex-workbench-identity/index.js";
import {
	ApprovalsReviewerSchema,
	ConversationTextRoleSchema,
	ImageDetailSchema,
	PersonalitySchema,
	ReasoningEffortSchema,
	ReasoningSummarySchema,
	RealtimeConversationVersionSchema,
	RealtimeOutputModalitySchema,
	RealtimeVoiceSchema,
	SandboxModeSchema,
	ThreadHistoryModeSchema,
} from "./core-schemas.js";
import type { ClientRequestMethod, ClientRequestMethodWithoutParams } from "./methods.js";
import {
	AccountReadParamsSchema,
	CancelLoginAccountParamsSchema,
	ClientInfoSchema,
	LoginAccountParamsSchema,
} from "./request-schemas.js";
import {
	FiniteNumberSchema,
	JsonRecordSchema,
	JsonValueSchema,
	NonNegativeIntegerSchema,
} from "./scalars.js";
import { TurnItemsViewSchema } from "./thread-schemas.js";
import { codexIngressSchemas } from "./vendor-schema.js";

const NullablePageSchema = {
	cursor: z.string().nullable().optional(),
	limit: FiniteNumberSchema.nullable().optional(),
} as const;
const SortDirectionSchema = z.enum(["asc", "desc"]);
const ThreadSourceKindSchema = z.enum([
	"cli",
	"vscode",
	"exec",
	"appServer",
	"subAgent",
	"subAgentReview",
	"subAgentCompact",
	"subAgentThreadSpawn",
	"subAgentOther",
	"unknown",
]);
const ThreadSortKeySchema = z.enum(["created_at", "updated_at", "recency_at", "section_position"]);

const ClientMultiAgentModeSchema = z.union([
	z.enum(["explicitRequestOnly", "proactive"]),
	z.strictObject({ custom: z.string() }),
]);
const ClientAskForApprovalSchema = z.union([
	z.enum(["untrusted", "on-request", "never"]),
	z.strictObject({
		granular: z.strictObject({
			sandbox_approval: z.boolean(),
			rules: z.boolean(),
			skill_approval: z.boolean(),
			request_permissions: z.boolean(),
			mcp_elicitations: z.boolean(),
		}),
	}),
]);
const ClientSandboxPolicySchema = z.discriminatedUnion("type", [
	z.strictObject({ type: z.literal("dangerFullAccess") }),
	z.strictObject({ type: z.literal("readOnly"), networkAccess: z.boolean() }),
	z.strictObject({
		type: z.literal("externalSandbox"),
		networkAccess: z.enum(["restricted", "enabled"]),
	}),
	z.strictObject({
		type: z.literal("workspaceWrite"),
		writableRoots: z.array(z.string()),
		networkAccess: z.boolean(),
		excludeTmpdirEnvVar: z.boolean(),
		excludeSlashTmp: z.boolean(),
	}),
]);
const ClientTextElementSchema = z.strictObject({
	byteRange: z.strictObject({ start: NonNegativeIntegerSchema, end: NonNegativeIntegerSchema }),
	placeholder: z.string().nullable(),
});
const ClientUserInputSchema = z.discriminatedUnion("type", [
	z.strictObject({
		type: z.literal("text"),
		text: z.string(),
		text_elements: z.array(ClientTextElementSchema),
	}),
	z.strictObject({
		type: z.literal("image"),
		detail: ImageDetailSchema.optional(),
		url: z.string(),
	}),
	z.strictObject({
		type: z.literal("localImage"),
		detail: ImageDetailSchema.optional(),
		path: z.string(),
	}),
	z.strictObject({ type: z.literal("audio"), url: z.string() }),
	z.strictObject({ type: z.literal("localAudio"), path: z.string() }),
	z.strictObject({ type: z.literal("skill"), name: z.string(), path: z.string() }),
	z.strictObject({ type: z.literal("mention"), name: z.string(), path: z.string() }),
]);
const ClientFunctionCallOutputBodySchema = z.union([
	z.string(),
	z.array(
		z.discriminatedUnion("type", [
			z.strictObject({ type: z.literal("input_text"), text: z.string() }),
			z.strictObject({
				type: z.literal("input_image"),
				image_url: z.string(),
				detail: ImageDetailSchema.optional(),
			}),
			z.strictObject({ type: z.literal("input_audio"), audio_url: z.string() }),
			z.strictObject({
				type: z.literal("encrypted_content"),
				encrypted_content: z.string(),
			}),
		]),
	),
]);

const TurnEnvironmentParamsSchema = z.strictObject({
	environmentId: z.string(),
	cwd: z.string(),
	runtimeWorkspaceRoots: z.array(z.string()).nullable().optional(),
});
const AdditionalContextEntrySchema = z.strictObject({
	value: z.string(),
	kind: z.enum(["untrusted", "application"]),
});
const CollaborationModeSchema = z.strictObject({
	mode: z.enum(["plan", "default"]),
	settings: z.strictObject({
		model: z.string(),
		reasoning_effort: ReasoningEffortSchema.nullable(),
		developer_instructions: z.string().nullable(),
	}),
});
const DynamicToolFunctionSpecSchema = z.strictObject({
	type: z.literal("function"),
	name: z.string(),
	description: z.string(),
	inputSchema: JsonValueSchema,
	deferLoading: z.boolean().optional(),
});
const DynamicToolSpecSchema = z.discriminatedUnion("type", [
	DynamicToolFunctionSpecSchema,
	z.strictObject({
		type: z.literal("namespace"),
		name: z.string(),
		description: z.string(),
		tools: z.array(DynamicToolFunctionSpecSchema),
	}),
]);
const SelectedCapabilityRootSchema = z.strictObject({
	id: z.string(),
	location: z.strictObject({
		type: z.literal("environment"),
		environmentId: z.string(),
		path: z.string(),
	}),
});
const TurnToolOutputSchema = z.strictObject({
	name: z.string(),
	namespace: z.string().nullable(),
	output: ClientFunctionCallOutputBodySchema,
});
const ThreadRealtimeStartTransportSchema = z.discriminatedUnion("type", [
	z.strictObject({ type: z.literal("websocket") }),
	z.strictObject({ type: z.literal("webrtc"), sdp: z.string() }),
	z.strictObject({ type: z.literal("existingCall"), callId: z.string() }),
]);

const GeneratedInitializeCapabilitiesSchema = z.strictObject({
	experimentalApi: z.boolean(),
	requestAttestation: z.boolean(),
	mcpServerOpenaiFormElicitation: z.boolean().optional(),
	optOutNotificationMethods: z.array(z.string()).nullable().optional(),
	extensions: JsonRecordSchema.nullable().optional(),
});
const GeneratedInitializeParamsSchema = z.strictObject({
	clientInfo: ClientInfoSchema,
	capabilities: GeneratedInitializeCapabilitiesSchema.nullable(),
});

const ConfigReadParamsSchema = z.strictObject({
	includeLayers: z.boolean().optional(),
	cwd: z.string().nullable().optional(),
});
const ModelListParamsSchema = z.strictObject({
	...NullablePageSchema,
	includeHidden: z.boolean().nullable().optional(),
});
const ThreadStartParamsSchema = z.strictObject({
	model: z.string().nullable().optional(),
	modelProvider: z.string().nullable().optional(),
	allowProviderModelFallback: z.boolean().optional(),
	serviceTier: z.string().nullable().optional(),
	cwd: z.string().nullable().optional(),
	runtimeWorkspaceRoots: z.array(z.string()).nullable().optional(),
	approvalPolicy: ClientAskForApprovalSchema.nullable().optional(),
	approvalsReviewer: ApprovalsReviewerSchema.nullable().optional(),
	sandbox: SandboxModeSchema.nullable().optional(),
	permissions: z.string().nullable().optional(),
	config: JsonRecordSchema.nullable().optional(),
	serviceName: z.string().nullable().optional(),
	baseInstructions: z.string().nullable().optional(),
	developerInstructions: z.string().nullable().optional(),
	personality: PersonalitySchema.nullable().optional(),
	multiAgentMode: ClientMultiAgentModeSchema.nullable().optional(),
	ephemeral: z.boolean().nullable().optional(),
	historyMode: ThreadHistoryModeSchema.nullable().optional(),
	sessionStartSource: z.enum(["startup", "clear"]).nullable().optional(),
	threadSource: z.string().nullable().optional(),
	projectId: z.string().nullable().optional(),
	environments: z.array(TurnEnvironmentParamsSchema).nullable().optional(),
	dynamicTools: z.array(DynamicToolSpecSchema).nullable().optional(),
	selectedCapabilityRoots: z.array(SelectedCapabilityRootSchema).nullable().optional(),
	mockExperimentalField: z.string().nullable().optional(),
	experimentalRawEvents: z.boolean().optional(),
});
const ThreadForkParamsSchema = z.strictObject({
	threadId: z.string(),
	lastTurnId: z.string().nullable().optional(),
	beforeTurnId: z.string().nullable().optional(),
	path: z.string().nullable().optional(),
	model: z.string().nullable().optional(),
	modelProvider: z.string().nullable().optional(),
	serviceTier: z.string().nullable().optional(),
	cwd: z.string().nullable().optional(),
	runtimeWorkspaceRoots: z.array(z.string()).nullable().optional(),
	approvalPolicy: ClientAskForApprovalSchema.nullable().optional(),
	approvalsReviewer: ApprovalsReviewerSchema.nullable().optional(),
	sandbox: SandboxModeSchema.nullable().optional(),
	permissions: z.string().nullable().optional(),
	config: JsonRecordSchema.nullable().optional(),
	baseInstructions: z.string().nullable().optional(),
	developerInstructions: z.string().nullable().optional(),
	ephemeral: z.boolean().optional(),
	threadSource: z.string().nullable().optional(),
	excludeTurns: z.boolean().optional(),
	deferGoalContinuation: z.boolean().optional(),
});
const ThreadListParamsSchema = z.strictObject({
	...NullablePageSchema,
	sortKey: ThreadSortKeySchema.nullable().optional(),
	sortDirection: SortDirectionSchema.nullable().optional(),
	modelProviders: z.array(z.string()).nullable().optional(),
	sourceKinds: z.array(ThreadSourceKindSchema).nullable().optional(),
	archived: z.boolean().nullable().optional(),
	sectionId: z.string().nullable().optional(),
	projectId: z.string().nullable().optional(),
	cwd: z
		.union([z.string(), z.array(z.string())])
		.nullable()
		.optional(),
	useStateDbOnly: z.boolean().optional(),
	searchTerm: z.string().nullable().optional(),
	parentThreadId: z.string().nullable().optional(),
	ancestorThreadId: z.string().nullable().optional(),
});
const ThreadLoadedListParamsSchema = z.strictObject(NullablePageSchema);
const ThreadReadParamsSchema = z.strictObject({
	threadId: z.string(),
	includeTurns: z.boolean().optional(),
});
const ThreadTurnsListParamsSchema = z.strictObject({
	threadId: z.string(),
	...NullablePageSchema,
	sortDirection: SortDirectionSchema.nullable().optional(),
	itemsView: TurnItemsViewSchema.nullable().optional(),
});
const ThreadItemsListParamsSchema = z.strictObject({
	threadId: z.string(),
	turnId: z.string().nullable().optional(),
	...NullablePageSchema,
	sortDirection: SortDirectionSchema.nullable().optional(),
});
const ThreadDeleteParamsSchema = z.strictObject({ threadId: z.string() });
const ThreadSettingsUpdateParamsSchema = z.strictObject({
	threadId: z.string(),
	cwd: z.string().nullable().optional(),
	approvalPolicy: ClientAskForApprovalSchema.nullable().optional(),
	approvalsReviewer: ApprovalsReviewerSchema.nullable().optional(),
	sandboxPolicy: ClientSandboxPolicySchema.nullable().optional(),
	permissions: z.string().nullable().optional(),
	model: z.string().nullable().optional(),
	serviceTier: z.string().nullable().optional(),
	effort: ReasoningEffortSchema.nullable().optional(),
	summary: ReasoningSummarySchema.nullable().optional(),
	collaborationMode: CollaborationModeSchema.nullable().optional(),
	multiAgentMode: ClientMultiAgentModeSchema.nullable().optional(),
	personality: PersonalitySchema.nullable().optional(),
});
const TurnStartParamsSchema = z.strictObject({
	threadId: z.string(),
	clientUserMessageId: z.string().nullable().optional(),
	input: z.array(ClientUserInputSchema),
	turnTrigger: z.string().nullable().optional(),
	toolOutput: TurnToolOutputSchema.nullable().optional(),
	responsesapiClientMetadata: z.record(z.string(), z.string()).nullable().optional(),
	additionalContext: z.record(z.string(), AdditionalContextEntrySchema).nullable().optional(),
	environments: z.array(TurnEnvironmentParamsSchema).nullable().optional(),
	cwd: z.string().nullable().optional(),
	runtimeWorkspaceRoots: z.array(z.string()).nullable().optional(),
	approvalPolicy: ClientAskForApprovalSchema.nullable().optional(),
	approvalsReviewer: ApprovalsReviewerSchema.nullable().optional(),
	sandboxPolicy: ClientSandboxPolicySchema.nullable().optional(),
	permissions: z.string().nullable().optional(),
	model: z.string().nullable().optional(),
	serviceTier: z.string().nullable().optional(),
	serviceTierForTurn: z.string().nullable().optional(),
	effort: ReasoningEffortSchema.nullable().optional(),
	summary: ReasoningSummarySchema.nullable().optional(),
	personality: PersonalitySchema.nullable().optional(),
	outputSchema: JsonValueSchema.nullable().optional(),
	collaborationMode: CollaborationModeSchema.nullable().optional(),
	multiAgentMode: ClientMultiAgentModeSchema.nullable().optional(),
	cyberAccessProgram: z.enum(["standard", "daybreakBlue", "daybreakRed"]).nullable().optional(),
});
const TurnSteerParamsSchema = z.strictObject({
	threadId: z.string(),
	clientUserMessageId: z.string().nullable().optional(),
	input: z.array(ClientUserInputSchema),
	responsesapiClientMetadata: z.record(z.string(), z.string()).nullable().optional(),
	additionalContext: z.record(z.string(), AdditionalContextEntrySchema).nullable().optional(),
	expectedTurnId: z.string(),
});
const TurnInterruptParamsSchema = z.strictObject({ threadId: z.string(), turnId: z.string() });
export const ThreadQueueAddParamsSchema = z.strictObject({
	threadId: z.string(),
	input: z.array(ClientUserInputSchema),
	clientUserMessageId: z.string(),
});
export const ThreadQueueListParamsSchema = z.strictObject({
	threadId: z.string(),
	...NullablePageSchema,
});
export const ThreadQueueUpdateParamsSchema = z.strictObject({
	threadId: z.string(),
	queuedSubmissionId: z.string(),
	input: z.array(ClientUserInputSchema),
});
export const ThreadQueueDeleteParamsSchema = z.strictObject({
	threadId: z.string(),
	queuedSubmissionId: z.string(),
});
export const ThreadQueueReorderParamsSchema = z.strictObject({
	threadId: z.string(),
	queuedSubmissionIds: z.array(z.string()),
});
export const ThreadQueueStartParamsSchema = z.strictObject({
	threadId: z.string(),
	queuedSubmissionId: z.string().nullable().optional(),
});
const ThreadInjectItemsParamsSchema = z.strictObject({
	threadId: z.string(),
	items: z.array(JsonValueSchema),
});
const ThreadRealtimeStartParamsSchema = z.strictObject({
	threadId: z.string(),
	clientManagedHandoffs: z.boolean().nullable().optional(),
	delegationAckFiller: z.boolean().nullable().optional(),
	flushTranscriptTailOnSessionEnd: z.boolean().nullable().optional(),
	codexResponsesAsItems: z.boolean().nullable().optional(),
	codexResponseItemPrefix: z.string().nullable().optional(),
	codexResponseHandoffMode: z.enum(["thinking", "commentary", "bemTags"]).nullable().optional(),
	codexResponseHandoffChannelPrefixes: z
		.record(z.string(), z.array(z.string()))
		.nullable()
		.optional(),
	model: z.string().nullable().optional(),
	outputModality: RealtimeOutputModalitySchema,
	includeStartupContext: z.boolean().nullable().optional(),
	initialItems: z
		.array(z.strictObject({ role: ConversationTextRoleSchema, text: z.string() }))
		.nullable()
		.optional(),
	realtimeStartInstructions: z.string().nullable().optional(),
	realtimeEndInstructions: z.string().nullable().optional(),
	prompt: z.string().nullable().optional(),
	realtimeSessionId: z.string().nullable().optional(),
	transport: ThreadRealtimeStartTransportSchema.nullable().optional(),
	version: RealtimeConversationVersionSchema.nullable().optional(),
	voice: RealtimeVoiceSchema.nullable().optional(),
});
const ThreadRealtimeAppendTextParamsSchema = z.strictObject({
	threadId: z.string(),
	text: z.string(),
	role: ConversationTextRoleSchema,
});
const ThreadRealtimeAppendSpeechParamsSchema = z.strictObject({
	threadId: z.string(),
	text: z.string(),
});
const ThreadRealtimeStopParamsSchema = z.strictObject({ threadId: z.string() });
const ThreadTimelineListParamsSchema = z.strictObject({
	threadId: z.string(),
	...NullablePageSchema,
});

/** Wire decoder schemas for every generated request the public session can emit. */
export const CLIENT_REQUEST_PARAM_SCHEMAS = codexIngressSchemas<
	Pick<CodexClientRequestParamsByMethod, ClientRequestMethod>
>()({
	initialize: GeneratedInitializeParamsSchema,
	"config/read": ConfigReadParamsSchema,
	"configRequirements/read": z.undefined(),
	"account/read": AccountReadParamsSchema,
	"account/login/start": LoginAccountParamsSchema,
	"account/login/cancel": CancelLoginAccountParamsSchema,
	"account/logout": z.undefined(),
	"model/list": ModelListParamsSchema,
	"thread/start": ThreadStartParamsSchema,
	"thread/fork": ThreadForkParamsSchema,
	"thread/list": ThreadListParamsSchema,
	"thread/loaded/list": ThreadLoadedListParamsSchema,
	"thread/read": ThreadReadParamsSchema,
	"thread/turns/list": ThreadTurnsListParamsSchema,
	"thread/items/list": ThreadItemsListParamsSchema,
	"thread/delete": ThreadDeleteParamsSchema,
	"thread/settings/update": ThreadSettingsUpdateParamsSchema,
	"turn/start": TurnStartParamsSchema,
	"turn/steer": TurnSteerParamsSchema,
	"turn/interrupt": TurnInterruptParamsSchema,
	"thread/queue/add": ThreadQueueAddParamsSchema,
	"thread/queue/list": ThreadQueueListParamsSchema,
	"thread/queue/update": ThreadQueueUpdateParamsSchema,
	"thread/queue/delete": ThreadQueueDeleteParamsSchema,
	"thread/queue/reorder": ThreadQueueReorderParamsSchema,
	"thread/queue/start": ThreadQueueStartParamsSchema,
	"thread/inject_items": ThreadInjectItemsParamsSchema,
	"thread/realtime/start": ThreadRealtimeStartParamsSchema,
	"thread/realtime/appendText": ThreadRealtimeAppendTextParamsSchema,
	"thread/realtime/appendSpeech": ThreadRealtimeAppendSpeechParamsSchema,
	"thread/realtime/stop": ThreadRealtimeStopParamsSchema,
	"thread/timeline/list": ThreadTimelineListParamsSchema,
} as const);

export type ClientRequestPayloads = {
	[Method in ClientRequestMethod]: z.infer<(typeof CLIENT_REQUEST_PARAM_SCHEMAS)[Method]>;
};
export type ClientRequestParams<Method extends ClientRequestMethod> =
	Method extends ClientRequestMethodWithoutParams ? undefined : ClientRequestPayloads[Method];
export type ClientRequestInputPayloads = {
	[Method in ClientRequestMethod]: z.input<(typeof CLIENT_REQUEST_PARAM_SCHEMAS)[Method]>;
};
export type ClientRequestInput<Method extends ClientRequestMethod> =
	Method extends ClientRequestMethodWithoutParams ? undefined : ClientRequestInputPayloads[Method];

export type ThreadQueueAddParams = z.infer<typeof ThreadQueueAddParamsSchema>;
export type ThreadQueueListParams = z.infer<typeof ThreadQueueListParamsSchema>;
export type ThreadQueueUpdateParams = z.infer<typeof ThreadQueueUpdateParamsSchema>;
export type ThreadQueueDeleteParams = z.infer<typeof ThreadQueueDeleteParamsSchema>;
export type ThreadQueueReorderParams = z.infer<typeof ThreadQueueReorderParamsSchema>;
export type ThreadQueueStartParams = z.infer<typeof ThreadQueueStartParamsSchema>;

type PreserveNullish<Value, Identity> = Identity | Extract<Value, null | undefined>;
type BrandIdentityField<Key, Value> = Key extends "threadId" | "parentThreadId" | "ancestorThreadId"
	? PreserveNullish<Value, ThreadId>
	: Key extends "turnId" | "lastTurnId" | "beforeTurnId" | "expectedTurnId"
		? PreserveNullish<Value, TurnId>
		: Key extends "queuedSubmissionId"
			? PreserveNullish<Value, QueuedSubmissionId>
			: Key extends "queuedSubmissionIds"
				? PreserveNullish<Value, readonly QueuedSubmissionId[]>
				: Key extends "loginId"
					? PreserveNullish<Value, LoginId>
					: Key extends "realtimeSessionId"
						? PreserveNullish<Value, RealtimeSessionId>
						: Value;
type BrandedRequestParams<Value> = Value extends undefined
	? undefined
	: Readonly<{
			[Key in keyof Value]: BrandIdentityField<Key, Value[Key]>;
		}>;

type GeneratedTurnSteerParams = BrandedRequestParams<ClientRequestPayloads["turn/steer"]>;
export type CodexSessionTurnSteerParams = Readonly<{
	threadId: GeneratedTurnSteerParams["threadId"];
	clientUserMessageId: NonNullable<GeneratedTurnSteerParams["clientUserMessageId"]>;
	input: GeneratedTurnSteerParams["input"];
	additionalContext: NonNullable<GeneratedTurnSteerParams["additionalContext"]>;
	expectedTurnId: GeneratedTurnSteerParams["expectedTurnId"];
}>;

export type CodexSessionRequestPayloads = {
	[Method in ClientRequestMethod]: Method extends "turn/steer"
		? CodexSessionTurnSteerParams
		: BrandedRequestParams<ClientRequestPayloads[Method]>;
};
export type CodexSessionRequestParams<Method extends ClientRequestMethod> =
	CodexSessionRequestPayloads[Method];
