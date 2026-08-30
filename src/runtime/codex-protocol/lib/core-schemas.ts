import { z } from "zod";

import {
	FiniteNumberSchema,
	IntegerSchema,
	JsonRecordSchema,
	JsonValueSchema,
	NonNegativeIntegerSchema,
	looseObject,
} from "./scalars.js";

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
export const ThreadStatusSchema = z.discriminatedUnion("type", [
	looseObject({ type: z.literal("notLoaded") }),
	looseObject({ type: z.literal("idle") }),
	looseObject({ type: z.literal("systemError") }),
	looseObject({ type: z.literal("active"), activeFlags: z.array(ThreadActiveFlagSchema) }),
]);

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

export const TurnStatusSchema = z.enum(["completed", "interrupted", "failed", "inProgress"]);
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
	misalignment: JsonValueSchema.nullable(),
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
export const RealtimeVoiceSchema = z.string();

export const ThreadRealtimeBemItemPresentationSchema = z.discriminatedUnion("type", [
	looseObject({ type: z.literal("wholeItem") }),
	looseObject({ type: z.literal("inlineMarkdown") }),
	looseObject({ type: z.literal("inlineVisualization"), index: NonNegativeIntegerSchema }),
]);

export const ThreadRealtimeItemSchema = z
	.looseObject({
		id: z.string(),
		realtimeSessionId: z.string(),
		type: z.string(),
	})
	.superRefine((item, context) => {
		const checks = {
			realtimeSessionStarted: looseObject({ type: z.literal("realtimeSessionStarted") }),
			transcriptSegment: looseObject({
				type: z.literal("transcriptSegment"),
				role: RealtimeTranscriptRoleSchema,
				text: z.string(),
			}),
			bemItemPromoted: looseObject({
				type: z.literal("bemItemPromoted"),
				turnId: z.string(),
				itemId: z.string(),
				presentation: ThreadRealtimeBemItemPresentationSchema,
			}),
			realtimeSessionClosed: looseObject({
				type: z.literal("realtimeSessionClosed"),
				outcome: RealtimeSessionOutcomeSchema,
			}),
		} as const;
		const schema = checks[item.type as keyof typeof checks];
		if (!schema) {
			context.addIssue({
				code: "custom",
				path: ["type"],
				message: "Unknown realtime item union member.",
			});
			return;
		}
		const result = schema.safeParse(item);
		if (!result.success)
			for (const issue of result.error.issues)
				context.addIssue({ code: "custom", path: issue.path, message: issue.message });
	});

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

export const ConfigLayerSourceSchema = z.discriminatedUnion("type", [
	looseObject({ type: z.literal("packagedDefaults"), file: z.string() }),
	looseObject({ type: z.literal("mdm"), domain: z.string(), key: z.string() }),
	looseObject({ type: z.literal("system"), file: z.string() }),
	looseObject({ type: z.literal("enterpriseManaged"), id: z.string(), name: z.string() }),
	looseObject({ type: z.literal("user"), file: z.string(), profile: z.string().nullable() }),
	looseObject({ type: z.literal("project"), dotCodexFolder: z.string() }),
	looseObject({ type: z.literal("sessionFlags") }),
	looseObject({ type: z.literal("legacyManagedConfigTomlFromFile"), file: z.string() }),
	looseObject({ type: z.literal("legacyManagedConfigTomlFromMdm") }),
]);

export const ConfigLayerMetadataSchema = looseObject({
	name: ConfigLayerSourceSchema,
	version: z.string(),
});
export const ConfigLayerSchema = looseObject({
	name: ConfigLayerSourceSchema,
	version: z.string(),
	config: JsonValueSchema,
	disabledReason: z.string().nullable(),
});

export const ConfigSchema = looseObject({
	model: z.string().nullable(),
	review_model: z.string().nullable(),
	model_context_window: IntegerSchema.nullable(),
	model_auto_compact_token_limit: IntegerSchema.nullable(),
	model_auto_compact_token_limit_scope: z.string().nullable(),
	model_provider: z.string().nullable(),
	approval_policy: AskForApprovalSchema.nullable(),
	approvals_reviewer: ApprovalsReviewerSchema.nullable(),
	sandbox_mode: SandboxModeSchema.nullable(),
	sandbox_workspace_write: JsonValueSchema.nullable(),
	forced_chatgpt_workspace_id: JsonValueSchema.nullable(),
	forced_login_method: z.string().nullable(),
	web_search: z.string().nullable(),
	tools: JsonValueSchema.nullable(),
	instructions: z.string().nullable(),
	developer_instructions: z.string().nullable(),
	compact_prompt: z.string().nullable(),
	model_reasoning_effort: ReasoningEffortSchema.nullable(),
	model_reasoning_summary: ReasoningSummarySchema.nullable(),
	model_verbosity: z.string().nullable(),
	service_tier: z.string().nullable(),
	analytics: JsonValueSchema.nullable(),
	apps: JsonValueSchema.nullable(),
	browser_use: JsonValueSchema.nullable(),
	computer_use: JsonValueSchema.nullable(),
	desktop: JsonRecordSchema.nullable(),
});

export const ConfigRequirementsSchema = looseObject({
	cliAuthCredentialsStore: z.string().nullable(),
	chatgptBaseUrl: z.string().nullable(),
	additionalDeveloperInstructions: z.string().nullable(),
	allowedApprovalPolicies: z.array(AskForApprovalSchema).nullable(),
	allowedApprovalsReviewers: z.array(ApprovalsReviewerSchema).nullable(),
	allowedSandboxModes: z.array(SandboxModeSchema).nullable(),
	allowedWindowsSandboxImplementations: z.array(z.string()).nullable(),
	allowedPermissionProfiles: z.record(z.string(), z.boolean()).nullable(),
	defaultPermissions: z.string().nullable(),
	allowedWebSearchModes: z.array(z.string()).nullable(),
	allowManagedHooksOnly: z.boolean().nullable(),
	allowBrowserAndComputerUse: z.boolean().nullable(),
	allowAppshots: z.boolean().nullable(),
	allowRemoteControl: z.boolean().nullable(),
	computerUse: JsonValueSchema.nullable(),
	browserUse: JsonValueSchema.nullable(),
	inAppBrowser: JsonValueSchema.nullable(),
	featureRequirements: z.record(z.string(), z.boolean()).nullable(),
	hooks: JsonValueSchema.nullable(),
	enforceResidency: JsonValueSchema.nullable(),
	network: JsonValueSchema.nullable(),
	autoReview: JsonValueSchema.nullable(),
	models: JsonValueSchema.nullable(),
	sqliteHome: z.string().nullable(),
	logDir: z.string().nullable(),
	modelCatalogJson: z.string().nullable(),
	checkForUpdateOnStartup: z.boolean().nullable(),
	allowLoginShell: z.boolean().nullable(),
	feedback: JsonValueSchema.nullable(),
	windowsSandboxPrivateDesktop: z.boolean().nullable(),
});

export const ModelServiceTierSchema = looseObject({
	id: z.string(),
	name: z.string(),
	description: z.string(),
});
export const ReasoningEffortOptionSchema = looseObject({
	reasoningEffort: ReasoningEffortSchema,
	description: z.string(),
});
export const ModelSchema = looseObject({
	id: z.string(),
	model: z.string(),
	upgrade: z.string().nullable(),
	upgradeInfo: JsonValueSchema.nullable(),
	availabilityNux: JsonValueSchema.nullable(),
	displayName: z.string(),
	description: z.string(),
	modelSpecialty: z.string().nullable(),
	hidden: z.boolean(),
	supportedReasoningEfforts: z.array(ReasoningEffortOptionSchema),
	defaultReasoningEffort: ReasoningEffortSchema,
	inputModalities: z.array(z.enum(["text", "image", "audio"])),
	supportsPersonality: z.boolean(),
	multiAgentVersion: z.enum(["disabled", "v1", "v2"]).nullable(),
	additionalSpeedTiers: z.array(z.string()),
	serviceTiers: z.array(ModelServiceTierSchema),
	defaultServiceTier: z.string().nullable(),
	isDefault: z.boolean(),
});

export const ThreadSettingsSchema = looseObject({
	cwd: z.string(),
	approvalPolicy: AskForApprovalSchema,
	approvalsReviewer: ApprovalsReviewerSchema,
	sandboxPolicy: SandboxPolicySchema,
	activePermissionProfile: ActivePermissionProfileSchema.nullable(),
	model: z.string(),
	modelProvider: z.string(),
	serviceTier: z.string().nullable(),
	effort: ReasoningEffortSchema.nullable(),
	summary: ReasoningSummarySchema.nullable(),
	collaborationMode: looseObject({
		mode: z.enum(["plan", "default"]),
		settings: looseObject({
			model: z.string(),
			reasoning_effort: ReasoningEffortSchema.nullable(),
			developer_instructions: z.string().nullable(),
		}),
	}),
	multiAgentMode: MultiAgentModeSchema,
	personality: PersonalitySchema.nullable(),
});

export const TokenUsageBreakdownSchema = looseObject({
	totalTokens: FiniteNumberSchema,
	inputTokens: FiniteNumberSchema,
	cachedInputTokens: FiniteNumberSchema,
	cacheWriteInputTokens: FiniteNumberSchema,
	outputTokens: FiniteNumberSchema,
	reasoningOutputTokens: FiniteNumberSchema,
});
export const ThreadTokenUsageSchema = looseObject({
	total: TokenUsageBreakdownSchema,
	last: TokenUsageBreakdownSchema,
	modelContextWindow: FiniteNumberSchema.nullable(),
});

export const RateLimitWindowSchema = looseObject({
	usedPercent: FiniteNumberSchema,
	windowDurationMins: FiniteNumberSchema.nullable(),
	resetsAt: FiniteNumberSchema.nullable(),
});
export const CreditsSnapshotSchema = looseObject({
	hasCredits: z.boolean(),
	unlimited: z.boolean(),
	balance: z.string().nullable(),
});
export const SpendControlLimitSnapshotSchema = looseObject({
	limit: z.string(),
	used: z.string(),
	remainingPercent: FiniteNumberSchema,
	resetsAt: FiniteNumberSchema,
});
export const RateLimitSnapshotSchema = looseObject({
	limitId: z.string().nullable(),
	limitName: z.string().nullable(),
	primary: RateLimitWindowSchema.nullable(),
	secondary: RateLimitWindowSchema.nullable(),
	credits: CreditsSnapshotSchema.nullable(),
	individualLimit: SpendControlLimitSnapshotSchema.nullable(),
	spendControlReached: z.boolean().nullable(),
	planType: PlanTypeSchema.nullable(),
	rateLimitReachedType: z
		.enum([
			"rate_limit_reached",
			"workspace_owner_credits_depleted",
			"workspace_member_credits_depleted",
			"workspace_owner_usage_limit_reached",
			"workspace_member_usage_limit_reached",
		])
		.nullable(),
});
