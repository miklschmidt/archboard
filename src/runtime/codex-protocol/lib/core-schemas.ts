import { z } from "zod";

import {
	CodexThreadStatusSchema,
	CodexTurnStatusSchema,
} from "../../../shared/codex-app-server-contract/index.js";

import {
	FiniteNumberSchema,
	IntegerSchema,
	NonNegativeIntegerSchema,
	looseObject,
} from "./scalars.js";
import { MisalignmentErrorDetailsSchema } from "./error-schemas.js";

export const PlanTypeSchema = z.enum([
	"free",
	"go",
	"plus",
	"pro",
	"prolite",
	"team",
	"self_serve_business_prolite",
	"self_serve_business_usage_based",
	"business",
	"ent26",
	"enterprise_cbp_automation",
	"enterprise_cbp_usage_based",
	"enterprise",
	"edu",
	"edu_plus",
	"edu_pro",
	"unknown",
]);

export const AuthModeSchema = z.enum([
	"apikey",
	"chatgpt",
	"chatgptAuthTokens",
	"headers",
	"agentIdentity",
	"personalAccessToken",
	"bedrockApiKey",
	"bedrockAccessKeys",
]);

/** Generated `ReasoningEffort` is an open provider-defined string. */
export const ReasoningEffortSchema = z.string();
export const ReasoningSummarySchema = z.enum(["auto", "concise", "detailed", "none"]);
export const PersonalitySchema = z.enum(["none", "friendly", "pragmatic"]);
export const MessagePhaseSchema = z.enum(["commentary", "final_answer"]);
export const MultiAgentModeSchema = z.union([
	z.enum(["explicitRequestOnly", "proactive"]),
	looseObject({ custom: z.string() }),
]);

export const AskForApprovalSchema = z.union([
	z.enum(["untrusted", "on-request", "never"]),
	looseObject({
		granular: looseObject({
			sandbox_approval: z.boolean(),
			rules: z.boolean(),
			skill_approval: z.boolean(),
			request_permissions: z.boolean(),
			mcp_elicitations: z.boolean(),
		}),
	}),
]);

export const ApprovalsReviewerSchema = z.enum(["user", "auto_review", "guardian_subagent"]);
export const SandboxModeSchema = z.enum(["read-only", "workspace-write", "danger-full-access"]);
export const NetworkAccessSchema = z.enum(["restricted", "enabled"]);

export const SandboxPolicySchema = z.discriminatedUnion("type", [
	looseObject({ type: z.literal("dangerFullAccess") }),
	looseObject({ type: z.literal("readOnly"), networkAccess: z.boolean() }),
	looseObject({ type: z.literal("externalSandbox"), networkAccess: NetworkAccessSchema }),
	looseObject({
		type: z.literal("workspaceWrite"),
		writableRoots: z.array(z.string()),
		networkAccess: z.boolean(),
		excludeTmpdirEnvVar: z.boolean(),
		excludeSlashTmp: z.boolean(),
	}),
]);

export const ActivePermissionProfileSchema = looseObject({
	id: z.string(),
	extends: z.string().nullable(),
});

export const ThreadHistoryModeSchema = z.enum(["legacy", "paginated"]);
export const ThreadActiveFlagSchema = z.enum(["waitingOnApproval", "waitingOnUserInput"]);
export const ThreadStatusSchema = CodexThreadStatusSchema;

const SubAgentSourceSchema = z.union([
	z.enum(["review", "compact", "memory_consolidation"]),
	looseObject({
		thread_spawn: looseObject({
			parent_thread_id: z.string(),
			depth: NonNegativeIntegerSchema,
			agent_path: z.string().nullable(),
			agent_nickname: z.string().nullable(),
			agent_role: z.string().nullable(),
		}),
	}),
	looseObject({ other: z.string() }),
]);

export const SessionSourceSchema = z.union([
	z.enum(["cli", "vscode", "exec", "appServer", "unknown"]),
	looseObject({ custom: z.string() }),
	looseObject({ subAgent: SubAgentSourceSchema }),
]);

export const ThreadSectionAppearanceSchema = looseObject({
	icon: z.string().nullable(),
	color: z.string().nullable(),
});
export const ThreadSectionSchema = looseObject({
	id: z.string(),
	name: z.string(),
	appearance: ThreadSectionAppearanceSchema.nullable(),
});
export const GitInfoSchema = looseObject({
	sha: z.string().nullable(),
	branch: z.string().nullable(),
	originUrl: z.string().nullable(),
});

export const ThreadGoalStatusSchema = z.enum([
	"active",
	"paused",
	"blocked",
	"usageLimited",
	"budgetLimited",
	"complete",
]);
export const ThreadGoalSchema = looseObject({
	threadId: z.string(),
	objective: z.string(),
	status: ThreadGoalStatusSchema,
	tokenBudget: FiniteNumberSchema.nullable(),
	tokensUsed: FiniteNumberSchema,
	timeUsedSeconds: FiniteNumberSchema,
	createdAt: FiniteNumberSchema,
	updatedAt: FiniteNumberSchema,
});

export const TurnStatusSchema = CodexTurnStatusSchema;
export const NonSteerableTurnKindSchema = z.enum(["review", "compact"]);
export const CodexErrorInfoSchema = z.union([
	z.enum([
		"contextWindowExceeded",
		"sessionBudgetExceeded",
		"usageLimitExceeded",
		"rateLimitExceeded",
		"serverOverloaded",
		"cyberPolicy",
		"misalignmentPolicyViolation",
		"internalServerError",
		"unauthorized",
		"badRequest",
		"threadRollbackFailed",
		"sandboxError",
		"other",
	]),
	looseObject({ httpConnectionFailed: looseObject({ httpStatusCode: IntegerSchema.nullable() }) }),
	looseObject({
		responseStreamConnectionFailed: looseObject({ httpStatusCode: IntegerSchema.nullable() }),
	}),
	looseObject({
		responseStreamDisconnected: looseObject({ httpStatusCode: IntegerSchema.nullable() }),
	}),
	looseObject({
		responseTooManyFailedAttempts: looseObject({ httpStatusCode: IntegerSchema.nullable() }),
	}),
	looseObject({ activeTurnNotSteerable: looseObject({ turnKind: NonSteerableTurnKindSchema }) }),
]);

export const TurnErrorSchema = looseObject({
	message: z.string(),
	codexErrorInfo: CodexErrorInfoSchema.nullable(),
	additionalDetails: z.string().nullable(),
	misalignment: MisalignmentErrorDetailsSchema.nullable(),
});

export const TurnPlanStepStatusSchema = z.enum(["pending", "inProgress", "completed"]);
export const TurnPlanStepSchema = looseObject({
	step: z.string(),
	status: TurnPlanStepStatusSchema,
});

export const ConversationTextRoleSchema = z.enum(["user", "developer", "assistant"]);
export const RealtimeConversationVersionSchema = z.enum(["v1", "v2", "v3"]);
export const RealtimeTranscriptRoleSchema = z.enum(["user", "assistant"]);
export const RealtimeSessionOutcomeSchema = z.enum(["ended", "failed"]);
export const RealtimeOutputModalitySchema = z.enum(["text", "audio"]);
export const RealtimeVoiceSchema = z.enum([
	"alloy",
	"arbor",
	"ash",
	"ballad",
	"breeze",
	"cedar",
	"coral",
	"cove",
	"echo",
	"ember",
	"juniper",
	"maple",
	"marin",
	"sage",
	"shimmer",
	"sol",
	"spruce",
	"vale",
	"verse",
]);

export const ThreadRealtimeBemItemPresentationSchema = z.discriminatedUnion("type", [
	looseObject({ type: z.literal("wholeItem") }),
	looseObject({ type: z.literal("inlineMarkdown") }),
	looseObject({ type: z.literal("inlineVisualization"), index: NonNegativeIntegerSchema }),
]);

export const ThreadRealtimeItemSchema = z.discriminatedUnion("type", [
	looseObject({
		id: z.string(),
		realtimeSessionId: z.string(),
		type: z.literal("realtimeSessionStarted"),
	}),
	looseObject({
		id: z.string(),
		realtimeSessionId: z.string(),
		type: z.literal("transcriptSegment"),
		role: RealtimeTranscriptRoleSchema,
		text: z.string(),
	}),
	looseObject({
		id: z.string(),
		realtimeSessionId: z.string(),
		type: z.literal("bemItemPromoted"),
		turnId: z.string(),
		itemId: z.string(),
		presentation: ThreadRealtimeBemItemPresentationSchema,
	}),
	looseObject({
		id: z.string(),
		realtimeSessionId: z.string(),
		type: z.literal("realtimeSessionClosed"),
		outcome: RealtimeSessionOutcomeSchema,
	}),
]);

export const ThreadRealtimeAudioChunkSchema = looseObject({
	data: z.string(),
	sampleRate: FiniteNumberSchema,
	numChannels: FiniteNumberSchema,
	samplesPerChannel: FiniteNumberSchema.nullable(),
	itemId: z.string().nullable(),
});

export const ByteRangeSchema = looseObject({
	start: NonNegativeIntegerSchema,
	end: NonNegativeIntegerSchema,
});
export const TextElementSchema = looseObject({
	byteRange: ByteRangeSchema,
	placeholder: z.string().nullable(),
});

export const ImageDetailSchema = z.enum(["auto", "low", "high", "original"]);
export const UserInputSchema = z.discriminatedUnion("type", [
	looseObject({
		type: z.literal("text"),
		text: z.string(),
		text_elements: z.array(TextElementSchema),
	}),
	looseObject({ type: z.literal("image"), detail: ImageDetailSchema.optional(), url: z.string() }),
	looseObject({
		type: z.literal("localImage"),
		detail: ImageDetailSchema.optional(),
		path: z.string(),
	}),
	looseObject({ type: z.literal("audio"), url: z.string() }),
	looseObject({ type: z.literal("localAudio"), path: z.string() }),
	looseObject({ type: z.literal("skill"), name: z.string(), path: z.string() }),
	looseObject({ type: z.literal("mention"), name: z.string(), path: z.string() }),
]);

export const FunctionCallOutputContentItemSchema = z.discriminatedUnion("type", [
	looseObject({ type: z.literal("input_text"), text: z.string() }),
	looseObject({
		type: z.literal("input_image"),
		image_url: z.string(),
		detail: ImageDetailSchema.optional(),
	}),
	looseObject({ type: z.literal("input_audio"), audio_url: z.string() }),
	looseObject({ type: z.literal("encrypted_content"), encrypted_content: z.string() }),
]);
export const FunctionCallOutputBodySchema = z.union([
	z.string(),
	z.array(FunctionCallOutputContentItemSchema),
]);

export const AccountSchema = z.discriminatedUnion("type", [
	looseObject({ type: z.literal("apiKey") }),
	looseObject({
		type: z.literal("chatgpt"),
		email: z.string().nullable(),
		planType: PlanTypeSchema,
	}),
	looseObject({ type: z.literal("amazonBedrock"), usesCodexManagedCredentials: z.boolean() }),
]);
