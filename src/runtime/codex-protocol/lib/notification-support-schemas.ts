import { z } from "zod";

import {
	NetworkApprovalProtocolSchema,
	RequestPermissionProfileSchema,
} from "./approval-schemas.js";
import { TokenUsageBreakdownSchema } from "./config-schemas.js";
import { ResponseItemSchema, ResponseUsageMetadataSchema } from "./response-item-schemas.js";
import { FiniteNumberSchema, IntegerSchema, JsonValueSchema, looseObject } from "./scalars.js";

export const HookRunSummarySchema = looseObject({
	id: z.string(),
	eventName: z.enum([
		"preToolUse",
		"permissionRequest",
		"postToolUse",
		"preCompact",
		"postCompact",
		"sessionStart",
		"sessionEnd",
		"userPromptSubmit",
		"subagentStart",
		"subagentStop",
		"stop",
		"interrupt",
	]),
	handlerType: z.enum(["command", "mcpTool", "prompt", "agent"]),
	executionMode: z.enum(["sync", "async"]),
	scope: z.enum(["thread", "turn"]),
	sourcePath: z.string(),
	source: z.enum([
		"system",
		"user",
		"project",
		"mdm",
		"sessionFlags",
		"plugin",
		"cloudRequirements",
		"cloudManagedConfig",
		"legacyManagedConfigFile",
		"legacyManagedConfigMdm",
		"unknown",
	]),
	displayOrder: IntegerSchema,
	status: z.enum(["running", "completed", "failed", "blocked", "stopped"]),
	statusMessage: z.string().nullable(),
	startedAt: IntegerSchema,
	completedAt: IntegerSchema.nullable(),
	durationMs: IntegerSchema.nullable(),
	entries: z.array(
		looseObject({
			kind: z.enum(["warning", "stop", "feedback", "context", "error"]),
			text: z.string(),
		}),
	),
});

const GuardianApprovalReviewSchema = looseObject({
	status: z.enum(["inProgress", "approved", "denied", "timedOut", "aborted"]),
	riskLevel: z.enum(["low", "medium", "high", "critical"]).nullable(),
	userAuthorization: z.enum(["unknown", "low", "medium", "high"]).nullable(),
	rationale: z.string().nullable(),
});

const GuardianApprovalReviewActionSchema = z.discriminatedUnion("type", [
	looseObject({
		type: z.literal("command"),
		source: z.enum(["shell", "unifiedExec"]),
		command: z.string(),
		cwd: z.string(),
	}),
	looseObject({
		type: z.literal("execve"),
		source: z.enum(["shell", "unifiedExec"]),
		program: z.string(),
		argv: z.array(z.string()),
		cwd: z.string(),
	}),
	looseObject({
		type: z.literal("writeStdin"),
		approvalId: z.string(),
		processId: z.string(),
		stdin: z.string(),
		cwd: z.string(),
	}),
	looseObject({ type: z.literal("applyPatch"), cwd: z.string(), files: z.array(z.string()) }),
	looseObject({
		type: z.literal("networkAccess"),
		target: z.string(),
		host: z.string(),
		protocol: NetworkApprovalProtocolSchema,
		port: FiniteNumberSchema,
	}),
	looseObject({
		type: z.literal("mcpToolCall"),
		server: z.string(),
		toolName: z.string(),
		connectorId: z.string().nullable(),
		connectorName: z.string().nullable(),
		toolTitle: z.string().nullable(),
	}),
	looseObject({
		type: z.literal("requestPermissions"),
		reason: z.string().nullable(),
		permissions: RequestPermissionProfileSchema,
	}),
]);

export const AutoApprovalReviewStartedSchema = looseObject({
	threadId: z.string(),
	turnId: z.string(),
	startedAtMs: FiniteNumberSchema,
	reviewId: z.string(),
	targetItemId: z.string().nullable(),
	review: GuardianApprovalReviewSchema,
	action: GuardianApprovalReviewActionSchema,
});
export const AutoApprovalReviewCompletedSchema = looseObject({
	threadId: z.string(),
	turnId: z.string(),
	startedAtMs: FiniteNumberSchema,
	completedAtMs: FiniteNumberSchema,
	reviewId: z.string(),
	targetItemId: z.string().nullable(),
	decisionSource: z.literal("agent"),
	review: GuardianApprovalReviewSchema,
	action: GuardianApprovalReviewActionSchema,
});
export const StrictReviewRequiredSchema = looseObject({
	threadId: z.string(),
	turnId: z.string(),
	startedAtMs: FiniteNumberSchema,
});

export const CommandExecOutputDeltaSchema = looseObject({
	processId: z.string(),
	stream: z.enum(["stdout", "stderr"]),
	deltaBase64: z.string(),
	capReached: z.boolean(),
});
export const ProcessOutputDeltaSchema = looseObject({
	processHandle: z.string(),
	stream: z.enum(["stdout", "stderr"]),
	deltaBase64: z.string(),
	capReached: z.boolean(),
});
export const ProcessExitedSchema = looseObject({
	processHandle: z.string(),
	exitCode: FiniteNumberSchema,
	stdout: z.string(),
	stdoutCapReached: z.boolean(),
	stderr: z.string(),
	stderrCapReached: z.boolean(),
});

const AppBrandingSchema = looseObject({
	category: z.string().nullable(),
	developer: z.string().nullable(),
	website: z.string().nullable(),
	privacyPolicy: z.string().nullable(),
	termsOfService: z.string().nullable(),
	isDiscoverableApp: z.boolean(),
});
const AppMetadataSchema = looseObject({
	review: looseObject({ status: z.string() }).nullable(),
	categories: z.array(z.string()).nullable(),
	subCategories: z.array(z.string()).nullable(),
	seoDescription: z.string().nullable(),
	screenshots: z
		.array(
			looseObject({
				url: z.string().nullable(),
				fileId: z.string().nullable(),
				userPrompt: z.string(),
			}),
		)
		.nullable(),
	developer: z.string().nullable(),
	version: z.string().nullable(),
	versionId: z.string().nullable(),
	versionNotes: z.string().nullable(),
	firstPartyRequiresInstall: z.boolean().nullable(),
	showInComposerWhenUnlinked: z.boolean().nullable(),
});
export const AppInfoSchema = looseObject({
	id: z.string(),
	name: z.string(),
	description: z.string().nullable(),
	logoUrl: z.string().nullable(),
	logoUrlDark: z.string().nullable(),
	/** Asset names are generated string-keyed maps from the app registry. */
	iconAssets: z.record(z.string(), z.string()).nullable(),
	iconDarkAssets: z.record(z.string(), z.string()).nullable(),
	distributionChannel: z.string().nullable(),
	branding: AppBrandingSchema.nullable(),
	appMetadata: AppMetadataSchema.nullable(),
	/** Label names are generated string-keyed maps from the app registry. */
	labels: z.record(z.string(), z.string()).nullable(),
	installUrl: z.string().nullable(),
	isAccessible: z.boolean(),
	isEnabled: z.boolean(),
	pluginDisplayNames: z.array(z.string()),
});

const ExternalAgentConfigMigrationItemTypeSchema = z.enum([
	"AGENTS_MD",
	"CONFIG",
	"SKILLS",
	"PLUGINS",
	"MCP_SERVER_CONFIG",
	"SUBAGENTS",
	"HOOKS",
	"COMMANDS",
	"MEMORY",
	"SESSIONS",
]);
const ExternalAgentConfigImportItemTypeSuccessSchema = looseObject({
	itemType: ExternalAgentConfigMigrationItemTypeSchema,
	cwd: z.string().nullable(),
	source: z.string().nullable(),
	target: z.string().nullable(),
	title: z.string().nullable(),
});
const ExternalAgentConfigImportItemTypeFailureSchema = looseObject({
	itemType: ExternalAgentConfigMigrationItemTypeSchema,
	errorType: z.string().nullable(),
	subErrorType: z.string().nullable(),
	failureStage: z.string(),
	message: z.string(),
	cwd: z.string().nullable(),
	source: z.string().nullable(),
});
const ExternalAgentConfigImportTypeResultSchema = looseObject({
	itemType: ExternalAgentConfigMigrationItemTypeSchema,
	successes: z.array(ExternalAgentConfigImportItemTypeSuccessSchema),
	failures: z.array(ExternalAgentConfigImportItemTypeFailureSchema),
});
export const ExternalAgentConfigImportProgressSchema = looseObject({
	importId: z.string(),
	itemTypeResults: z.array(ExternalAgentConfigImportTypeResultSchema),
});
export const ExternalAgentConfigImportCompletedSchema = ExternalAgentConfigImportProgressSchema;

export const FuzzyFileSearchResultSchema = looseObject({
	root: z.string(),
	path: z.string(),
	match_type: z.enum(["file", "directory"]),
	file_name: z.string(),
	score: FiniteNumberSchema,
	indices: z.array(FiniteNumberSchema).nullable(),
});

const TextPositionSchema = looseObject({ line: FiniteNumberSchema, column: FiniteNumberSchema });
export const TextRangeSchema = looseObject({
	start: TextPositionSchema,
	end: TextPositionSchema,
});

export const McpServerEventStreamNotificationSchema = looseObject({
	subscriptionId: z.string(),
	notification: looseObject({
		method: z.string(),
		/** MCP event parameters are the generated protocol's open JSON payload. */
		params: JsonValueSchema,
	}),
});
export const McpServerStartupStatusUpdatedSchema = looseObject({
	threadId: z.string().nullable(),
	name: z.string(),
	status: z.enum(["starting", "ready", "failed", "cancelled"]),
	error: z.string().nullable(),
	failureReason: z.literal("reauthenticationRequired").nullable(),
});
export const RemoteControlStatusChangedSchema = looseObject({
	status: z.enum(["disabled", "connecting", "connected", "errored"]),
	serverName: z.string(),
	installationId: z.string(),
	environmentId: z.string().nullable(),
});

export const RawResponseItemCompletedSchema = looseObject({
	threadId: z.string(),
	turnId: z.string(),
	item: ResponseItemSchema,
});
export const RawResponseCompletedSchema = looseObject({
	threadId: z.string(),
	turnId: z.string(),
	responseId: z.string(),
	usage: TokenUsageBreakdownSchema.nullable(),
	usageMetadata: ResponseUsageMetadataSchema.nullable(),
});

export const ThreadRealtimeItemAddedSchema = looseObject({
	threadId: z.string(),
	/** Raw non-audio realtime items are intentionally JsonValue in generated code. */
	item: JsonValueSchema,
});
export const TurnModerationMetadataSchema = looseObject({
	threadId: z.string(),
	turnId: z.string(),
	/** Moderation metadata is intentionally open JsonValue in generated code. */
	metadata: JsonValueSchema,
});

export const AccountLoginCompletedSchema = looseObject({
	success: z.boolean(),
	error: z.string().nullable(),
	loginId: z.string().nullable(),
	onboardingEntrypoint: z.literal("life_sciences").nullable(),
});
