import { z } from "zod";

import {
	ApprovalIdSchema,
	BrowserCommandIdSchema,
	ChildEpochSchema,
	ChildIdSchema,
	DynamicToolCallIdSchema,
	ItemIdSchema,
	JsonRpcRequestIdSchema,
	JsonValueSchema,
	LoginIdSchema,
	QueuedSubmissionIdSchema,
	RealtimeSessionIdSchema,
	ThreadIdSchema,
	TurnIdSchema,
	boundedText,
	optionalNullableText,
	SafeUrlSchema,
} from "./scalars.js";
import { LoginAccountParamsSchema } from "./authored.js";

const NullableReasonSchema = optionalNullableText(512);
const PaneIdSchema = boundedText(128);
const TimestampSchema = z.number().int().nonnegative();
export const DeliveryOutcomeSchema = z.enum(["delivered", "not_delivered", "outcome_unknown"]);

export const BrowserReadinessSchema = z.discriminatedUnion("state", [
	z
		.object({ kind: z.literal("readiness"), state: z.literal("stopped"), reason: boundedText(512) })
		.strict(),
	z
		.object({
			kind: z.literal("readiness"),
			state: z.literal("backoff"),
			retryAtMs: TimestampSchema,
			reason: boundedText(512),
		})
		.strict(),
	z.object({ kind: z.literal("readiness"), state: z.literal("initialized") }).strict(),
	z
		.object({
			kind: z.literal("readiness"),
			state: z.literal("storage_mismatch"),
			reason: boundedText(512),
		})
		.strict(),
	z.object({ kind: z.literal("readiness"), state: z.literal("login_capable") }).strict(),
	z.object({ kind: z.literal("readiness"), state: z.literal("signed_out") }).strict(),
	z
		.object({
			kind: z.literal("readiness"),
			state: z.literal("login_pending"),
			loginId: LoginIdSchema,
		})
		.strict(),
	z.object({ kind: z.literal("readiness"), state: z.literal("account_ready") }).strict(),
	z.object({ kind: z.literal("readiness"), state: z.literal("thread_capable") }).strict(),
	z
		.object({
			kind: z.literal("readiness"),
			state: z.literal("reconnecting"),
			reason: boundedText(512),
		})
		.strict(),
	z
		.object({
			kind: z.literal("readiness"),
			state: z.literal("incompatible_contract"),
			reason: boundedText(512),
		})
		.strict(),
]);

export const BrowserAccountSchema = z.discriminatedUnion("state", [
	z
		.object({ kind: z.literal("account"), state: z.literal("unknown"), reason: boundedText(512) })
		.strict(),
	z.object({ kind: z.literal("account"), state: z.literal("signed_out") }).strict(),
	z
		.object({
			kind: z.literal("account"),
			state: z.literal("login_pending"),
			loginId: LoginIdSchema,
			variant: z.enum(["apiKey", "chatgpt", "amazonBedrock", "amazonBedrockAccessKeys"]),
		})
		.strict(),
	z
		.object({
			kind: z.literal("account"),
			state: z.literal("ready"),
			accountType: z.enum(["apiKey", "chatgpt", "amazonBedrock"]),
		})
		.strict(),
	z
		.object({ kind: z.literal("account"), state: z.literal("failed"), reason: boundedText(512) })
		.strict(),
]);

export const BrowserLoginSchema = z.discriminatedUnion("state", [
	z.object({ kind: z.literal("login"), state: z.literal("idle") }).strict(),
	z
		.object({
			kind: z.literal("login"),
			state: z.literal("pending"),
			loginId: LoginIdSchema,
			variant: z.enum(["apiKey", "chatgpt", "amazonBedrock", "amazonBedrockAccessKeys"]),
		})
		.strict(),
	z
		.object({ kind: z.literal("login"), state: z.literal("completed"), loginId: LoginIdSchema })
		.strict(),
	z
		.object({ kind: z.literal("login"), state: z.literal("cancelled"), loginId: LoginIdSchema })
		.strict(),
	z
		.object({
			kind: z.literal("login"),
			state: z.literal("failed"),
			loginId: LoginIdSchema.nullable(),
			reason: boundedText(512),
		})
		.strict(),
]);

const ThreadStatusSchema = z.enum(["notLoaded", "idle", "systemError", "active"]);
const ThreadSourceSchema = z.enum(["cli", "vscode", "exec", "appServer"]);
const ThreadLinkStateSchema = z.enum(["executable", "inspect_only", "unbound"]);

export const BrowserThreadLinkSchema = z
	.object({
		kind: z.literal("thread_link"),
		state: ThreadLinkStateSchema,
		childId: ChildIdSchema.nullable(),
		epoch: ChildEpochSchema.nullable(),
		threadId: ThreadIdSchema.nullable(),
		source: ThreadSourceSchema.nullable(),
		status: ThreadStatusSchema.nullable(),
		loaded: z.boolean(),
		canAcceptDirectInput: z.boolean().nullable(),
		reason: NullableReasonSchema,
	})
	.strict();

const BrowserTimelineItemSchema = z.discriminatedUnion("media", [
	z.object({ media: z.literal("text"), itemId: ItemIdSchema, text: boundedText(16_384) }).strict(),
	z
		.object({
			media: z.literal("tool"),
			itemId: ItemIdSchema,
			name: boundedText(256),
			status: z.enum(["inProgress", "completed", "failed"]),
		})
		.strict(),
	z
		.object({
			media: z.literal("command"),
			itemId: ItemIdSchema,
			command: boundedText(16_384),
			status: z.enum(["inProgress", "completed", "failed", "declined"]),
		})
		.strict(),
	z
		.object({
			media: z.literal("fileChange"),
			itemId: ItemIdSchema,
			status: z.enum(["inProgress", "completed", "failed", "declined"]),
		})
		.strict(),
	z
		.object({ media: z.literal("reasoning"), itemId: ItemIdSchema, text: boundedText(16_384) })
		.strict(),
	z.object({ media: z.literal("plan"), itemId: ItemIdSchema, text: boundedText(16_384) }).strict(),
	z
		.object({
			media: z.literal("approval"),
			itemId: ItemIdSchema,
			approvalId: ApprovalIdSchema,
			status: z.enum(["pending", "resolved", "cancelled"]),
		})
		.strict(),
]);

const BrowserTimelineTurnSchema = z
	.object({
		turnId: TurnIdSchema,
		status: z.enum(["inProgress", "completed", "interrupted", "failed"]),
		items: z.array(BrowserTimelineItemSchema),
		summary: boundedText(512),
		outputsIncluded: z.boolean(),
		outputsTruncated: z.boolean(),
	})
	.strict();

export const BrowserTimelineSchema = z
	.object({
		kind: z.literal("timeline"),
		threadId: ThreadIdSchema,
		turns: z.array(BrowserTimelineTurnSchema),
		nextCursor: boundedText(1024).nullable(),
	})
	.strict();

const QueueStatusSchema = z.enum([
	"empty",
	"queued",
	"running",
	"interrupted",
	"approval_blocked",
	"failed",
	"completed",
	"stale",
	"reconnecting",
	"unavailable",
	"outcome_unknown",
]);
const BrowserQueueEntrySchema = z
	.object({
		submissionId: QueuedSubmissionIdSchema,
		prompt: boundedText(16_384),
		status: QueueStatusSchema,
		operationId: DynamicToolCallIdSchema.nullable(),
	})
	.strict();

export const BrowserQueueSchema = z
	.object({
		kind: z.literal("queue"),
		status: QueueStatusSchema,
		entries: z.array(BrowserQueueEntrySchema),
	})
	.strict();

const SandboxPolicySchema = z.discriminatedUnion("type", [
	z.object({ type: z.literal("dangerFullAccess") }).strict(),
	z.object({ type: z.literal("readOnly"), networkAccess: z.boolean() }).strict(),
	z
		.object({
			type: z.literal("externalSandbox"),
			networkAccess: z.enum(["restricted", "enabled"]),
		})
		.strict(),
	z
		.object({
			type: z.literal("workspaceWrite"),
			writableRoots: z.array(boundedText(16_384)),
			networkAccess: z.boolean(),
			excludeTmpdirEnvVar: z.boolean(),
			excludeSlashTmp: z.boolean(),
		})
		.strict(),
]);
const ActivePermissionProfileSchema = z
	.object({ id: boundedText(256), extends: boundedText(256).nullable() })
	.strict();

export const BrowserSettingsSchema = z
	.object({
		kind: z.literal("settings"),
		owner: z.enum(["workhorse", "coordinator"]),
		model: boundedText(256),
		effort: boundedText(64).nullable(),
		serviceTier: boundedText(64).nullable(),
		approvalPolicy: z.union([
			z.enum(["untrusted", "on-request", "never"]),
			z
				.object({
					granular: z
						.object({
							sandbox_approval: z.boolean(),
							rules: z.boolean(),
							skill_approval: z.boolean(),
							request_permissions: z.boolean(),
							mcp_elicitations: z.boolean(),
						})
						.strict(),
				})
				.strict(),
		]),
		approvalsReviewer: z.enum(["user", "auto_review", "guardian_subagent"]),
		sandboxPolicy: SandboxPolicySchema,
		activePermissionProfile: ActivePermissionProfileSchema.nullable(),
	})
	.strict();

const ApprovalEnvelope = {
	requestId: JsonRpcRequestIdSchema,
	threadId: ThreadIdSchema,
	turnId: TurnIdSchema.nullable(),
	itemId: ItemIdSchema.nullable(),
	approvalId: ApprovalIdSchema.nullable(),
	expiresAtMs: TimestampSchema,
};
const ApprovalReason = { reason: NullableReasonSchema };
const ApprovalCommandSchema = z
	.object({
		kind: z.literal("approval"),
		approvalKind: z.literal("command_execution"),
		...ApprovalEnvelope,
		...ApprovalReason,
		command: boundedText(16_384).nullable(),
		cwd: boundedText(16_384).nullable(),
		availableDecisions: z.array(z.enum(["accept", "acceptForSession", "decline", "cancel"])),
	})
	.strict();
const FileApprovalSchema = z
	.object({
		kind: z.literal("approval"),
		approvalKind: z.literal("file_change"),
		...ApprovalEnvelope,
		...ApprovalReason,
		grantRoot: boundedText(16_384).nullable(),
	})
	.strict();
const UserInputApprovalSchema = z
	.object({
		kind: z.literal("approval"),
		approvalKind: z.literal("user_input"),
		...ApprovalEnvelope,
		questions: z.array(
			z
				.object({
					id: boundedText(256),
					header: boundedText(256),
					question: boundedText(4096),
					isOther: z.boolean(),
					isSecret: z.boolean(),
					options: z
						.array(z.object({ label: boundedText(256), description: boundedText(2048) }).strict())
						.nullable(),
				})
				.strict(),
		),
	})
	.strict();
const ElicitationApprovalSchema = z
	.object({
		kind: z.literal("approval"),
		approvalKind: z.literal("elicitation"),
		...ApprovalEnvelope,
		serverName: boundedText(256),
		mode: z.enum(["form", "openai/form", "url"]),
		message: boundedText(16_384),
		url: SafeUrlSchema.nullable(),
		fields: z
			.array(
				z
					.object({
						name: boundedText(256),
						type: z.enum(["string", "number", "integer", "boolean", "enum"]),
						required: z.boolean(),
						secret: z.boolean(),
					})
					.strict(),
			)
			.nullable(),
	})
	.strict();
const PermissionsApprovalSchema = z
	.object({
		kind: z.literal("approval"),
		approvalKind: z.literal("permissions"),
		...ApprovalEnvelope,
		...ApprovalReason,
		cwd: boundedText(16_384),
		network: z.boolean().nullable(),
		fileSystem: z.enum(["read", "write", "deny"]).nullable(),
	})
	.strict();
const PatchApprovalSchema = z
	.object({
		kind: z.literal("approval"),
		approvalKind: z.literal("apply_patch"),
		...ApprovalEnvelope,
		...ApprovalReason,
		grantRoot: boundedText(16_384).nullable(),
		fileCount: z.number().int().nonnegative(),
	})
	.strict();
const ExecApprovalSchema = z
	.object({
		kind: z.literal("approval"),
		approvalKind: z.literal("exec_command"),
		...ApprovalEnvelope,
		...ApprovalReason,
		command: z.array(boundedText(16_384)),
		cwd: boundedText(16_384),
	})
	.strict();

export const BrowserApprovalSchema = z.discriminatedUnion("approvalKind", [
	ApprovalCommandSchema,
	FileApprovalSchema,
	UserInputApprovalSchema,
	ElicitationApprovalSchema,
	PermissionsApprovalSchema,
	PatchApprovalSchema,
	ExecApprovalSchema,
]);

const TargetSchema = {
	commandId: BrowserCommandIdSchema,
	paneId: PaneIdSchema,
	childId: ChildIdSchema,
	epoch: ChildEpochSchema,
};

export const BrowserTextCommandSchema = z.discriminatedUnion("command", [
	z
		.object({
			kind: z.literal("text_command"),
			command: z.literal("start"),
			...TargetSchema,
			threadId: ThreadIdSchema,
			prompt: boundedText(16_384),
		})
		.strict(),
	z
		.object({
			kind: z.literal("text_command"),
			command: z.literal("steer"),
			...TargetSchema,
			threadId: ThreadIdSchema,
			turnId: TurnIdSchema,
			prompt: boundedText(16_384),
		})
		.strict(),
	z
		.object({
			kind: z.literal("text_command"),
			command: z.literal("interrupt"),
			...TargetSchema,
			threadId: ThreadIdSchema,
			turnId: TurnIdSchema,
		})
		.strict(),
]);

export const BrowserSemanticDeliverySchema = z
	.object({
		kind: z.literal("semantic_delivery"),
		threadId: ThreadIdSchema,
		delivery: DeliveryOutcomeSchema,
		capturedAtMs: TimestampSchema,
		freshUntilMs: TimestampSchema,
		reason: NullableReasonSchema,
	})
	.strict();

export const BrowserCoordinatorSchema = z
	.object({
		kind: z.literal("coordinator"),
		state: z.enum(["unbound", "starting", "ready", "active", "reconnecting", "failed"]),
		threadId: ThreadIdSchema.nullable(),
		activeTurnId: TurnIdSchema.nullable(),
		model: boundedText(256).nullable(),
		effort: boundedText(64).nullable(),
		serviceTier: boundedText(64).nullable(),
		reason: NullableReasonSchema,
	})
	.strict();

const VoiceTranscriptSchema = z
	.object({
		itemId: ItemIdSchema,
		sequence: z.number().int().nonnegative(),
		speaker: z.enum(["user", "assistant"]),
		text: boundedText(16_384),
		final: z.boolean(),
	})
	.strict();

export const BrowserVoiceSchema = z
	.object({
		kind: z.literal("voice"),
		state: z.enum([
			"unavailable",
			"ready",
			"starting",
			"active",
			"recovering",
			"stopping",
			"failed",
		]),
		realtimeSessionId: RealtimeSessionIdSchema.nullable(),
		transcript: z.array(VoiceTranscriptSchema),
		delivery: DeliveryOutcomeSchema.nullable(),
		reason: NullableReasonSchema,
	})
	.strict();

export const BrowserCommandLeaseSchema = z
	.object({
		kind: z.literal("command_lease"),
		commandId: BrowserCommandIdSchema,
		paneId: PaneIdSchema,
		childId: ChildIdSchema,
		epoch: ChildEpochSchema,
		state: z.enum(["active", "expired", "released"]),
		expiresAtMs: TimestampSchema,
	})
	.strict();

export const BrowserOperationOutcomeSchema = z
	.object({
		kind: z.literal("operation_outcome"),
		operationId: BrowserCommandIdSchema,
		outcome: DeliveryOutcomeSchema,
		message: NullableReasonSchema,
	})
	.strict();

const BrowserCommandBase = {
	kind: z.literal("browser_command"),
	...TargetSchema,
};
const BrowserThreadIdCommand = { threadId: ThreadIdSchema };

export const BrowserCommandSchema = z.discriminatedUnion("command", [
	z
		.object({
			...BrowserCommandBase,
			command: z.literal("accountLogin"),
			login: LoginAccountParamsSchema,
		})
		.strict(),
	z
		.object({
			...BrowserCommandBase,
			command: z.literal("accountLoginCancel"),
			loginId: LoginIdSchema,
		})
		.strict(),
	z.object({ ...BrowserCommandBase, command: z.literal("accountLogout") }).strict(),
	z.object({ ...BrowserCommandBase, command: z.literal("threadLinkCreate") }).strict(),
	z
		.object({
			...BrowserCommandBase,
			command: z.literal("threadLinkAttach"),
			...BrowserThreadIdCommand,
		})
		.strict(),
	z
		.object({
			...BrowserCommandBase,
			command: z.literal("threadLinkRelink"),
			...BrowserThreadIdCommand,
		})
		.strict(),
	z
		.object({ ...BrowserCommandBase, command: z.literal("queueAdd"), prompt: boundedText(16_384) })
		.strict(),
	z
		.object({
			...BrowserCommandBase,
			command: z.literal("queueUpdate"),
			submissionId: QueuedSubmissionIdSchema,
			prompt: boundedText(16_384),
		})
		.strict(),
	z
		.object({
			...BrowserCommandBase,
			command: z.literal("queueDelete"),
			submissionId: QueuedSubmissionIdSchema,
		})
		.strict(),
	z
		.object({
			...BrowserCommandBase,
			command: z.literal("queueReorder"),
			orderedSubmissionIds: z.array(QueuedSubmissionIdSchema).min(1).max(100),
		})
		.strict(),
	z
		.object({
			...BrowserCommandBase,
			command: z.literal("queueStart"),
			submissionId: QueuedSubmissionIdSchema,
		})
		.strict(),
	z
		.object({
			...BrowserCommandBase,
			command: z.literal("approvalRespond"),
			requestId: JsonRpcRequestIdSchema,
			approvalId: ApprovalIdSchema.nullable(),
			decision: z.enum(["accept", "decline", "cancel"]),
			values: JsonValueSchema.optional(),
		})
		.strict(),
	z
		.object({
			...BrowserCommandBase,
			command: z.literal("realtimeStart"),
			threadId: ThreadIdSchema,
			sdp: boundedText(16_384),
		})
		.strict(),
	z
		.object({
			...BrowserCommandBase,
			command: z.literal("realtimeAppendText"),
			threadId: ThreadIdSchema,
			text: boundedText(4096),
		})
		.strict(),
	z
		.object({ ...BrowserCommandBase, command: z.literal("realtimeStop"), threadId: ThreadIdSchema })
		.strict(),
	z
		.object({
			...BrowserCommandBase,
			command: z.literal("start"),
			threadId: ThreadIdSchema,
			prompt: boundedText(16_384),
		})
		.strict(),
	z
		.object({
			...BrowserCommandBase,
			command: z.literal("steer"),
			threadId: ThreadIdSchema,
			turnId: TurnIdSchema,
			prompt: boundedText(16_384),
		})
		.strict(),
	z
		.object({
			...BrowserCommandBase,
			command: z.literal("interrupt"),
			threadId: ThreadIdSchema,
			turnId: TurnIdSchema,
		})
		.strict(),
]);

export const BrowserSnapshotSchema = z
	.object({
		kind: z.literal("snapshot"),
		version: z.literal(1),
		readiness: BrowserReadinessSchema,
		account: BrowserAccountSchema,
		login: BrowserLoginSchema,
		threadLink: BrowserThreadLinkSchema,
		timeline: BrowserTimelineSchema.nullable(),
		queue: BrowserQueueSchema,
		settings: z.array(BrowserSettingsSchema),
		approvals: z.array(BrowserApprovalSchema),
		semantic: BrowserSemanticDeliverySchema.nullable(),
		coordinator: BrowserCoordinatorSchema,
		voice: BrowserVoiceSchema,
		lease: BrowserCommandLeaseSchema.nullable(),
		operation: BrowserOperationOutcomeSchema.nullable(),
	})
	.strict();

export const BrowserToolResultSchema = z
	.object({
		contentItems: z.tuple([
			z.object({ type: z.literal("inputText"), text: boundedText(16_384) }).strict(),
		]),
		success: z.boolean(),
	})
	.strict();

export const BrowserDtoSchema = z.union([
	BrowserSnapshotSchema,
	BrowserReadinessSchema,
	BrowserAccountSchema,
	BrowserLoginSchema,
	BrowserThreadLinkSchema,
	BrowserTimelineSchema,
	BrowserQueueSchema,
	BrowserSettingsSchema,
	BrowserApprovalSchema,
	BrowserTextCommandSchema,
	BrowserSemanticDeliverySchema,
	BrowserCoordinatorSchema,
	BrowserVoiceSchema,
	BrowserCommandLeaseSchema,
	BrowserOperationOutcomeSchema,
	BrowserCommandSchema,
]);

export type BrowserReadiness = z.infer<typeof BrowserReadinessSchema>;
export type BrowserAccount = z.infer<typeof BrowserAccountSchema>;
export type BrowserLogin = z.infer<typeof BrowserLoginSchema>;
export type BrowserThreadLink = z.infer<typeof BrowserThreadLinkSchema>;
export type BrowserTimeline = z.infer<typeof BrowserTimelineSchema>;
export type BrowserQueue = z.infer<typeof BrowserQueueSchema>;
export type BrowserSettings = z.infer<typeof BrowserSettingsSchema>;
export type BrowserApproval = z.infer<typeof BrowserApprovalSchema>;
export type BrowserTextCommand = z.infer<typeof BrowserTextCommandSchema>;
export type BrowserSemanticDelivery = z.infer<typeof BrowserSemanticDeliverySchema>;
export type BrowserCoordinator = z.infer<typeof BrowserCoordinatorSchema>;
export type BrowserVoice = z.infer<typeof BrowserVoiceSchema>;
export type BrowserCommandLease = z.infer<typeof BrowserCommandLeaseSchema>;
export type BrowserOperationOutcome = z.infer<typeof BrowserOperationOutcomeSchema>;
export type BrowserCommand = z.infer<typeof BrowserCommandSchema>;
export type BrowserToolResult = z.infer<typeof BrowserToolResultSchema>;
export type BrowserSnapshot = z.infer<typeof BrowserSnapshotSchema>;
export type BrowserDto = z.infer<typeof BrowserDtoSchema>;
export type DeliveryOutcome = z.infer<typeof DeliveryOutcomeSchema>;
