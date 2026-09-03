import { z } from "zod";

import {
	CodexFileChangeApprovalDecisionSchema,
	CodexThreadStatusTypeSchema,
	CodexTurnStatusSchema,
	createCodexCommandExecutionApprovalDecisionSchema,
} from "../../codex-app-server-contract/index.js";
import type { CodexResponseByMethod } from "../../codex-app-server-contract/index.js";

import { SupportedLoginAccountParamsSchema } from "./authored.js";
import { createDynamicApprovalSchemas } from "./dynamic-approval.js";
import {
	assertCurrentTarget,
	boundedText,
	JsonValueSchema,
	optionalNullableText,
	SafeUrlSchema,
} from "./scalars.js";
import type { IdentityContext, IdentitySchemas } from "./scalars.js";

const TimestampSchema = z.number().int().nonnegative();
export const DeliveryOutcomeSchema = z.enum(["delivered", "not_delivered", "outcome_unknown"]);

export interface BrowserSnapshotRelationshipIssue {
	readonly path: readonly string[];
	readonly message: string;
}

interface BrowserSnapshotRelationshipFields {
	readonly threadLink: {
		readonly state: string;
		readonly threadId: string | null;
	};
	readonly timeline: { readonly threadId: string } | null;
	readonly semantic: { readonly threadId: string } | null;
}

/** Checks relationships between fields after each field has passed its own schema. */
export function browserSnapshotRelationshipIssues(
	value: BrowserSnapshotRelationshipFields,
): readonly BrowserSnapshotRelationshipIssue[] {
	const issues: BrowserSnapshotRelationshipIssue[] = [];
	for (const [name, threadId] of [
		["timeline", value.timeline?.threadId],
		["semantic", value.semantic?.threadId],
	] as const) {
		if (threadId !== null && threadId !== undefined && value.threadLink.threadId !== threadId)
			issues.push({
				path: [name, "threadId"],
				message: "thread identity contradicts the current thread link",
			});
	}
	if (value.threadLink.state === "unbound" && (value.timeline !== null || value.semantic !== null))
		issues.push({
			path: ["threadLink", "state"],
			message: "an unbound link cannot publish thread-scoped state",
		});
	return issues;
}

function addContextIssue(context: z.RefinementCtx, error: unknown, path: string[]): void {
	context.addIssue({
		code: "custom",
		path,
		message: error instanceof Error ? error.message : "identity is not current",
	});
}

export function createBrowserSchemas(identity: IdentitySchemas, context: IdentityContext) {
	const {
		ApprovalIdSchema,
		BrowserCommandIdSchema,
		ChildEpochSchema,
		ChildIdSchema,
		DynamicToolCallIdSchema,
		ItemIdSchema,
		JsonRpcRequestIdSchema,
		LoginIdSchema,
		QueuedSubmissionIdSchema,
		RealtimeSessionIdSchema,
		ThreadIdSchema,
		TurnIdSchema,
	} = identity;
	const dynamic = createDynamicApprovalSchemas(identity, context);
	const NullableReasonSchema = optionalNullableText(512);
	const PaneIdSchema = boundedText(128);

	const BrowserReadinessSchema = z.union([
		z
			.object({
				kind: z.literal("readiness"),
				state: z.literal("stopped"),
				reason: boundedText(512),
			})
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

	const SupportedLoginVariantSchema = z.enum([
		"apiKey",
		"chatgpt",
		"amazonBedrock",
		"amazonBedrockAccessKeys",
	]);
	type CodexAccountType = NonNullable<CodexResponseByMethod["account/read"]["account"]>["type"];
	const CodexAccountTypeSchema = z.enum([
		"apiKey",
		"chatgpt",
		"amazonBedrock",
	] satisfies readonly CodexAccountType[]);
	const BrowserAccountSchema = z.union([
		z
			.object({ kind: z.literal("account"), state: z.literal("unknown"), reason: boundedText(512) })
			.strict(),
		z.object({ kind: z.literal("account"), state: z.literal("signed_out") }).strict(),
		z
			.object({
				kind: z.literal("account"),
				state: z.literal("login_pending"),
				loginId: LoginIdSchema,
				variant: SupportedLoginVariantSchema,
			})
			.strict(),
		z
			.object({
				kind: z.literal("account"),
				state: z.literal("ready"),
				accountType: CodexAccountTypeSchema,
			})
			.strict(),
		z
			.object({ kind: z.literal("account"), state: z.literal("failed"), reason: boundedText(512) })
			.strict(),
	]);

	const BrowserLoginSchema = z.union([
		z.object({ kind: z.literal("login"), state: z.literal("idle") }).strict(),
		z
			.object({
				kind: z.literal("login"),
				state: z.literal("pending"),
				loginId: LoginIdSchema,
				variant: SupportedLoginVariantSchema,
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

	const ThreadLinkStatusSchema = CodexThreadStatusTypeSchema;
	const ExecutableThreadSourceSchema = z.enum(["cli", "vscode", "exec", "appServer"]);
	const SubAgentSourceSchema = z.union([
		z.enum(["review", "compact", "memory_consolidation"]),
		z
			.object({
				thread_spawn: z
					.object({
						parent_thread_id: ThreadIdSchema,
						depth: z.number().int(),
						agent_path: z.string().nullable(),
						agent_nickname: z.string().nullable(),
						agent_role: z.string().nullable(),
					})
					.strict(),
			})
			.strict(),
		z.object({ other: z.string() }).strict(),
	]);
	const InspectOnlyThreadSourceSchema = z.union([
		ExecutableThreadSourceSchema,
		z.object({ custom: z.string() }).strict(),
		z.object({ subAgent: SubAgentSourceSchema }).strict(),
		z.literal("unknown"),
	]);
	const UnboundThreadLinkSchema = z
		.object({
			kind: z.literal("thread_link"),
			state: z.literal("unbound"),
			childId: z.null(),
			epoch: z.null(),
			threadId: z.null(),
			source: z.null(),
			status: z.literal("notLoaded"),
			loaded: z.literal(false),
			canAcceptDirectInput: z.literal(false),
			reason: NullableReasonSchema,
		})
		.strict();
	const InspectOnlyThreadLinkSchema = z
		.object({
			kind: z.literal("thread_link"),
			state: z.literal("inspect_only"),
			childId: z.null(),
			epoch: z.null(),
			threadId: ThreadIdSchema,
			source: InspectOnlyThreadSourceSchema,
			status: ThreadLinkStatusSchema,
			loaded: z.boolean(),
			canAcceptDirectInput: z.literal(false),
			reason: NullableReasonSchema,
		})
		.strict();
	const ExecutableThreadLinkSchema = z
		.object({
			kind: z.literal("thread_link"),
			state: z.literal("executable"),
			childId: ChildIdSchema,
			epoch: ChildEpochSchema,
			threadId: ThreadIdSchema,
			source: ExecutableThreadSourceSchema,
			status: ThreadLinkStatusSchema.exclude(["notLoaded"]),
			loaded: z.literal(true),
			canAcceptDirectInput: z.literal(true),
			reason: NullableReasonSchema,
		})
		.strict();
	const BrowserThreadLinkSchema = z
		.union([UnboundThreadLinkSchema, InspectOnlyThreadLinkSchema, ExecutableThreadLinkSchema])
		.superRefine((value, refinementContext) => {
			if (value.state === "executable") {
				try {
					assertCurrentTarget(context.validator, value);
				} catch (error) {
					addContextIssue(refinementContext, error, ["epoch"]);
				}
			}
		});

	const BrowserTimelineItemSchema = z.discriminatedUnion("media", [
		z
			.object({ media: z.literal("text"), itemId: ItemIdSchema, text: boundedText(16_384) })
			.strict(),
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
		z
			.object({ media: z.literal("plan"), itemId: ItemIdSchema, text: boundedText(16_384) })
			.strict(),
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
			status: CodexTurnStatusSchema,
			items: z.array(BrowserTimelineItemSchema),
			summary: boundedText(512),
			outputsIncluded: z.boolean(),
			outputsTruncated: z.boolean(),
		})
		.strict();
	const BrowserTimelineSchema = z
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
	const BrowserQueueSchema = z
		.object({
			kind: z.literal("queue"),
			status: QueueStatusSchema,
			entries: z.array(
				z
					.object({
						submissionId: QueuedSubmissionIdSchema,
						prompt: boundedText(16_384),
						status: QueueStatusSchema,
						operationId: DynamicToolCallIdSchema.nullable(),
					})
					.strict(),
			),
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
	const ApprovalPolicySchema = z.union([
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
	]);
	const BrowserSettingsSchema = z
		.object({
			kind: z.literal("settings"),
			owner: z.enum(["workhorse", "coordinator"]),
			model: boundedText(256),
			effort: boundedText(64).nullable(),
			serviceTier: boundedText(64).nullable(),
			approvalPolicy: ApprovalPolicySchema,
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
		lifecycle: z.discriminatedUnion("state", [
			z
				.object({
					state: z.enum(["staged", "pending"]),
					decision: z.null(),
					outcome: z.null(),
					reason: z.null(),
				})
				.strict(),
			z
				.object({
					state: z.literal("settled"),
					decision: z.enum(["approved", "declined", "cancelled"]),
					outcome: z.enum(["delivered", "not_delivered"]).nullable(),
					reason: boundedText(512),
				})
				.strict(),
			z
				.object({
					state: z.enum(["expired", "cancelled", "stale"]),
					decision: z.literal("cancelled"),
					outcome: z.enum(["delivered", "not_delivered"]).nullable(),
					reason: boundedText(512),
				})
				.strict(),
			z
				.object({
					state: z.literal("outcome_unknown"),
					decision: z.enum(["approved", "declined", "cancelled"]),
					outcome: z.literal("outcome_unknown"),
					reason: boundedText(512),
				})
				.strict(),
		]),
		binding: z
			.object({
				child: ChildIdSchema,
				epoch: ChildEpochSchema,
				link: boundedText(256).nullable(),
				target: boundedText(512),
				effect: boundedText(512),
			})
			.strict(),
		spoken: z
			.object({
				eligible: z.boolean(),
				reason: z.enum([
					"eligible",
					"not_pending",
					"stale_ownership",
					"secret",
					"multi_question",
					"form",
					"url",
					"permission_scope",
					"coordinator_blocking",
					"unsupported_schema",
					"broader_grant",
					"not_binary",
				]),
			})
			.strict(),
	};
	const ApprovalReason = { reason: NullableReasonSchema };
	const ApprovalDecisionSchema = createCodexCommandExecutionApprovalDecisionSchema({
		text: boundedText(16_384),
		host: boundedText(2048),
	});
	const ElicitationFieldSchema = z
		.object({
			name: boundedText(256),
			type: z.enum(["string", "number", "integer", "boolean", "enum"]),
			required: z.boolean(),
			secret: z.boolean(),
			title: boundedText(512).nullable(),
			description: boundedText(4096).nullable(),
			format: z.enum(["email", "uri", "date", "date-time"]).nullable(),
			minimum: z.number().nullable(),
			maximum: z.number().nullable(),
			minLength: z.number().int().nonnegative().nullable(),
			maxLength: z.number().int().nonnegative().nullable(),
			minimumItems: z.number().int().nonnegative().nullable(),
			maximumItems: z.number().int().nonnegative().nullable(),
			options: z.array(boundedText(2048)).nullable(),
			defaultValue: JsonValueSchema.nullable(),
		})
		.strict()
		.superRefine((field, refinementContext) => {
			if (field.secret && field.defaultValue !== null)
				refinementContext.addIssue({
					code: "custom",
					path: ["defaultValue"],
					message: "secret elicitation defaults are never projected",
				});
			if (field.minLength !== null && field.maxLength !== null && field.minLength > field.maxLength)
				refinementContext.addIssue({
					code: "custom",
					path: ["maxLength"],
					message: "elicitation text bounds are contradictory",
				});
			if (
				field.minimumItems !== null &&
				field.maximumItems !== null &&
				field.minimumItems > field.maximumItems
			)
				refinementContext.addIssue({
					code: "custom",
					path: ["maximumItems"],
					message: "elicitation item bounds are contradictory",
				});
		});
	const BrowserApprovalSchema = z
		.discriminatedUnion("approvalKind", [
			z
				.object({
					kind: z.literal("approval"),
					approvalKind: z.literal("command_execution"),
					...ApprovalEnvelope,
					...ApprovalReason,
					command: boundedText(16_384).nullable(),
					cwd: boundedText(16_384).nullable(),
					availableDecisions: z.array(ApprovalDecisionSchema),
				})
				.strict(),
			z
				.object({
					kind: z.literal("approval"),
					approvalKind: z.literal("file_change"),
					...ApprovalEnvelope,
					...ApprovalReason,
					grantRoot: boundedText(16_384).nullable(),
					availableDecisions: z.array(CodexFileChangeApprovalDecisionSchema),
				})
				.strict(),
			z
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
									.array(
										z.object({ label: boundedText(256), description: boundedText(2048) }).strict(),
									)
									.nullable(),
							})
							.strict(),
					),
				})
				.strict(),
			z
				.object({
					kind: z.literal("approval"),
					approvalKind: z.literal("elicitation"),
					...ApprovalEnvelope,
					serverName: boundedText(256),
					mode: z.enum(["form", "openai/form", "url"]),
					message: boundedText(16_384),
					url: SafeUrlSchema.nullable(),
					fields: z.array(ElicitationFieldSchema).nullable(),
				})
				.strict(),
			z
				.object({
					kind: z.literal("approval"),
					approvalKind: z.literal("permissions"),
					...ApprovalEnvelope,
					...ApprovalReason,
					cwd: boundedText(16_384),
					network: z.boolean().nullable(),
					fileSystem: z.enum(["read", "write", "deny"]).nullable(),
					requestedPermissions: JsonValueSchema,
				})
				.strict(),
			z
				.object({
					kind: z.literal("approval"),
					approvalKind: z.literal("apply_patch"),
					...ApprovalEnvelope,
					...ApprovalReason,
					grantRoot: boundedText(16_384).nullable(),
					fileCount: z.number().int().nonnegative(),
				})
				.strict(),
			z
				.object({
					kind: z.literal("approval"),
					approvalKind: z.literal("exec_command"),
					...ApprovalEnvelope,
					...ApprovalReason,
					command: z.array(boundedText(16_384)),
					cwd: boundedText(16_384),
				})
				.strict(),
		])
		.superRefine((approval, refinementContext) => {
			if (approval.lifecycle.state !== "pending" && approval.spoken.eligible) {
				refinementContext.addIssue({
					code: "custom",
					path: ["spoken", "eligible"],
					message: "only pending approvals may be spoken eligible",
				});
			}
			if (
				approval.binding.child !== context.validator.childId ||
				approval.binding.epoch !== context.validator.epoch
			) {
				refinementContext.addIssue({
					code: "custom",
					path: ["binding"],
					message: "approval binding is not from the current child epoch",
				});
			}
		});

	const TargetSchema = {
		commandId: BrowserCommandIdSchema,
		paneId: PaneIdSchema,
		childId: ChildIdSchema,
		epoch: ChildEpochSchema,
	};
	const BrowserTextCommandSchema = z
		.discriminatedUnion("command", [
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
		])
		.superRefine((value, refinementContext) => {
			try {
				assertCurrentTarget(context.validator, value);
			} catch (error) {
				addContextIssue(refinementContext, error, ["epoch"]);
			}
		});

	const BrowserSemanticDeliverySchema = z
		.object({
			kind: z.literal("semantic_delivery"),
			threadId: ThreadIdSchema,
			delivery: DeliveryOutcomeSchema,
			capturedAtMs: TimestampSchema,
			freshUntilMs: TimestampSchema,
			reason: NullableReasonSchema,
		})
		.strict();
	const BrowserCoordinatorSchema = z
		.object({
			kind: z.literal("coordinator"),
			state: z.enum(["unbound", "starting", "ready", "active", "reconnecting", "failed"]),
			threadId: ThreadIdSchema.nullable(),
			activeTurnId: TurnIdSchema.nullable(),
			configuredModel: boundedText(256).nullable(),
			configuredEffort: boundedText(64).nullable(),
			model: boundedText(256).nullable(),
			effort: boundedText(64).nullable(),
			serviceTier: boundedText(64).nullable(),
			reason: NullableReasonSchema,
		})
		.strict()
		.superRefine((value, refinementContext) => {
			if (value.state === "unbound" && (value.threadId !== null || value.activeTurnId !== null)) {
				refinementContext.addIssue({
					code: "custom",
					path: ["state"],
					message: "an unbound coordinator cannot publish thread or turn state",
				});
			}
			if (value.activeTurnId !== null && value.threadId === null) {
				refinementContext.addIssue({
					code: "custom",
					path: ["activeTurnId"],
					message: "an active coordinator turn requires a coordinator thread",
				});
			}
		});
	const BrowserVoiceSchema = z
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
			transcript: z.array(
				z
					.object({
						itemId: ItemIdSchema,
						sequence: z.number().int().nonnegative(),
						speaker: z.enum(["user", "assistant"]),
						text: boundedText(16_384),
						final: z.boolean(),
					})
					.strict(),
			),
			delivery: DeliveryOutcomeSchema.nullable(),
			reason: NullableReasonSchema,
		})
		.strict();
	const BrowserCommandLeaseSchema = z
		.object({
			kind: z.literal("command_lease"),
			...TargetSchema,
			state: z.enum(["active", "expired", "released"]),
			expiresAtMs: TimestampSchema,
		})
		.strict()
		.superRefine((value, refinementContext) => {
			try {
				assertCurrentTarget(context.validator, value);
			} catch (error) {
				addContextIssue(refinementContext, error, ["epoch"]);
			}
		});
	const BrowserOperationOutcomeSchema = z
		.object({
			kind: z.literal("operation_outcome"),
			operationId: BrowserCommandIdSchema,
			outcome: DeliveryOutcomeSchema,
			message: NullableReasonSchema,
		})
		.strict();

	const BrowserCommandBase = { kind: z.literal("browser_command"), ...TargetSchema };
	const BrowserThreadIdCommand = { threadId: ThreadIdSchema };
	const GrantedFileSystemSpecialPathSchema = z.discriminatedUnion("kind", [
		z.object({ kind: z.literal("root") }).strict(),
		z.object({ kind: z.literal("minimal") }).strict(),
		z
			.object({ kind: z.literal("project_roots"), subpath: boundedText(16_384).nullable() })
			.strict(),
		z.object({ kind: z.literal("tmpdir") }).strict(),
		z.object({ kind: z.literal("slash_tmp") }).strict(),
		z
			.object({
				kind: z.literal("unknown"),
				path: boundedText(16_384),
				subpath: boundedText(16_384).nullable(),
			})
			.strict(),
	]);
	const GrantedFileSystemPathSchema = z.discriminatedUnion("type", [
		z.object({ type: z.literal("path"), path: boundedText(16_384) }).strict(),
		z.object({ type: z.literal("glob_pattern"), pattern: boundedText(16_384) }).strict(),
		z.object({ type: z.literal("special"), value: GrantedFileSystemSpecialPathSchema }).strict(),
	]);
	const GrantedPermissionProfileSchema = z
		.object({
			network: z.object({ enabled: z.boolean().nullable() }).strict().optional(),
			fileSystem: z
				.object({
					read: z.array(boundedText(16_384)).nullable(),
					write: z.array(boundedText(16_384)).nullable(),
					globScanMaxDepth: z.number().int().optional(),
					entries: z
						.array(
							z
								.object({
									path: GrantedFileSystemPathSchema,
									access: z.enum(["read", "write", "deny"]),
								})
								.strict(),
						)
						.optional(),
				})
				.strict()
				.optional(),
		})
		.strict();
	const ReviewDecisionSchema = z.union([
		z.literal("approved"),
		z
			.object({
				approved_execpolicy_amendment: z
					.object({ proposed_execpolicy_amendment: z.array(boundedText(16_384)) })
					.strict(),
			})
			.strict(),
		z.literal("approved_for_session"),
		z.literal("approved_mcp_policy_amendment"),
		z
			.object({
				network_policy_amendment: z
					.object({
						network_policy_amendment: z
							.object({ host: boundedText(2048), action: z.enum(["allow", "deny"]) })
							.strict(),
					})
					.strict(),
			})
			.strict(),
		z.object({ denied: z.object({ rejection: boundedText(16_384) }).strict() }).strict(),
		z.literal("timed_out"),
		z.literal("abort"),
	]);
	const ApprovalResponseSchema = z.discriminatedUnion("approvalKind", [
		z
			.object({ approvalKind: z.literal("command_execution"), decision: ApprovalDecisionSchema })
			.strict(),
		z
			.object({
				approvalKind: z.literal("file_change"),
				decision: CodexFileChangeApprovalDecisionSchema,
			})
			.strict(),
		z
			.object({
				approvalKind: z.literal("user_input"),
				answers: z.record(z.string(), z.object({ answers: z.array(boundedText(16_384)) }).strict()),
			})
			.strict(),
		z
			.object({
				approvalKind: z.literal("elicitation"),
				action: z.enum(["accept", "decline", "cancel"]),
				content: JsonValueSchema.nullable(),
				_meta: JsonValueSchema.nullable(),
			})
			.strict(),
		z
			.object({
				approvalKind: z.literal("permissions"),
				permissions: GrantedPermissionProfileSchema,
				scope: z.enum(["turn", "session"]),
				strictAutoReview: z.boolean().optional(),
			})
			.strict(),
		z
			.object({
				approvalKind: z.literal("apply_patch"),
				decision: ReviewDecisionSchema,
			})
			.strict(),
		z
			.object({
				approvalKind: z.literal("exec_command"),
				decision: ReviewDecisionSchema,
			})
			.strict(),
	]);
	const CommandArms = [
		z
			.object({
				...BrowserCommandBase,
				command: z.literal("accountLogin"),
				login: SupportedLoginAccountParamsSchema,
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
			.object({
				...BrowserCommandBase,
				command: z.literal("queueAdd"),
				prompt: boundedText(16_384),
			})
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
				response: ApprovalResponseSchema,
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
				realtimeSessionHandle: BrowserCommandIdSchema,
				text: boundedText(4096),
			})
			.strict(),
		z
			.object({
				...BrowserCommandBase,
				command: z.literal("realtimeStop"),
				threadId: ThreadIdSchema,
				realtimeSessionHandle: BrowserCommandIdSchema,
			})
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
		dynamic.BrowserDynamicApprovalResponseSchema,
	] as const;
	const BrowserCommandSchema = z
		.discriminatedUnion("command", CommandArms)
		.superRefine((value, refinementContext) => {
			try {
				assertCurrentTarget(context.validator, value);
			} catch (error) {
				addContextIssue(refinementContext, error, ["epoch"]);
			}
		});

	const BrowserSnapshotSchema = z
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
			dynamicApprovals: z.array(dynamic.BrowserDynamicApprovalSchema),
			semantic: BrowserSemanticDeliverySchema.nullable(),
			coordinator: BrowserCoordinatorSchema,
			voice: BrowserVoiceSchema,
			lease: BrowserCommandLeaseSchema.nullable(),
			operation: BrowserOperationOutcomeSchema.nullable(),
		})
		.strict()
		.superRefine((value, refinementContext) => {
			for (const issue of browserSnapshotRelationshipIssues(value))
				refinementContext.addIssue({
					code: "custom",
					path: [...issue.path],
					message: issue.message,
				});
		});
	const BrowserDtoSchema = z.union([
		BrowserSnapshotSchema,
		BrowserReadinessSchema,
		BrowserAccountSchema,
		BrowserLoginSchema,
		BrowserThreadLinkSchema,
		BrowserTimelineSchema,
		BrowserQueueSchema,
		BrowserSettingsSchema,
		BrowserApprovalSchema,
		dynamic.BrowserDynamicApprovalSchema,
		BrowserTextCommandSchema,
		BrowserSemanticDeliverySchema,
		BrowserCoordinatorSchema,
		BrowserVoiceSchema,
		BrowserCommandLeaseSchema,
		BrowserOperationOutcomeSchema,
	]);

	return {
		BrowserReadinessSchema,
		BrowserAccountSchema,
		BrowserLoginSchema,
		BrowserThreadLinkSchema,
		BrowserTimelineSchema,
		BrowserQueueSchema,
		BrowserSettingsSchema,
		BrowserApprovalSchema,
		BrowserApprovalResponseSchema: ApprovalResponseSchema,
		BrowserTextCommandSchema,
		BrowserSemanticDeliverySchema,
		BrowserCoordinatorSchema,
		BrowserVoiceSchema,
		BrowserCommandLeaseSchema,
		BrowserOperationOutcomeSchema,
		BrowserCommandSchema,
		BrowserSnapshotSchema,
		BrowserDtoSchema,
		...dynamic,
	};
}

export type BrowserSchemas = ReturnType<typeof createBrowserSchemas>;
export type BrowserReadiness = z.infer<BrowserSchemas["BrowserReadinessSchema"]>;
export type BrowserAccount = z.infer<BrowserSchemas["BrowserAccountSchema"]>;
export type BrowserLogin = z.infer<BrowserSchemas["BrowserLoginSchema"]>;
export type BrowserThreadLink = z.infer<BrowserSchemas["BrowserThreadLinkSchema"]>;
export type BrowserTimeline = z.infer<BrowserSchemas["BrowserTimelineSchema"]>;
export type BrowserQueue = z.infer<BrowserSchemas["BrowserQueueSchema"]>;
export type BrowserSettings = z.infer<BrowserSchemas["BrowserSettingsSchema"]>;
export type BrowserApproval = z.infer<BrowserSchemas["BrowserApprovalSchema"]>;
export type BrowserApprovalResponse = z.infer<BrowserSchemas["BrowserApprovalResponseSchema"]>;
export type BrowserTextCommand = z.infer<BrowserSchemas["BrowserTextCommandSchema"]>;
export type BrowserSemanticDelivery = z.infer<BrowserSchemas["BrowserSemanticDeliverySchema"]>;
export type BrowserCoordinator = z.infer<BrowserSchemas["BrowserCoordinatorSchema"]>;
export type BrowserVoice = z.infer<BrowserSchemas["BrowserVoiceSchema"]>;
export type BrowserCommandLease = z.infer<BrowserSchemas["BrowserCommandLeaseSchema"]>;
export type BrowserOperationOutcome = z.infer<BrowserSchemas["BrowserOperationOutcomeSchema"]>;
export type BrowserCommand = z.infer<BrowserSchemas["BrowserCommandSchema"]>;
export type BrowserSnapshot = z.infer<BrowserSchemas["BrowserSnapshotSchema"]>;
export type BrowserDto = z.infer<BrowserSchemas["BrowserDtoSchema"]>;
export type DeliveryOutcome = z.infer<typeof DeliveryOutcomeSchema>;
