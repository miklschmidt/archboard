import { z } from "zod";

import { CodexThreadStatusSchema, CodexTurnStatusSchema } from "@/shared/codex-app-server-contract";

import {
	FiniteNumberSchema,
	IntegerSchema,
	NonNegativeIntegerSchema,
	looseObject,
} from "@/runtime/codex-protocol/lib/scalars";
import { MisalignmentErrorDetailsSchema } from "@/runtime/codex-protocol/lib/error-schemas";

const PlanTypeSchema = z.enum([
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

const AuthModeSchema = z.enum([
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
const ReasoningEffortSchema = z.string();
const ReasoningSummarySchema = z.enum(["auto", "concise", "detailed", "none"]);
const PersonalitySchema = z.enum(["none", "friendly", "pragmatic"]);
const MessagePhaseSchema = z.enum(["commentary", "final_answer"]);
const MultiAgentModeSchema = z.union([
	z.enum(["explicitRequestOnly", "proactive"]),
	looseObject({ custom: z.string() }),
]);

const AskForApprovalSchema = z.union([
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

const ApprovalsReviewerSchema = z.enum(["user", "auto_review", "guardian_subagent"]);
const SandboxModeSchema = z.enum(["read-only", "workspace-write", "danger-full-access"]);
const NetworkAccessSchema = z.enum(["restricted", "enabled"]);

const SandboxPolicySchema = z.discriminatedUnion("type", [
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

const ActivePermissionProfileSchema = looseObject({
	id: z.string(),
	extends: z.string().nullable(),
});

const ThreadHistoryModeSchema = z.enum(["legacy", "paginated"]);
const ThreadActiveFlagSchema = z.enum(["waitingOnApproval", "waitingOnUserInput"]);
const ThreadStatusSchema = CodexThreadStatusSchema;

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

const SessionSourceSchema = z.union([
	z.enum(["cli", "vscode", "exec", "appServer", "unknown"]),
	looseObject({ custom: z.string() }),
	looseObject({ subAgent: SubAgentSourceSchema }),
]);

const ThreadSectionAppearanceSchema = looseObject({
	icon: z.string().nullable(),
	color: z.string().nullable(),
});
const ThreadSectionSchema = looseObject({
	id: z.string(),
	name: z.string(),
	appearance: ThreadSectionAppearanceSchema.nullable(),
});
const GitInfoSchema = looseObject({
	sha: z.string().nullable(),
	branch: z.string().nullable(),
	originUrl: z.string().nullable(),
});

const ThreadGoalStatusSchema = z.enum([
	"active",
	"paused",
	"blocked",
	"usageLimited",
	"budgetLimited",
	"complete",
]);
const ThreadGoalSchema = looseObject({
	threadId: z.string(),
	objective: z.string(),
	status: ThreadGoalStatusSchema,
	tokenBudget: FiniteNumberSchema.nullable(),
	tokensUsed: FiniteNumberSchema,
	timeUsedSeconds: FiniteNumberSchema,
	createdAt: FiniteNumberSchema,
	updatedAt: FiniteNumberSchema,
});

const TurnStatusSchema = CodexTurnStatusSchema;
const NonSteerableTurnKindSchema = z.enum(["review", "compact"]);
const CodexErrorInfoSchema = z.union([
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

const TurnErrorSchema = looseObject({
	message: z.string(),
	codexErrorInfo: CodexErrorInfoSchema.nullable(),
	additionalDetails: z.string().nullable(),
	misalignment: MisalignmentErrorDetailsSchema.nullable(),
});

const TurnPlanStepStatusSchema = z.enum(["pending", "inProgress", "completed"]);
const TurnPlanStepSchema = looseObject({
	step: z.string(),
	status: TurnPlanStepStatusSchema,
});

const ConversationTextRoleSchema = z.enum(["user", "developer", "assistant"]);
const RealtimeConversationVersionSchema = z.enum(["v1", "v2", "v3"]);
const RealtimeTranscriptRoleSchema = z.enum(["user", "assistant"]);
const RealtimeSessionOutcomeSchema = z.enum(["ended", "failed"]);
const RealtimeOutputModalitySchema = z.enum(["text", "audio"]);
const RealtimeVoiceSchema = z.enum([
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

const ThreadRealtimeBemItemPresentationSchema = z.discriminatedUnion("type", [
	looseObject({ type: z.literal("wholeItem") }),
	looseObject({ type: z.literal("inlineMarkdown") }),
	looseObject({ type: z.literal("inlineVisualization"), index: NonNegativeIntegerSchema }),
]);

const ThreadRealtimeItemSchema = z.discriminatedUnion("type", [
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

const ThreadRealtimeAudioChunkSchema = looseObject({
	data: z.string(),
	sampleRate: FiniteNumberSchema,
	numChannels: FiniteNumberSchema,
	samplesPerChannel: FiniteNumberSchema.nullable(),
	itemId: z.string().nullable(),
});

const ByteRangeSchema = looseObject({
	start: NonNegativeIntegerSchema,
	end: NonNegativeIntegerSchema,
});
const TextElementSchema = looseObject({
	byteRange: ByteRangeSchema,
	placeholder: z.string().nullable(),
});

const ImageDetailSchema = z.enum(["auto", "low", "high", "original"]);
const UserInputSchema = z.discriminatedUnion("type", [
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

const FunctionCallOutputContentItemSchema = z.discriminatedUnion("type", [
	looseObject({ type: z.literal("input_text"), text: z.string() }),
	looseObject({
		type: z.literal("input_image"),
		image_url: z.string(),
		detail: ImageDetailSchema.optional(),
	}),
	looseObject({ type: z.literal("input_audio"), audio_url: z.string() }),
	looseObject({ type: z.literal("encrypted_content"), encrypted_content: z.string() }),
]);
const FunctionCallOutputBodySchema = z.union([
	z.string(),
	z.array(FunctionCallOutputContentItemSchema),
]);

const AccountSchema = z.discriminatedUnion("type", [
	looseObject({ type: z.literal("apiKey") }),
	looseObject({
		type: z.literal("chatgpt"),
		email: z.string().nullable(),
		planType: PlanTypeSchema,
	}),
	looseObject({ type: z.literal("amazonBedrock"), usesCodexManagedCredentials: z.boolean() }),
]);

export {
	PlanTypeSchema,
	AuthModeSchema,
	ReasoningEffortSchema,
	ReasoningSummarySchema,
	PersonalitySchema,
	MessagePhaseSchema,
	MultiAgentModeSchema,
	AskForApprovalSchema,
	ApprovalsReviewerSchema,
	SandboxModeSchema,
	NetworkAccessSchema,
	SandboxPolicySchema,
	ActivePermissionProfileSchema,
	ThreadHistoryModeSchema,
	ThreadActiveFlagSchema,
	ThreadStatusSchema,
	SessionSourceSchema,
	ThreadSectionAppearanceSchema,
	ThreadSectionSchema,
	GitInfoSchema,
	ThreadGoalStatusSchema,
	ThreadGoalSchema,
	TurnStatusSchema,
	NonSteerableTurnKindSchema,
	CodexErrorInfoSchema,
	TurnErrorSchema,
	TurnPlanStepStatusSchema,
	TurnPlanStepSchema,
	ConversationTextRoleSchema,
	RealtimeConversationVersionSchema,
	RealtimeTranscriptRoleSchema,
	RealtimeSessionOutcomeSchema,
	RealtimeOutputModalitySchema,
	RealtimeVoiceSchema,
	ThreadRealtimeBemItemPresentationSchema,
	ThreadRealtimeItemSchema,
	ThreadRealtimeAudioChunkSchema,
	ByteRangeSchema,
	TextElementSchema,
	ImageDetailSchema,
	UserInputSchema,
	FunctionCallOutputContentItemSchema,
	FunctionCallOutputBodySchema,
	AccountSchema,
};
