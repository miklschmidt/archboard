import { z } from "zod";

import {
	AskForApprovalSchema,
	ApprovalsReviewerSchema,
	ActivePermissionProfileSchema,
	MultiAgentModeSchema,
	PersonalitySchema,
	PlanTypeSchema,
	ReasoningEffortSchema,
	ReasoningSummarySchema,
	SandboxModeSchema,
	SandboxPolicySchema,
} from "./core-schemas.js";
import {
	FiniteNumberSchema,
	IntegerSchema,
	JsonRecordSchema,
	JsonValueSchema,
	looseObject,
} from "./scalars.js";

export const AutoCompactTokenLimitScopeSchema = z.enum(["total", "body_after_prefix"]);
export const ForcedLoginMethodSchema = z.enum(["chatgpt", "api"]);
export const WebSearchModeSchema = z.enum(["disabled", "cached", "indexed", "live"]);
export const VerbositySchema = z.enum(["low", "medium", "high"]);
export const CliAuthCredentialsStoreModeSchema = z.enum(["file", "keyring", "auto", "ephemeral"]);
export const WindowsSandboxSetupModeSchema = z.enum(["elevated", "unelevated"]);
export const AllowDenyRequirementSchema = z.enum(["allow", "deny"]);

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

/** A config layer carries the server's intentionally opaque JSON snapshot. */
export const ConfigLayerSchema = looseObject({
	name: ConfigLayerSourceSchema,
	version: z.string(),
	config: JsonValueSchema,
	disabledReason: z.string().nullable(),
});

export const SandboxWorkspaceWriteSchema = looseObject({
	writable_roots: z.array(z.string()),
	network_access: z.boolean(),
	exclude_tmpdir_env_var: z.boolean(),
	exclude_slash_tmp: z.boolean(),
});
export const ForcedChatgptWorkspaceIdsSchema = z.union([z.string(), z.array(z.string())]);

export const WebSearchContextSizeSchema = z.enum(["low", "medium", "high"]);
export const WebSearchLocationSchema = looseObject({
	country: z.string().nullable(),
	region: z.string().nullable(),
	city: z.string().nullable(),
	timezone: z.string().nullable(),
});
export const WebSearchToolConfigSchema = looseObject({
	context_size: WebSearchContextSizeSchema.nullable(),
	allowed_domains: z.array(z.string()).nullable(),
	location: WebSearchLocationSchema.nullable(),
});
export const ToolsV2Schema = looseObject({ web_search: WebSearchToolConfigSchema.nullable() });

/** Config's generated extension map permits these scalar/JSON values by design. */
const ConfigExtraValueSchema = z.union([
	z.number(),
	z.string(),
	z.boolean(),
	z.array(JsonValueSchema),
	JsonRecordSchema,
	z.null(),
]);

/** Analytics keeps documented `enabled` strict and preserves its open config keys. */
export const AnalyticsConfigSchema = z
	.object({ enabled: z.boolean().nullable() })
	.catchall(ConfigExtraValueSchema);

const AppToolApprovalSchema = z.enum(["auto", "prompt", "writes", "approve"]);
const AppToolsConfigEntrySchema = looseObject({
	enabled: z.boolean().nullable(),
	approval_mode: AppToolApprovalSchema.nullable(),
});
/** Tool names are generated map keys supplied by each app's registry entry. */
const AppToolsConfigSchema = z.record(z.string(), AppToolsConfigEntrySchema);
const AppsDefaultConfigSchema = looseObject({
	enabled: z.boolean(),
	approvals_reviewer: ApprovalsReviewerSchema.nullable(),
	destructive_enabled: z.boolean(),
	open_world_enabled: z.boolean(),
	default_tools_approval_mode: AppToolApprovalSchema.nullable(),
});
const AppConfigEntrySchema = looseObject({
	enabled: z.boolean(),
	approvals_reviewer: ApprovalsReviewerSchema.nullable(),
	destructive_enabled: z.boolean().nullable(),
	open_world_enabled: z.boolean().nullable(),
	default_tools_approval_mode: AppToolApprovalSchema.nullable(),
	default_tools_enabled: z.boolean().nullable(),
	tools: AppToolsConfigSchema.nullable(),
});
/** App ids are an intentionally open map; each value has a closed config shape. */
export const AppsConfigSchema = z
	.object({ _default: AppsDefaultConfigSchema.nullable() })
	.catchall(AppConfigEntrySchema);

const BrowserUseOriginPolicyConfigSchema = looseObject({
	access: AllowDenyRequirementSchema.nullable(),
	downloads: AllowDenyRequirementSchema.nullable(),
	uploads: AllowDenyRequirementSchema.nullable(),
	full_cdp_access: AllowDenyRequirementSchema.nullable(),
});
export const BrowserUseConfigSchema = looseObject({
	allow_history_access: z.boolean().nullable(),
	default_origin_policy: BrowserUseOriginPolicyConfigSchema.nullable(),
	/** Origin names are generated map keys supplied by the browser policy. */
	origins: z.record(z.string(), BrowserUseOriginPolicyConfigSchema).nullable(),
});

const ComputerUseMacosConfigSchema = looseObject({
	/** Bundle identifiers are generated map keys supplied by the desktop policy. */
	bundle_ids: z.record(z.string(), AllowDenyRequirementSchema).nullable(),
});
const ComputerUseWindowsExeConfigSchema = looseObject({
	publisher_name: z.string(),
	product_name: z.string(),
	binary_name: z.string().nullable(),
	access: AllowDenyRequirementSchema,
});
const ComputerUseWindowsConfigSchema = looseObject({
	/** AUMIDs are generated map keys supplied by the desktop policy. */
	aumids: z.record(z.string(), AllowDenyRequirementSchema).nullable(),
	exes: z.array(ComputerUseWindowsExeConfigSchema).nullable(),
});
export const ComputerUseConfigSchema = looseObject({
	default_app_access: AllowDenyRequirementSchema.nullable(),
	macos: ComputerUseMacosConfigSchema.nullable(),
	windows: ComputerUseWindowsConfigSchema.nullable(),
});

export const ConfigSchema = z
	.object({
		model: z.string().nullable(),
		review_model: z.string().nullable(),
		model_context_window: IntegerSchema.nullable(),
		model_auto_compact_token_limit: IntegerSchema.nullable(),
		model_auto_compact_token_limit_scope: AutoCompactTokenLimitScopeSchema.nullable(),
		model_provider: z.string().nullable(),
		approval_policy: AskForApprovalSchema.nullable(),
		approvals_reviewer: ApprovalsReviewerSchema.nullable(),
		sandbox_mode: SandboxModeSchema.nullable(),
		sandbox_workspace_write: SandboxWorkspaceWriteSchema.nullable(),
		forced_chatgpt_workspace_id: ForcedChatgptWorkspaceIdsSchema.nullable(),
		forced_login_method: ForcedLoginMethodSchema.nullable(),
		web_search: WebSearchModeSchema.nullable(),
		tools: ToolsV2Schema.nullable(),
		instructions: z.string().nullable(),
		developer_instructions: z.string().nullable(),
		compact_prompt: z.string().nullable(),
		model_reasoning_effort: ReasoningEffortSchema.nullable(),
		model_reasoning_summary: ReasoningSummarySchema.nullable(),
		model_verbosity: VerbositySchema.nullable(),
		service_tier: z.string().nullable(),
		analytics: AnalyticsConfigSchema.nullable(),
		apps: AppsConfigSchema.nullable(),
		browser_use: BrowserUseConfigSchema.nullable(),
		computer_use: ComputerUseConfigSchema.nullable(),
		/** `desktop` is a generated JsonValue map, not a typed Codex object. */
		desktop: JsonRecordSchema.nullable(),
	})
	.catchall(ConfigExtraValueSchema);

const ComputerUseMacosRequirementsSchema = looseObject({
	/** Bundle identifiers are generated map keys supplied by managed requirements. */
	bundleIds: z.record(z.string(), AllowDenyRequirementSchema).nullable(),
});
const ComputerUseWindowsExeRequirementSchema = looseObject({
	publisherName: z.string(),
	productName: z.string(),
	binaryName: z.string().nullable(),
	access: AllowDenyRequirementSchema,
});
const ComputerUseWindowsRequirementsSchema = looseObject({
	/** AUMIDs are generated map keys supplied by managed requirements. */
	aumids: z.record(z.string(), AllowDenyRequirementSchema).nullable(),
	exes: z.array(ComputerUseWindowsExeRequirementSchema).nullable(),
});
const ComputerUseRequirementsSchema = looseObject({
	allowLockedComputerUse: z.boolean().nullable(),
	allowPersistentApproval: z.boolean().nullable(),
	defaultAppAccess: AllowDenyRequirementSchema.nullable(),
	macos: ComputerUseMacosRequirementsSchema.nullable(),
	windows: ComputerUseWindowsRequirementsSchema.nullable(),
});
export const BrowserUseOriginPolicySchema = looseObject({
	access: AllowDenyRequirementSchema.nullable(),
	downloads: AllowDenyRequirementSchema.nullable(),
	uploads: AllowDenyRequirementSchema.nullable(),
	fullCdpAccess: AllowDenyRequirementSchema.nullable(),
	autoReview: AllowDenyRequirementSchema.nullable(),
	persistentApproval: z.boolean().nullable(),
	accessApprovalLifetime: z.enum(["turn", "thread"]).nullable(),
});
const BrowserUseRequirementsSchema = looseObject({
	allowHistoryAccess: z.boolean().nullable(),
	disableAutoReview: z.boolean().nullable(),
	allowGlobalPersistentApproval: z.boolean().nullable(),
	defaultOriginPolicy: BrowserUseOriginPolicySchema.nullable(),
	/** Origin names are generated map keys supplied by managed requirements. */
	origins: z.record(z.string(), BrowserUseOriginPolicySchema).nullable(),
});
const InAppBrowserRequirementsSchema = looseObject({
	allowExternalBrowserSettingsImport: z.boolean().nullable(),
});
const ConfiguredHookHandlerSchema = z.discriminatedUnion("type", [
	looseObject({
		type: z.literal("command"),
		command: z.string(),
		commandWindows: z.string().nullable(),
		timeoutSec: IntegerSchema.nullable(),
		statusMessage: z.string().nullable(),
		async: z.boolean(),
		additionalContextLimit: FiniteNumberSchema.nullable(),
	}),
	looseObject({
		type: z.literal("mcp_tool"),
		server: z.string(),
		tool: z.string(),
		/** Hook tool input is the generated contract's open JSON object. */
		input: JsonRecordSchema,
		timeoutSec: IntegerSchema.nullable(),
		statusMessage: z.string().nullable(),
	}),
	looseObject({ type: z.literal("prompt") }),
	looseObject({ type: z.literal("agent") }),
]);
const ConfiguredHookMatcherGroupSchema = looseObject({
	matcher: z.string().nullable(),
	hooks: z.array(ConfiguredHookHandlerSchema),
});
const ManagedHooksRequirementsSchema = looseObject({
	managedDir: z.string().nullable(),
	windowsManagedDir: z.string().nullable(),
	PreToolUse: z.array(ConfiguredHookMatcherGroupSchema),
	PermissionRequest: z.array(ConfiguredHookMatcherGroupSchema),
	PostToolUse: z.array(ConfiguredHookMatcherGroupSchema),
	PreCompact: z.array(ConfiguredHookMatcherGroupSchema),
	PostCompact: z.array(ConfiguredHookMatcherGroupSchema),
	SessionStart: z.array(ConfiguredHookMatcherGroupSchema),
	SessionEnd: z.array(ConfiguredHookMatcherGroupSchema),
	UserPromptSubmit: z.array(ConfiguredHookMatcherGroupSchema),
	SubagentStart: z.array(ConfiguredHookMatcherGroupSchema),
	SubagentStop: z.array(ConfiguredHookMatcherGroupSchema),
	Stop: z.array(ConfiguredHookMatcherGroupSchema),
	Interrupt: z.array(ConfiguredHookMatcherGroupSchema),
});
const NetworkPermissionSchema = z.enum(["allow", "deny"]);
const NetworkRequirementsSchema = looseObject({
	enabled: z.boolean().nullable(),
	httpPort: FiniteNumberSchema.nullable(),
	socksPort: FiniteNumberSchema.nullable(),
	allowUpstreamProxy: z.boolean().nullable(),
	dangerouslyAllowNonLoopbackProxy: z.boolean().nullable(),
	dangerouslyAllowAllUnixSockets: z.boolean().nullable(),
	/** Domain names are generated map keys supplied by managed requirements. */
	domains: z.record(z.string(), NetworkPermissionSchema).nullable(),
	managedAllowedDomainsOnly: z.boolean().nullable(),
	allowedDomains: z.array(z.string()).nullable(),
	deniedDomains: z.array(z.string()).nullable(),
	/** Unix-socket names are generated map keys supplied by managed requirements. */
	unixSockets: z.record(z.string(), NetworkPermissionSchema).nullable(),
	allowUnixSockets: z.array(z.string()).nullable(),
	allowLocalBinding: z.boolean().nullable(),
});
const AutoReviewRequirementsSchema = looseObject({
	requiredOnModels: z.array(z.string()).nullable(),
	ignoreRules: z.array(z.string()).nullable(),
});
const ModelsRequirementsSchema = looseObject({
	newThread: looseObject({
		model: z.string().nullable(),
		modelReasoningEffort: ReasoningEffortSchema.nullable(),
		serviceTier: z.string().nullable(),
	}).nullable(),
});
const FeedbackRequirementsSchema = looseObject({ enabled: z.boolean().nullable() });

export const ConfigRequirementsSchema = looseObject({
	cliAuthCredentialsStore: CliAuthCredentialsStoreModeSchema.nullable(),
	chatgptBaseUrl: z.string().nullable(),
	additionalDeveloperInstructions: z.string().nullable(),
	allowedApprovalPolicies: z.array(AskForApprovalSchema).nullable(),
	allowedApprovalsReviewers: z.array(ApprovalsReviewerSchema).nullable(),
	allowedSandboxModes: z.array(SandboxModeSchema).nullable(),
	allowedWindowsSandboxImplementations: z.array(WindowsSandboxSetupModeSchema).nullable(),
	/** Permission profile ids are generated map keys supplied by managed requirements. */
	allowedPermissionProfiles: z.record(z.string(), z.boolean()).nullable(),
	defaultPermissions: z.string().nullable(),
	allowedWebSearchModes: z.array(WebSearchModeSchema).nullable(),
	allowManagedHooksOnly: z.boolean().nullable(),
	allowBrowserAndComputerUse: z.boolean().nullable(),
	allowAppshots: z.boolean().nullable(),
	allowRemoteControl: z.boolean().nullable(),
	computerUse: ComputerUseRequirementsSchema.nullable(),
	browserUse: BrowserUseRequirementsSchema.nullable(),
	inAppBrowser: InAppBrowserRequirementsSchema.nullable(),
	/** Feature names are generated map keys supplied by managed requirements. */
	featureRequirements: z.record(z.string(), z.boolean()).nullable(),
	hooks: ManagedHooksRequirementsSchema.nullable(),
	enforceResidency: z.enum(["us"]).nullable(),
	network: NetworkRequirementsSchema.nullable(),
	autoReview: AutoReviewRequirementsSchema.nullable(),
	models: ModelsRequirementsSchema.nullable(),
	sqliteHome: z.string().nullable(),
	logDir: z.string().nullable(),
	modelCatalogJson: z.string().nullable(),
	checkForUpdateOnStartup: z.boolean().nullable(),
	allowLoginShell: z.boolean().nullable(),
	feedback: FeedbackRequirementsSchema.nullable(),
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
const ModelUpgradeInfoSchema = looseObject({
	model: z.string(),
	upgradeCopy: z.string().nullable(),
	modelLink: z.string().nullable(),
	migrationMarkdown: z.string().nullable(),
	retirementAt: FiniteNumberSchema.nullable(),
});
const ModelAvailabilityNuxSchema = looseObject({ message: z.string() });
export const ModelSchema = looseObject({
	id: z.string(),
	model: z.string(),
	upgrade: z.string().nullable(),
	upgradeInfo: ModelUpgradeInfoSchema.nullable(),
	availabilityNux: ModelAvailabilityNuxSchema.nullable(),
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

const CollaborationModeSchema = looseObject({
	mode: z.enum(["plan", "default"]),
	settings: looseObject({
		model: z.string(),
		reasoning_effort: ReasoningEffortSchema.nullable(),
		developer_instructions: z.string().nullable(),
	}),
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
	collaborationMode: CollaborationModeSchema,
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
