import { z } from "zod";

import type {
	JsonSchema,
	NamespaceName,
	CanonicalTool,
	CoordinatorToolName,
} from "@/runtime/codex-coordinator-tool-contract/lib/manifest";
import {
	ARCHBOARD_VOICE_NAMESPACE,
	ARCHBOARD_WORKHORSE_NAMESPACE,
	canonicalTool,
	deepFreeze,
} from "@/runtime/codex-coordinator-tool-contract/lib/manifest";
import {
	DynamicToolRefusalReasonSchema,
	JsonObjectSchema,
	type DynamicToolRefusalReason,
} from "@/runtime/codex-coordinator-tool-contract/lib/dynamic-tool-envelopes";
import { TOOL_SUCCESS_RESULT_SCHEMAS } from "@/runtime/codex-coordinator-tool-contract/lib/tool-results";

const COORDINATOR_ROLE = "coordinator" as const;
type CoordinatorRole = typeof COORDINATOR_ROLE;

const COORDINATOR_NAMESPACE_NAMES = Object.freeze([
	"archboard_workhorse",
	"archboard_voice",
] as const);

/** The reviewed identity that a coordinator turn must carry. */
const COORDINATOR_IDENTITY = deepFreeze({
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
 * Joins one reviewed manifest tool with the host-side authority facts the catalogue adds:
 * which host object it acts on, the links a call must carry, and how it may be refused.
 * @param namespace - The namespace that declares the tool.
 * @param toolName - The tool being described.
 * @param metadata - The authority target, required links, success shape and refusal reasons.
 * @returns The frozen contract for that tool.
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
	return deepFreeze({
		...canonicalTool(namespace, toolName),
		namespace,
		callerRole: COORDINATOR_ROLE,
		...metadata,
	});
}

const ARCHBOARD_WORKHORSE_TOOL_CONTRACTS = deepFreeze([
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

const ARCHBOARD_VOICE_TOOL_CONTRACTS = deepFreeze([
	contract("archboard_voice", "resolve_spoken_approval", {
		authorityTarget: "host_validated_spoken_approval",
		requiredLinks: [...VOICE_LINKS],
		successResult: { tag: "ok", valueSchema: TOOL_SUCCESS_RESULT_SCHEMAS.resolve_spoken_approval },
		refusalErrors: [...VOICE_REFUSALS],
	}),
] satisfies readonly CoordinatorToolContract[]);

const COORDINATOR_TOOL_CONTRACTS = deepFreeze([
	...ARCHBOARD_WORKHORSE_TOOL_CONTRACTS,
	...ARCHBOARD_VOICE_TOOL_CONTRACTS,
]);

const ARCHBOARD_WORKHORSE_CATALOGUE = deepFreeze({
	namespace: ARCHBOARD_WORKHORSE_NAMESPACE,
	tools: ARCHBOARD_WORKHORSE_TOOL_CONTRACTS,
});
const ARCHBOARD_VOICE_CATALOGUE = deepFreeze({
	namespace: ARCHBOARD_VOICE_NAMESPACE,
	tools: ARCHBOARD_VOICE_TOOL_CONTRACTS,
});
const COORDINATOR_TOOL_CATALOGUE = deepFreeze({
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
