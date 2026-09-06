import { z } from "zod";

import {
	CODEX_PROTOCOL_VERSION,
	ThreadQueueAddParamsSchema,
	ThreadQueueDeleteParamsSchema,
	ThreadQueueListParamsSchema,
	ThreadQueueReorderParamsSchema,
	ThreadQueueStartParamsSchema,
	ThreadQueueUpdateParamsSchema,
	type ThreadQueueAddParams,
	type ThreadQueueDeleteParams,
	type ThreadQueueListParams,
	type ThreadQueueReorderParams,
	type ThreadQueueStartParams,
	type ThreadQueueUpdateParams,
} from "@/runtime/codex-protocol";
import {
	CODEX_THREAD_STATUS_TYPES,
	CodexThreadStatusTypeSchema,
} from "@/shared/codex-app-server-contract";
import type {
	JsonSchema,
	NamespaceName,
	CanonicalTool,
	CoordinatorToolName,
	WorkhorseToolName,
	VoiceToolName,
} from "@/runtime/codex-coordinator-tool-contract/lib/manifest";
import {
	ARCHBOARD_VOICE_NAMESPACE,
	ARCHBOARD_VOICE_TOOL_NAMES,
	ARCHBOARD_WORKHORSE_NAMESPACE,
	ARCHBOARD_WORKHORSE_TOOL_NAMES,
	canonicalTool,
} from "@/runtime/codex-coordinator-tool-contract/lib/manifest";

const COORDINATOR_ROLE = "coordinator" as const;
type CoordinatorRole = typeof COORDINATOR_ROLE;

const COORDINATOR_NAMESPACE_NAMES = Object.freeze([
	"archboard_workhorse",
	"archboard_voice",
] as const);

/**
 *
 */
function freezeDeep<T>(value: T): T {
	if (typeof value !== "object" || value === null || Object.isFrozen(value)) {
		return value;
	}
	for (const child of Object.values(value as Record<string, unknown>)) {
		freezeDeep(child);
	}
	Object.freeze(value);
	return value;
}

/** The reviewed identity that a coordinator turn must carry. */
const COORDINATOR_IDENTITY = freezeDeep({
	role: COORDINATOR_ROLE,
	model: "gpt-5.6-luna",
	effort: "medium",
	allowProviderModelFallback: false,
	config: { features: { realtime_conversation: true } },
	serviceName: "archboard",
	ephemeral: false,
	historyMode: "paginated",
	sessionStartSource: "startup",
	threadSource: "archboard",
	dynamicTools: [...COORDINATOR_NAMESPACE_NAMES],
	experimentalRawEvents: false,
} as const);

const CoordinatorIdentitySchema = z
	.object({
		role: z.literal(COORDINATOR_ROLE),
		model: z.literal("gpt-5.6-luna"),
		effort: z.literal("medium"),
		allowProviderModelFallback: z.literal(false),
		config: z
			.object({ features: z.object({ realtime_conversation: z.literal(true) }).strict() })
			.strict(),
		serviceName: z.literal("archboard"),
		ephemeral: z.literal(false),
		historyMode: z.literal("paginated"),
		sessionStartSource: z.literal("startup"),
		threadSource: z.literal("archboard"),
		dynamicTools: z.tuple([z.literal("archboard_workhorse"), z.literal("archboard_voice")]),
		experimentalRawEvents: z.literal(false),
	})
	.strict();

const DYNAMIC_TOOL_REFUSAL_REASONS = Object.freeze([
	"invalid_call",
	"not_ready",
	"not_loaded",
	"not_controllable",
	"system_error",
	"stale_child",
	"prior_epoch",
	"unknown_provenance",
	"approval_declined",
	"cycle",
	"busy",
	"expired",
	"unsupported",
] as const);
type DynamicToolRefusalReason = (typeof DYNAMIC_TOOL_REFUSAL_REASONS)[number];
const DynamicToolRefusalReasonSchema = z.enum(DYNAMIC_TOOL_REFUSAL_REASONS);

const OpaqueIdSchema = z.string().min(1).max(128);
const BoundedDiagnosticSchema = z.string().min(1).max(4_096);
const JsonObjectSchema = z.record(z.string(), z.json());

const DynamicToolOkEnvelopeSchema = z
	.object({
		tag: z.literal("ok"),
		operationId: OpaqueIdSchema,
		value: JsonObjectSchema,
	})
	.strict();
const DynamicToolRefusedEnvelopeSchema = z
	.object({
		tag: z.literal("refused"),
		reason: DynamicToolRefusalReasonSchema,
		message: BoundedDiagnosticSchema,
	})
	.strict();
const DynamicToolApprovalRequiredEnvelopeSchema = z
	.object({
		tag: z.literal("approval_required"),
		operationId: OpaqueIdSchema,
		summary: BoundedDiagnosticSchema,
	})
	.strict();
const DYNAMIC_TOOL_OUTCOME_UNKNOWN_MESSAGE =
	"The request may have taken effect. Inspect authoritative state before another mutation." as const;
const DynamicToolOutcomeUnknownEnvelopeSchema = z
	.object({
		tag: z.literal("outcome_unknown"),
		operationId: OpaqueIdSchema,
		message: z.literal(DYNAMIC_TOOL_OUTCOME_UNKNOWN_MESSAGE),
	})
	.strict();

const DynamicToolEnvelopeSchema = z.discriminatedUnion("tag", [
	DynamicToolOkEnvelopeSchema,
	DynamicToolRefusedEnvelopeSchema,
	DynamicToolApprovalRequiredEnvelopeSchema,
	DynamicToolOutcomeUnknownEnvelopeSchema,
]);

const DynamicToolEnvelopeTextSchema = z
	.string()
	.min(1)
	.max(16_384)
	.superRefine((text, context) => {
		let value: unknown;
		try {
			value = JSON.parse(text) as unknown;
		} catch {
			context.addIssue({ code: "custom", message: "tool response text must be JSON" });
			return;
		}
		const parsed = DynamicToolEnvelopeSchema.safeParse(value);
		if (!parsed.success || JSON.stringify(parsed.data) !== text) {
			context.addIssue({ code: "custom", message: "tool response text must be canonical JSON" });
		}
	});

const DynamicToolContentItemsSchema = z.tuple([
	z.object({ type: z.literal("inputText"), text: DynamicToolEnvelopeTextSchema }).strict(),
]);

/** Responses for calls that passed the coordinator's identity/manifest checks. */
const ValidDynamicToolResponseSchema = z
	.object({
		contentItems: DynamicToolContentItemsSchema,
		success: z.literal(true),
	})
	.strict();

/** Responses for calls rejected before a tool call could be established. */
const UnknownDynamicToolResponseSchema = z
	.object({
		contentItems: DynamicToolContentItemsSchema,
		success: z.literal(false),
	})
	.strict()
	.superRefine((response, context) => {
		const envelope = JSON.parse(response.contentItems[0].text) as { tag?: unknown };
		if (envelope.tag !== "refused") {
			context.addIssue({
				code: "custom",
				path: ["contentItems"],
				message: "unknown calls must return a refused envelope",
			});
		}
	});

const DynamicToolResponseSchema = ValidDynamicToolResponseSchema;
const DynamicToolCallResponseSchema = DynamicToolResponseSchema;

const InspectWorkhorseInputSchema = z.object({}).strict();
const DelegateToWorkhorseInputSchema = z
	.object({
		input: z.string().min(1).max(4_096),
		transcriptDelta: z.string().min(0).max(4_096),
	})
	.strict();

const QueueOperationSchema = z.enum(["list", "add", "update", "delete", "reorder", "start"]);
type QueueOperation = z.infer<typeof QueueOperationSchema>;

const QueueSubmissionIdSchema = z.string().min(1).max(128);
const QueuePromptSchema = z.string().min(1).max(16_384);
const QueueOrderSchema = z
	.array(QueueSubmissionIdSchema)
	.min(1)
	.max(100)
	.refine((values) => new Set(values).size === values.length, "submission ids must be unique");

const QueueListInputSchema = z.object({ operation: z.literal("list") }).strict();
const QueueAddInputSchema = z
	.object({ operation: z.literal("add"), prompt: QueuePromptSchema })
	.strict();
const QueueUpdateInputSchema = z
	.object({
		operation: z.literal("update"),
		submissionId: QueueSubmissionIdSchema,
		prompt: QueuePromptSchema,
	})
	.strict();
const QueueDeleteInputSchema = z
	.object({ operation: z.literal("delete"), submissionId: QueueSubmissionIdSchema })
	.strict();
const QueueReorderInputSchema = z
	.object({ operation: z.literal("reorder"), orderedSubmissionIds: QueueOrderSchema })
	.strict();
const QueueStartInputSchema = z
	.object({ operation: z.literal("start"), submissionId: QueueSubmissionIdSchema })
	.strict();

const ManageWorkhorseQueueInputSchema = z.discriminatedUnion("operation", [
	QueueListInputSchema,
	QueueAddInputSchema,
	QueueUpdateInputSchema,
	QueueDeleteInputSchema,
	QueueReorderInputSchema,
	QueueStartInputSchema,
]);

const SteerWorkhorseInputSchema = z.object({ input: z.string().min(1).max(4_096) }).strict();
const ResolveSpokenApprovalInputSchema = z
	.object({ verdict: z.enum(["accept", "decline"]) })
	.strict();

type InspectWorkhorseInput = z.infer<typeof InspectWorkhorseInputSchema>;
type DelegateToWorkhorseInput = z.infer<typeof DelegateToWorkhorseInputSchema>;
type ManageWorkhorseQueueInput = z.infer<typeof ManageWorkhorseQueueInputSchema>;
type SteerWorkhorseInput = z.infer<typeof SteerWorkhorseInputSchema>;
type ResolveSpokenApprovalInput = z.infer<typeof ResolveSpokenApprovalInputSchema>;

const WORKHORSE_TOOL_INPUT_SCHEMAS = Object.freeze({
	inspect_workhorse: InspectWorkhorseInputSchema,
	delegate_to_workhorse: DelegateToWorkhorseInputSchema,
	manage_workhorse_queue: ManageWorkhorseQueueInputSchema,
	steer_workhorse: SteerWorkhorseInputSchema,
} satisfies Record<WorkhorseToolName, z.ZodTypeAny>);

const VOICE_TOOL_INPUT_SCHEMAS = Object.freeze({
	resolve_spoken_approval: ResolveSpokenApprovalInputSchema,
} satisfies Record<VoiceToolName, z.ZodTypeAny>);

/**
 *
 */
function parseWorkhorseToolInput(toolName: WorkhorseToolName, input: unknown): unknown {
	return WORKHORSE_TOOL_INPUT_SCHEMAS[toolName].parse(input);
}

/**
 *
 */
function parseVoiceToolInput(toolName: VoiceToolName, input: unknown): unknown {
	return VOICE_TOOL_INPUT_SCHEMAS[toolName].parse(input);
}

/**
 *
 */
function parseCoordinatorToolInput(
	namespace: NamespaceName,
	toolName: CoordinatorToolName,
	input: unknown,
): unknown {
	if (namespace === "archboard_workhorse") {
		if (!ARCHBOARD_WORKHORSE_TOOL_NAMES.includes(toolName as WorkhorseToolName)) {
			throw new TypeError(`${namespace} does not declare ${toolName}.`);
		}
		return parseWorkhorseToolInput(toolName as WorkhorseToolName, input);
	}
	if (!ARCHBOARD_VOICE_TOOL_NAMES.includes(toolName as VoiceToolName)) {
		throw new TypeError(`${namespace} does not declare ${toolName}.`);
	}
	return parseVoiceToolInput(toolName as VoiceToolName, input);
}

const CODEX_QUEUE_PARAMETER_SCHEMAS = Object.freeze({
	list: ThreadQueueListParamsSchema,
	add: ThreadQueueAddParamsSchema,
	update: ThreadQueueUpdateParamsSchema,
	delete: ThreadQueueDeleteParamsSchema,
	reorder: ThreadQueueReorderParamsSchema,
	start: ThreadQueueStartParamsSchema,
});

interface QueueOperationContract {
	readonly operation: QueueOperation;
	readonly rpc: `thread/queue/${QueueOperation}`;
	readonly toolFields: readonly string[];
	readonly protocolFields: readonly string[];
	readonly protocolRequiredFields: readonly string[];
	readonly protocolOptionalNullableFields: readonly string[];
	readonly hostSuppliedFields: readonly string[];
	readonly fieldMapping: Readonly<Record<string, string>>;
}

const CODEX_QUEUE_OPERATION_CONTRACTS = freezeDeep([
	{
		operation: "list",
		rpc: "thread/queue/list",
		toolFields: ["operation"],
		protocolFields: ["threadId", "cursor", "limit"],
		protocolRequiredFields: ["threadId"],
		protocolOptionalNullableFields: ["cursor", "limit"],
		hostSuppliedFields: ["threadId", "cursor", "limit"],
		fieldMapping: {},
	},
	{
		operation: "add",
		rpc: "thread/queue/add",
		toolFields: ["operation", "prompt"],
		protocolFields: ["threadId", "input", "clientUserMessageId"],
		protocolRequiredFields: ["threadId", "input", "clientUserMessageId"],
		protocolOptionalNullableFields: [],
		hostSuppliedFields: ["threadId", "clientUserMessageId"],
		fieldMapping: { prompt: "input", clientUserMessageId: "host_minted" },
	},
	{
		operation: "update",
		rpc: "thread/queue/update",
		toolFields: ["operation", "submissionId", "prompt"],
		protocolFields: ["threadId", "queuedSubmissionId", "input"],
		protocolRequiredFields: ["threadId", "queuedSubmissionId", "input"],
		protocolOptionalNullableFields: [],
		hostSuppliedFields: ["threadId"],
		fieldMapping: { submissionId: "queuedSubmissionId", prompt: "input" },
	},
	{
		operation: "delete",
		rpc: "thread/queue/delete",
		toolFields: ["operation", "submissionId"],
		protocolFields: ["threadId", "queuedSubmissionId"],
		protocolRequiredFields: ["threadId", "queuedSubmissionId"],
		protocolOptionalNullableFields: [],
		hostSuppliedFields: ["threadId"],
		fieldMapping: { submissionId: "queuedSubmissionId" },
	},
	{
		operation: "reorder",
		rpc: "thread/queue/reorder",
		toolFields: ["operation", "orderedSubmissionIds"],
		protocolFields: ["threadId", "queuedSubmissionIds"],
		protocolRequiredFields: ["threadId", "queuedSubmissionIds"],
		protocolOptionalNullableFields: [],
		hostSuppliedFields: ["threadId"],
		fieldMapping: { orderedSubmissionIds: "queuedSubmissionIds" },
	},
	{
		operation: "start",
		rpc: "thread/queue/start",
		toolFields: ["operation", "submissionId"],
		protocolFields: ["threadId", "queuedSubmissionId"],
		protocolRequiredFields: ["threadId"],
		protocolOptionalNullableFields: ["queuedSubmissionId"],
		hostSuppliedFields: ["threadId"],
		fieldMapping: { submissionId: "queuedSubmissionId" },
	},
] satisfies readonly QueueOperationContract[]);

const CODEX_QUEUE_OPERATION_NAMES = Object.freeze(
	CODEX_QUEUE_OPERATION_CONTRACTS.map(({ operation }) => operation),
);

const CODEX_QUEUE_PROTOCOL = Object.freeze({
	protocol: "codex-app-server",
	version: CODEX_PROTOCOL_VERSION,
	operations: CODEX_QUEUE_OPERATION_NAMES,
});

const DeliverySchema = z.enum(["delivered", "not_delivered", "outcome_unknown"]);
const NullableOpaqueIdSchema = OpaqueIdSchema.nullable();
const QueuedSubmissionIdsSchema = z.array(QueueSubmissionIdSchema).max(100);

const InspectWorkhorseResultSchema = z
	.object({
		threadId: OpaqueIdSchema,
		status: CodexThreadStatusTypeSchema,
		activeTurnId: NullableOpaqueIdSchema,
		queuedSubmissionIds: QueuedSubmissionIdsSchema,
	})
	.strict();
const DelegateToWorkhorseResultSchema = z
	.object({
		mode: z.enum(["started", "queued"]),
		clientUserMessageId: OpaqueIdSchema,
		queuedSubmissionId: NullableOpaqueIdSchema,
		turnId: NullableOpaqueIdSchema,
	})
	.strict();
const ManageWorkhorseQueueResultSchema = z
	.object({
		operation: QueueOperationSchema,
		queuedSubmissionIds: QueuedSubmissionIdsSchema,
	})
	.strict();
const SteerWorkhorseResultSchema = z
	.object({
		turnId: OpaqueIdSchema,
		delivery: DeliverySchema,
	})
	.strict();
const ResolveSpokenApprovalResultSchema = z
	.object({
		verdict: z.enum(["accept", "decline"]),
		settlement: DeliverySchema,
	})
	.strict();

type InspectWorkhorseResult = z.infer<typeof InspectWorkhorseResultSchema>;
type DelegateToWorkhorseResult = z.infer<typeof DelegateToWorkhorseResultSchema>;
type ManageWorkhorseQueueResult = z.infer<typeof ManageWorkhorseQueueResultSchema>;
type SteerWorkhorseResult = z.infer<typeof SteerWorkhorseResultSchema>;
type ResolveSpokenApprovalResult = z.infer<typeof ResolveSpokenApprovalResultSchema>;

const COORDINATOR_TOOL_RESULT_SCHEMAS = Object.freeze({
	inspect_workhorse: InspectWorkhorseResultSchema,
	delegate_to_workhorse: DelegateToWorkhorseResultSchema,
	manage_workhorse_queue: ManageWorkhorseQueueResultSchema,
	steer_workhorse: SteerWorkhorseResultSchema,
	resolve_spoken_approval: ResolveSpokenApprovalResultSchema,
} satisfies Record<CoordinatorToolName, z.ZodTypeAny>);

/**
 *
 */
function parseCoordinatorToolResult(toolName: CoordinatorToolName, value: unknown): unknown {
	return COORDINATOR_TOOL_RESULT_SCHEMAS[toolName].parse(value);
}

const JsonStringSchema: JsonSchema = Object.freeze({ type: "string" });
const JsonNullableStringSchema: JsonSchema = freezeDeep({
	anyOf: [JsonStringSchema, Object.freeze({ type: "null" })],
});

/**
 *
 */
function strictResultObject(
	properties: Readonly<Record<string, JsonSchema>>,
	required: readonly string[],
): JsonSchema {
	return freezeDeep({
		type: "object",
		properties,
		required: [...required],
		additionalProperties: false,
	});
}

const ResultOperationSchema: JsonSchema = freezeDeep({
	type: "string",
	enum: [...QueueOperationSchema.options],
});
const ResultStatusSchema: JsonSchema = freezeDeep({
	type: "string",
	enum: [...CODEX_THREAD_STATUS_TYPES],
});
const ResultDeliverySchema: JsonSchema = freezeDeep({
	type: "string",
	enum: ["delivered", "not_delivered", "outcome_unknown"],
});
const ResultQueuedSubmissionIdsSchema: JsonSchema = freezeDeep({
	type: "array",
	items: JsonStringSchema,
	maxItems: 100,
});

const TOOL_SUCCESS_RESULT_SCHEMAS = freezeDeep({
	inspect_workhorse: strictResultObject(
		{
			threadId: JsonStringSchema,
			status: ResultStatusSchema,
			activeTurnId: JsonNullableStringSchema,
			queuedSubmissionIds: ResultQueuedSubmissionIdsSchema,
		},
		["threadId", "status", "activeTurnId", "queuedSubmissionIds"],
	),
	delegate_to_workhorse: strictResultObject(
		{
			mode: freezeDeep({ type: "string", enum: ["started", "queued"] }),
			clientUserMessageId: JsonStringSchema,
			queuedSubmissionId: JsonNullableStringSchema,
			turnId: JsonNullableStringSchema,
		},
		["mode", "clientUserMessageId", "queuedSubmissionId", "turnId"],
	),
	manage_workhorse_queue: strictResultObject(
		{ operation: ResultOperationSchema, queuedSubmissionIds: ResultQueuedSubmissionIdsSchema },
		["operation", "queuedSubmissionIds"],
	),
	steer_workhorse: strictResultObject(
		{ turnId: JsonStringSchema, delivery: ResultDeliverySchema },
		["turnId", "delivery"],
	),
	resolve_spoken_approval: strictResultObject(
		{
			verdict: freezeDeep({ type: "string", enum: ["accept", "decline"] }),
			settlement: ResultDeliverySchema,
		},
		["verdict", "settlement"],
	),
} satisfies Record<CoordinatorToolName, JsonSchema>);

type AuthorityTarget =
	| "host_bound_workhorse"
	| "host_created_workhorse_queue"
	| "host_proven_workhorse_turn"
	| "host_validated_spoken_approval";
const AuthorityTargetSchema = z.enum([
	"host_bound_workhorse",
	"host_created_workhorse_queue",
	"host_proven_workhorse_turn",
	"host_validated_spoken_approval",
]);

type RequiredLink =
	| "child"
	| "epoch"
	| "threadId"
	| "turnId"
	| "callId"
	| "namespace"
	| "tool"
	| "manifestHash"
	| "workhorseThreadId"
	| "queuedSubmissionIds"
	| "expectedTurnId"
	| "realtimeSessionId"
	| "classifierTurnId"
	| "finalUserItemId"
	| "finalUserSequence"
	| "effectFingerprint"
	| "expiry";
const RequiredLinkSchema = z.enum([
	"child",
	"epoch",
	"threadId",
	"turnId",
	"callId",
	"namespace",
	"tool",
	"manifestHash",
	"workhorseThreadId",
	"queuedSubmissionIds",
	"expectedTurnId",
	"realtimeSessionId",
	"classifierTurnId",
	"finalUserItemId",
	"finalUserSequence",
	"effectFingerprint",
	"expiry",
]);

const CoordinatorToolContractSchema = z
	.object({
		type: z.literal("function"),
		name: z.string().min(1),
		description: z.string().min(1),
		inputSchema: JsonObjectSchema,
		deferLoading: z.literal(false),
		namespace: z.enum(["archboard_workhorse", "archboard_voice"]),
		authorityTarget: AuthorityTargetSchema,
		callerRole: z.literal(COORDINATOR_ROLE),
		requiredLinks: z.array(RequiredLinkSchema),
		successResult: z.object({ tag: z.literal("ok"), valueSchema: JsonObjectSchema }).strict(),
		refusalErrors: z.array(DynamicToolRefusalReasonSchema),
	})
	.strict();

type SuccessResultContract = Readonly<{
	tag: "ok";
	valueSchema: JsonSchema;
}>;

interface CoordinatorToolContract extends CanonicalTool {
	readonly namespace: NamespaceName;
	readonly authorityTarget: AuthorityTarget;
	readonly callerRole: CoordinatorRole;
	readonly requiredLinks: readonly RequiredLink[];
	readonly successResult: SuccessResultContract;
	readonly refusalErrors: readonly DynamicToolRefusalReason[];
}

const TOOL_CORRELATION_LINKS = [
	"child",
	"epoch",
	"threadId",
	"turnId",
	"callId",
	"namespace",
	"tool",
	"manifestHash",
] as const satisfies readonly RequiredLink[];

const WORKHORSE_LINKS = [...TOOL_CORRELATION_LINKS, "workhorseThreadId"] as const;
const QUEUE_LINKS = [...WORKHORSE_LINKS, "queuedSubmissionIds"] as const;
const STEER_LINKS = [...WORKHORSE_LINKS, "expectedTurnId"] as const;
const VOICE_LINKS = [
	...TOOL_CORRELATION_LINKS,
	"realtimeSessionId",
	"classifierTurnId",
	"finalUserItemId",
	"finalUserSequence",
	"effectFingerprint",
	"expiry",
] as const;

const INSPECT_REFUSALS = [
	"invalid_call",
	"not_ready",
	"not_loaded",
	"system_error",
	"stale_child",
	"prior_epoch",
	"unknown_provenance",
] as const satisfies readonly DynamicToolRefusalReason[];
const MUTATING_WORKHORSE_REFUSALS = [
	"invalid_call",
	"not_ready",
	"not_loaded",
	"not_controllable",
	"system_error",
	"stale_child",
	"prior_epoch",
	"unknown_provenance",
	"approval_declined",
	"busy",
] as const satisfies readonly DynamicToolRefusalReason[];
const QUEUE_REFUSALS = [
	...MUTATING_WORKHORSE_REFUSALS,
	"expired",
	"unsupported",
] as const satisfies readonly DynamicToolRefusalReason[];
const VOICE_REFUSALS = [
	"invalid_call",
	"not_ready",
	"not_loaded",
	"system_error",
	"stale_child",
	"prior_epoch",
	"unknown_provenance",
	"approval_declined",
	"expired",
	"unsupported",
] as const satisfies readonly DynamicToolRefusalReason[];

/**
 *
 */
function contract(
	namespace: NamespaceName,
	toolName: CoordinatorToolName,
	metadata: Omit<
		CoordinatorToolContract,
		keyof CanonicalTool | "namespace" | "callerRole" | "successResult"
	> & {
		successResult: SuccessResultContract;
	},
): CoordinatorToolContract {
	return freezeDeep({
		...canonicalTool(namespace, toolName),
		namespace,
		callerRole: COORDINATOR_ROLE,
		...metadata,
	});
}

const ARCHBOARD_WORKHORSE_TOOL_CONTRACTS = freezeDeep([
	contract("archboard_workhorse", "inspect_workhorse", {
		authorityTarget: "host_bound_workhorse",
		requiredLinks: [...WORKHORSE_LINKS],
		successResult: { tag: "ok", valueSchema: TOOL_SUCCESS_RESULT_SCHEMAS.inspect_workhorse },
		refusalErrors: [...INSPECT_REFUSALS],
	}),
	contract("archboard_workhorse", "delegate_to_workhorse", {
		authorityTarget: "host_bound_workhorse",
		requiredLinks: [...WORKHORSE_LINKS],
		successResult: { tag: "ok", valueSchema: TOOL_SUCCESS_RESULT_SCHEMAS.delegate_to_workhorse },
		refusalErrors: [...MUTATING_WORKHORSE_REFUSALS],
	}),
	contract("archboard_workhorse", "manage_workhorse_queue", {
		authorityTarget: "host_created_workhorse_queue",
		requiredLinks: [...QUEUE_LINKS],
		successResult: { tag: "ok", valueSchema: TOOL_SUCCESS_RESULT_SCHEMAS.manage_workhorse_queue },
		refusalErrors: [...QUEUE_REFUSALS],
	}),
	contract("archboard_workhorse", "steer_workhorse", {
		authorityTarget: "host_proven_workhorse_turn",
		requiredLinks: [...STEER_LINKS],
		successResult: { tag: "ok", valueSchema: TOOL_SUCCESS_RESULT_SCHEMAS.steer_workhorse },
		refusalErrors: [...MUTATING_WORKHORSE_REFUSALS],
	}),
] satisfies readonly CoordinatorToolContract[]);

const ARCHBOARD_VOICE_TOOL_CONTRACTS = freezeDeep([
	contract("archboard_voice", "resolve_spoken_approval", {
		authorityTarget: "host_validated_spoken_approval",
		requiredLinks: [...VOICE_LINKS],
		successResult: { tag: "ok", valueSchema: TOOL_SUCCESS_RESULT_SCHEMAS.resolve_spoken_approval },
		refusalErrors: [...VOICE_REFUSALS],
	}),
] satisfies readonly CoordinatorToolContract[]);

const COORDINATOR_TOOL_CONTRACTS = freezeDeep([
	...ARCHBOARD_WORKHORSE_TOOL_CONTRACTS,
	...ARCHBOARD_VOICE_TOOL_CONTRACTS,
]);

const ARCHBOARD_WORKHORSE_CATALOGUE = freezeDeep({
	namespace: ARCHBOARD_WORKHORSE_NAMESPACE,
	tools: ARCHBOARD_WORKHORSE_TOOL_CONTRACTS,
});
const ARCHBOARD_VOICE_CATALOGUE = freezeDeep({
	namespace: ARCHBOARD_VOICE_NAMESPACE,
	tools: ARCHBOARD_VOICE_TOOL_CONTRACTS,
});
const COORDINATOR_TOOL_CATALOGUE = freezeDeep({
	identity: COORDINATOR_IDENTITY,
	namespaces: [ARCHBOARD_WORKHORSE_NAMESPACE, ARCHBOARD_VOICE_NAMESPACE],
	tools: COORDINATOR_TOOL_CONTRACTS,
});

export {
	COORDINATOR_ROLE,
	type CoordinatorRole,
	COORDINATOR_NAMESPACE_NAMES,
	COORDINATOR_IDENTITY,
	CoordinatorIdentitySchema,
	DYNAMIC_TOOL_REFUSAL_REASONS,
	type DynamicToolRefusalReason,
	DynamicToolRefusalReasonSchema,
	DynamicToolOkEnvelopeSchema,
	DynamicToolRefusedEnvelopeSchema,
	DynamicToolApprovalRequiredEnvelopeSchema,
	DYNAMIC_TOOL_OUTCOME_UNKNOWN_MESSAGE,
	DynamicToolOutcomeUnknownEnvelopeSchema,
	DynamicToolEnvelopeSchema,
	DynamicToolEnvelopeTextSchema,
	ValidDynamicToolResponseSchema,
	UnknownDynamicToolResponseSchema,
	DynamicToolResponseSchema,
	DynamicToolCallResponseSchema,
	InspectWorkhorseInputSchema,
	DelegateToWorkhorseInputSchema,
	QueueOperationSchema,
	type QueueOperation,
	QueueListInputSchema,
	QueueAddInputSchema,
	QueueUpdateInputSchema,
	QueueDeleteInputSchema,
	QueueReorderInputSchema,
	QueueStartInputSchema,
	ManageWorkhorseQueueInputSchema,
	SteerWorkhorseInputSchema,
	ResolveSpokenApprovalInputSchema,
	type InspectWorkhorseInput,
	type DelegateToWorkhorseInput,
	type ManageWorkhorseQueueInput,
	type SteerWorkhorseInput,
	type ResolveSpokenApprovalInput,
	WORKHORSE_TOOL_INPUT_SCHEMAS,
	VOICE_TOOL_INPUT_SCHEMAS,
	parseWorkhorseToolInput,
	parseVoiceToolInput,
	parseCoordinatorToolInput,
	ThreadQueueAddParamsSchema,
	ThreadQueueDeleteParamsSchema,
	ThreadQueueListParamsSchema,
	ThreadQueueReorderParamsSchema,
	ThreadQueueStartParamsSchema,
	ThreadQueueUpdateParamsSchema,
	type ThreadQueueAddParams,
	type ThreadQueueDeleteParams,
	type ThreadQueueListParams,
	type ThreadQueueReorderParams,
	type ThreadQueueStartParams,
	type ThreadQueueUpdateParams,
	CODEX_QUEUE_PARAMETER_SCHEMAS,
	type QueueOperationContract,
	CODEX_QUEUE_OPERATION_CONTRACTS,
	CODEX_QUEUE_OPERATION_NAMES,
	CODEX_QUEUE_PROTOCOL,
	InspectWorkhorseResultSchema,
	DelegateToWorkhorseResultSchema,
	ManageWorkhorseQueueResultSchema,
	SteerWorkhorseResultSchema,
	ResolveSpokenApprovalResultSchema,
	type InspectWorkhorseResult,
	type DelegateToWorkhorseResult,
	type ManageWorkhorseQueueResult,
	type SteerWorkhorseResult,
	type ResolveSpokenApprovalResult,
	COORDINATOR_TOOL_RESULT_SCHEMAS,
	parseCoordinatorToolResult,
	type AuthorityTarget,
	AuthorityTargetSchema,
	type RequiredLink,
	RequiredLinkSchema,
	CoordinatorToolContractSchema,
	type SuccessResultContract,
	type CoordinatorToolContract,
	ARCHBOARD_WORKHORSE_TOOL_CONTRACTS,
	ARCHBOARD_VOICE_TOOL_CONTRACTS,
	COORDINATOR_TOOL_CONTRACTS,
	ARCHBOARD_WORKHORSE_CATALOGUE,
	ARCHBOARD_VOICE_CATALOGUE,
	COORDINATOR_TOOL_CATALOGUE,
};
