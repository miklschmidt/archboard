import { z } from "zod";

import type {
	JsonSchema,
	CoordinatorNamespaceRole,
	CanonicalTool,
	CoordinatorToolName,
} from "#runtime/protocol/coordinator-tool-contract/manifest.ts";
import { canonicalTool, deepFreeze } from "#runtime/protocol/coordinator-tool-contract/manifest.ts";
import {
	DynamicToolRefusalReasonSchema,
	JsonObjectSchema,
	type DynamicToolRefusalReason,
} from "#runtime/protocol/coordinator-tool-contract/dynamic-tool-envelopes.ts";
import { TOOL_SUCCESS_RESULT_SCHEMAS } from "#runtime/protocol/coordinator-tool-contract/tool-results.ts";

const COORDINATOR_ROLE = "coordinator" as const;
type CoordinatorRole = typeof COORDINATOR_ROLE;

/** The roles of the coordinator's namespaces, in the order its thread declares them. */
const COORDINATOR_NAMESPACE_ROLES = Object.freeze(["workhorse", "voice"] as const);

/**
 * The Codex configuration every coordinator thread starts with.
 *
 * `project_doc_max_bytes: 0` stops Codex loading the checkout's `AGENTS.md` into the coordinator.
 * That file is written for an agent doing work in the repository: it tells every request to
 * begin with project procedure. The coordinator is a voice front desk whose whole brief is the
 * instructions the host gives it, and in its first narrated walkthrough (TASK-251) that
 * procedure cost eight seconds of silence before it presented a step. The workhorse, which does
 * work in the repository, still reads the file.
 */
const COORDINATOR_THREAD_CONFIG = deepFreeze({
	features: { realtime_conversation: true },
	project_doc_max_bytes: 0,
} as const);

/**
 * The reviewed settings that a coordinator turn must carry. How the host names itself to Codex
 * (service name and thread source) is not here: it is the host's own, on its thread profile.
 */
const COORDINATOR_IDENTITY = deepFreeze({
	role: COORDINATOR_ROLE,
	model: "gpt-6-sol",
	effort: "low",
	allowProviderModelFallback: false,
	config: COORDINATOR_THREAD_CONFIG,
	ephemeral: false,
	historyMode: "paginated",
	sessionStartSource: "startup",
	dynamicTools: [...COORDINATOR_NAMESPACE_ROLES],
	experimentalRawEvents: false,
} as const);

const CoordinatorIdentitySchema = z
	.object({
		role: z.literal(COORDINATOR_ROLE),
		model: z.literal(COORDINATOR_IDENTITY.model),
		effort: z.literal(COORDINATOR_IDENTITY.effort),
		allowProviderModelFallback: z.literal(false),
		config: z
			.object({
				features: z.object({ realtime_conversation: z.literal(true) }).strict(),
				project_doc_max_bytes: z.literal(0),
			})
			.strict(),
		ephemeral: z.literal(false),
		historyMode: z.literal("paginated"),
		sessionStartSource: z.literal("startup"),
		dynamicTools: z.tuple([z.literal("workhorse"), z.literal("voice")]),
		experimentalRawEvents: z.literal(false),
	})
	.strict();

type AuthorityTarget =
	| "server_bound_workhorse"
	| "server_created_workhorse_queue"
	| "server_proven_workhorse_turn"
	| "server_tab_session_workhorses"
	| "server_validated_spoken_approval";
const AuthorityTargetSchema = z.enum([
	"server_bound_workhorse",
	"server_created_workhorse_queue",
	"server_proven_workhorse_turn",
	"server_tab_session_workhorses",
	"server_validated_spoken_approval",
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
		role: z.enum(COORDINATOR_NAMESPACE_ROLES),
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
	readonly role: CoordinatorNamespaceRole;
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
/** A stop names no workhorse and proves no turn: the server finds the tab session's workhorses. */
const STOP_LINKS = TOOL_CORRELATION_LINKS;
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
const STOP_REFUSALS = [
	"invalid_call",
	"not_ready",
	"not_loaded",
	"system_error",
	"stale_child",
	"prior_epoch",
	"unknown_provenance",
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
 * Joins one reviewed manifest tool with the server-side authority facts the catalogue adds:
 * which server object it acts on, the links a call must carry, and how it may be refused.
 * @param role - The role of the namespace that declares the tool.
 * @param toolName - The tool being described.
 * @param metadata - The authority target, required links, success shape and refusal reasons.
 * @returns The frozen contract for that tool.
 */
function contract(
	role: CoordinatorNamespaceRole,
	toolName: CoordinatorToolName,
	metadata: Omit<
		CoordinatorToolContract,
		keyof CanonicalTool | "role" | "callerRole" | "successResult"
	> & {
		successResult: SuccessResultContract;
	},
): CoordinatorToolContract {
	return deepFreeze({
		...canonicalTool(role, toolName),
		role,
		callerRole: COORDINATOR_ROLE,
		...metadata,
	});
}

const WORKHORSE_TOOL_CONTRACTS = deepFreeze([
	contract("workhorse", "inspect_workhorse", {
		authorityTarget: "server_bound_workhorse",
		requiredLinks: [...WORKHORSE_LINKS],
		successResult: { tag: "ok", valueSchema: TOOL_SUCCESS_RESULT_SCHEMAS.inspect_workhorse },
		refusalErrors: [...INSPECT_REFUSALS],
	}),
	contract("workhorse", "delegate_to_workhorse", {
		authorityTarget: "server_bound_workhorse",
		requiredLinks: [...WORKHORSE_LINKS],
		successResult: { tag: "ok", valueSchema: TOOL_SUCCESS_RESULT_SCHEMAS.delegate_to_workhorse },
		refusalErrors: [...MUTATING_WORKHORSE_REFUSALS],
	}),
	contract("workhorse", "manage_workhorse_queue", {
		authorityTarget: "server_created_workhorse_queue",
		requiredLinks: [...QUEUE_LINKS],
		successResult: { tag: "ok", valueSchema: TOOL_SUCCESS_RESULT_SCHEMAS.manage_workhorse_queue },
		refusalErrors: [...QUEUE_REFUSALS],
	}),
	contract("workhorse", "steer_workhorse", {
		authorityTarget: "server_proven_workhorse_turn",
		requiredLinks: [...STEER_LINKS],
		successResult: { tag: "ok", valueSchema: TOOL_SUCCESS_RESULT_SCHEMAS.steer_workhorse },
		refusalErrors: [...MUTATING_WORKHORSE_REFUSALS],
	}),
	contract("workhorse", "stop_workhorses", {
		authorityTarget: "server_tab_session_workhorses",
		requiredLinks: [...STOP_LINKS],
		successResult: { tag: "ok", valueSchema: TOOL_SUCCESS_RESULT_SCHEMAS.stop_workhorses },
		refusalErrors: [...STOP_REFUSALS],
	}),
] satisfies readonly CoordinatorToolContract[]);

const VOICE_TOOL_CONTRACTS = deepFreeze([
	contract("voice", "resolve_spoken_approval", {
		authorityTarget: "server_validated_spoken_approval",
		requiredLinks: [...VOICE_LINKS],
		successResult: { tag: "ok", valueSchema: TOOL_SUCCESS_RESULT_SCHEMAS.resolve_spoken_approval },
		refusalErrors: [...VOICE_REFUSALS],
	}),
] satisfies readonly CoordinatorToolContract[]);

const COORDINATOR_TOOL_CONTRACTS = deepFreeze([
	...WORKHORSE_TOOL_CONTRACTS,
	...VOICE_TOOL_CONTRACTS,
]);

const WORKHORSE_TOOL_CATALOGUE = deepFreeze({ role: "workhorse", tools: WORKHORSE_TOOL_CONTRACTS });
const VOICE_TOOL_CATALOGUE = deepFreeze({ role: "voice", tools: VOICE_TOOL_CONTRACTS });
const COORDINATOR_TOOL_CATALOGUE = deepFreeze({
	identity: COORDINATOR_IDENTITY,
	tools: COORDINATOR_TOOL_CONTRACTS,
});

export {
	COORDINATOR_ROLE,
	type CoordinatorRole,
	COORDINATOR_NAMESPACE_ROLES,
	COORDINATOR_THREAD_CONFIG,
	COORDINATOR_IDENTITY,
	CoordinatorIdentitySchema,
	type AuthorityTarget,
	AuthorityTargetSchema,
	type RequiredLink,
	RequiredLinkSchema,
	CoordinatorToolContractSchema,
	type SuccessResultContract,
	type CoordinatorToolContract,
	WORKHORSE_TOOL_CONTRACTS,
	VOICE_TOOL_CONTRACTS,
	COORDINATOR_TOOL_CONTRACTS,
	WORKHORSE_TOOL_CATALOGUE,
	VOICE_TOOL_CATALOGUE,
	COORDINATOR_TOOL_CATALOGUE,
};
