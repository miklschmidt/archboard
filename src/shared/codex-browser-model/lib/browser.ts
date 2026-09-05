import { z } from "zod";

import {
	CodexFileChangeApprovalDecisionSchema,
	CodexThreadStatusTypeSchema,
	CodexTurnStatusSchema,
	createCodexCommandExecutionApprovalDecisionSchema,
} from "../../codex-app-server-contract/index.js";
import type { CodexCommandExecutionApprovalDecision } from "../../codex-app-server-contract/index.js";
import { parseRealtimeSessionId as parseBrowserRealtimeSessionId } from "../../codex-realtime-host/index.js";

import { createDynamicApprovalSchemas } from "./dynamic-approval.js";
import {
	assertCurrentTarget,
	boundedText,
	boundedWireText,
	JsonValueSchema,
	optionalNullableText,
	SafeUrlSchema,
} from "./scalars.js";
import type { IdentityContext, IdentitySchemas } from "./scalars.js";
import { createBrowserSpokenApprovalSchema } from "./spoken-approval.js";

const TimestampSchema = z.number().int().nonnegative();
const DeliveryOutcomeSchema = z.enum(["delivered", "not_delivered", "outcome_unknown"]);
/**
 * The most joined thread candidates one snapshot publishes. The list is bounded
 * here rather than trimmed by the snapshot fitter, which owns timeline and
 * voice-context history. The bound is chosen so a complete inventory still
 * fits beside a rich snapshot at the smallest budget a gateway may run with,
 * leaving those histories to trim; a longer list is published
 * truncated rather than crowding history out.
 */
const BROWSER_THREAD_CANDIDATE_LIMIT = 40;
/** Exact callback JSON is retained up to the callback encoder's wire contract. */
const BROWSER_VOICE_CONTEXT_BODY_MAX_UTF8_BYTES = 32_768;
const BROWSER_VOICE_CONTEXT_BRIEF_MAX_UTF8_BYTES = 8_192;
const BROWSER_VOICE_CONTEXT_ENTRY_LIMIT = 64;
const BROWSER_PERMISSION_FILE_ACCESS = {
	deny: "deny",
	read: "read",
	write: "write",
} as const;

interface BrowserSnapshotRelationshipIssue {
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
	readonly voice?: { readonly realtimeSessionId: string | null } | undefined;
	readonly voiceContext?: { readonly sessionId: string } | null | undefined;
}

/** Checks relationships between fields after each field has passed its own schema. */
function browserSnapshotRelationshipIssues(
	value: BrowserSnapshotRelationshipFields,
): readonly BrowserSnapshotRelationshipIssue[] {
	const issues: BrowserSnapshotRelationshipIssue[] = [];
	for (const [name, threadId] of [
		["timeline", value.timeline?.threadId],
		["semantic", value.semantic?.threadId],
	] as const) {
		if (threadId !== null && threadId !== undefined && value.threadLink.threadId !== threadId) {
			issues.push({
				path: [name, "threadId"],
				message: "thread identity contradicts the current thread link",
			});
		}
	}
	if (
		value.threadLink.state === "unbound" &&
		(value.timeline !== null || value.semantic !== null)
	) {
		issues.push({
			path: ["threadLink", "state"],
			message: "an unbound link cannot publish thread-scoped state",
		});
	}
	if (
		value.voiceContext !== null &&
		value.voiceContext !== undefined &&
		value.voice?.realtimeSessionId !== value.voiceContext.sessionId
	) {
		issues.push({
			path: ["voiceContext", "sessionId"],
			message: "voice context identity contradicts the active voice session",
		});
	}
	return issues;
}

function addContextIssue(context: z.RefinementCtx, error: unknown, path: string[]): void {
	context.addIssue({
		code: "custom",
		path,
		message: error instanceof Error ? error.message : "identity is not current",
	});
}

function createBrowserSchemas(identity: IdentitySchemas, context: IdentityContext) {
	const {
		ApprovalIdSchema,
		BrowserCommandIdSchema,
		ChildEpochSchema,
		ChildIdSchema,
		ItemIdSchema,
		JsonRpcRequestIdSchema,
		LoginIdSchema,
		OperationIdSchema,
		QueuedSubmissionIdSchema,
		ThreadIdSchema,
		TurnIdSchema,
	} = identity;
	const dynamic = createDynamicApprovalSchemas(identity, context);
	const BrowserSpokenApprovalSchema = createBrowserSpokenApprovalSchema(identity);
	const NullableReasonSchema = optionalNullableText(512);
	const PaneIdSchema = boundedText(128);
	const BrowserRealtimeSessionIdSchema = z
		.string()
		.min(1)
		.refine((value) => !value.includes("\0"), "NUL is not allowed")
		.transform(parseBrowserRealtimeSessionId);

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
	const CodexAccountTypeSchema = z.enum(["apiKey", "chatgpt", "amazonBedrock"]);
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
				authUrl: SafeUrlSchema.refine(
					(value) => URL.canParse(value) && new URL(value).protocol === "https:",
				).nullable(),
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
	const BrowserThreadLinkSourcePresentationSchema = z.enum([
		"standard",
		"subagent",
		"custom",
		"unknown",
	]);
	const UnboundThreadLinkSchema = z
		.object({
			kind: z.literal("thread_link"),
			state: z.literal("unbound"),
			childId: z.null(),
			epoch: z.null(),
			threadId: z.null(),
			sourcePresentation: z.null(),
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
			sourcePresentation: BrowserThreadLinkSourcePresentationSchema,
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
			sourcePresentation: z.literal("standard"),
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

	/**
	 * One host-discovered thread the pane may bind, projected exactly as the
	 * thread-link classifier published it. The browser re-derives none of it:
	 * `state` and `reason` are the classifier's own verdict, and `selectionId`
	 * is the one-shot handle that names which retained candidate a bind consumes.
	 */
	const BrowserThreadCandidateSchema = z
		.object({
			kind: z.literal("thread_candidate"),
			selectionId: boundedText(128),
			threadId: ThreadIdSchema,
			state: z.enum(["executable", "inspect_only"]),
			reason: NullableReasonSchema,
			sourcePresentation: BrowserThreadLinkSourcePresentationSchema,
			status: ThreadLinkStatusSchema,
			loaded: z.boolean(),
			canAcceptDirectInput: z.boolean().nullable(),
		})
		.strict();
	/**
	 * The candidate list is bounded rather than fitted. It is the only variable
	 * snapshot field beside the timeline, and the timeline is the one the
	 * snapshot fitter trims, so this list must never be able to crowd it out.
	 */
	const BrowserThreadCandidatesSchema = z.discriminatedUnion("state", [
		z
			.object({
				kind: z.literal("thread_candidates"),
				state: z.literal("unknown"),
				records: z.array(BrowserThreadCandidateSchema).length(0),
				truncated: z.literal(false),
				reason: z.null(),
			})
			.strict(),
		z
			.object({
				kind: z.literal("thread_candidates"),
				state: z.literal("listed"),
				records: z.array(BrowserThreadCandidateSchema).max(BROWSER_THREAD_CANDIDATE_LIMIT),
				truncated: z.boolean(),
				reason: z.null(),
			})
			.strict()
			.superRefine((value, refinementContext) => {
				const seen = new Set<string>();
				for (const record of value.records) {
					if (seen.has(record.selectionId)) {
						refinementContext.addIssue({
							code: "custom",
							path: ["records"],
							message: "a thread candidate selection appears more than once",
						});
					}
					seen.add(record.selectionId);
				}
			}),
		z
			.object({
				kind: z.literal("thread_candidates"),
				state: z.literal("unavailable"),
				records: z.array(BrowserThreadCandidateSchema).length(0),
				truncated: z.literal(false),
				reason: boundedText(512),
			})
			.strict(),
	]);

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
						/**
						 * The Archboard operation that queued this submission, or null when
						 * Archboard did not queue it. The host recovers it from the
						 * submission's clientUserMessageId, which the queue port sets to the
						 * serialized OperationId on every add it makes.
						 */
						operationId: OperationIdSchema.nullable(),
					})
					.strict(),
			),
		})
		.strict();

	const BrowserSandboxSchema = z
		.object({
			mode: z.enum(["full_access", "read_only", "external", "workspace_write"]),
			network: z.enum(["enabled", "restricted", "unspecified"]),
		})
		.strict();
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
			sandbox: BrowserSandboxSchema,
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
	type CodexNetworkPolicyDecision = Extract<
		CodexCommandExecutionApprovalDecision,
		{ readonly applyNetworkPolicyAmendment: unknown }
	>;
	type BrowserNetworkPolicyAmendment = Pick<
		CodexNetworkPolicyDecision["applyNetworkPolicyAmendment"]["network_policy_amendment"],
		"host" | "action"
	>;
	type BrowserCommandApprovalDecision =
		| Exclude<CodexCommandExecutionApprovalDecision, CodexNetworkPolicyDecision>
		| {
				readonly applyNetworkPolicyAmendment: {
					readonly network_policy_amendment: BrowserNetworkPolicyAmendment;
				};
		  };
	const ApprovalDecisionSchema = createCodexCommandExecutionApprovalDecisionSchema({
		text: boundedText(16_384),
		host: boundedText(2048),
	}) satisfies z.ZodType<BrowserCommandApprovalDecision>;
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
			if (field.secret && field.defaultValue !== null) {
				refinementContext.addIssue({
					code: "custom",
					path: ["defaultValue"],
					message: "secret elicitation defaults are never projected",
				});
			}
			if (
				field.minLength !== null &&
				field.maxLength !== null &&
				field.minLength > field.maxLength
			) {
				refinementContext.addIssue({
					code: "custom",
					path: ["maxLength"],
					message: "elicitation text bounds are contradictory",
				});
			}
			if (
				field.minimumItems !== null &&
				field.maximumItems !== null &&
				field.minimumItems > field.maximumItems
			) {
				refinementContext.addIssue({
					code: "custom",
					path: ["maximumItems"],
					message: "elicitation item bounds are contradictory",
				});
			}
		});
	interface BrowserRequestedPermissionScope {
		readonly network: boolean | null;
		readonly fileAccess: readonly (typeof BROWSER_PERMISSION_FILE_ACCESS)[keyof typeof BROWSER_PERMISSION_FILE_ACCESS][];
	}
	const BrowserRequestedPermissionScopeSchema = z
		.object({
			network: z.boolean().nullable(),
			fileAccess: z.array(z.enum(Object.values(BROWSER_PERMISSION_FILE_ACCESS))).max(3),
		})
		.strict() satisfies z.ZodType<BrowserRequestedPermissionScope>;
	const BrowserApprovalSchema = z
		.discriminatedUnion("approvalKind", [
			z
				.object({
					kind: z.literal("approval"),
					approvalKind: z.literal("command_execution"),
					...ApprovalEnvelope,
					...ApprovalReason,
					command: boundedText(16_384).nullable(),
					availableDecisions: z.array(ApprovalDecisionSchema),
				})
				.strict(),
			z
				.object({
					kind: z.literal("approval"),
					approvalKind: z.literal("file_change"),
					...ApprovalEnvelope,
					...ApprovalReason,
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
					requestedScope: BrowserRequestedPermissionScopeSchema,
				})
				.strict(),
			z
				.object({
					kind: z.literal("approval"),
					approvalKind: z.literal("apply_patch"),
					...ApprovalEnvelope,
					...ApprovalReason,
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
			// Asked of the validator rather than compared against its fields, so a
			// parse context that holds no issuance ledger — the browser's — can
			// leave the current-epoch question to the gateway that owns it.
			try {
				assertCurrentTarget(context.validator, {
					childId: approval.binding.child,
					epoch: approval.binding.epoch,
				});
			} catch {
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
			realtimeSessionId: BrowserRealtimeSessionIdSchema.nullable(),
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
	const BrowserVoiceContextEntryBaseSchema = z
		.object({
			id: boundedText(2_048),
			kind: z.enum(["semantic", "focus", "selection", "callback"]),
			sourceOrder: z.number().int().nonnegative(),
			capturedAtMs: TimestampSchema,
			freshUntilMs: TimestampSchema,
			reason: boundedText(512).nullable(),
			body: boundedWireText(BROWSER_VOICE_CONTEXT_BODY_MAX_UTF8_BYTES),
		})
		.strict();
	const BrowserVoiceContextEntrySchema = z
		.discriminatedUnion("attempted", [
			BrowserVoiceContextEntryBaseSchema.extend({
				attempted: z.literal(false),
				attemptedAtMs: z.null(),
				outcome: z.literal("not_delivered"),
			}),
			BrowserVoiceContextEntryBaseSchema.extend({
				attempted: z.literal(true),
				attemptedAtMs: TimestampSchema,
				outcome: DeliveryOutcomeSchema,
			}),
		])
		.superRefine((value, refinementContext) => {
			if (value.freshUntilMs < value.capturedAtMs) {
				refinementContext.addIssue({
					code: "custom",
					path: ["freshUntilMs"],
					message: "freshness cannot end before capture",
				});
			}
			if (value.attempted && value.attemptedAtMs < value.capturedAtMs) {
				refinementContext.addIssue({
					code: "custom",
					path: ["attemptedAtMs"],
					message: "attempt timing and delivery outcome are incoherent",
				});
			}
		});
	const BrowserVoiceContextSchema = z
		.object({
			kind: z.literal("voice_context"),
			sessionId: BrowserRealtimeSessionIdSchema,
			ledgerId: boundedText(2_048),
			canonicalBrief: boundedText(BROWSER_VOICE_CONTEXT_BRIEF_MAX_UTF8_BYTES),
			ownerEntriesTruncated: z.number().int().nonnegative(),
			entriesTruncated: z.number().int().nonnegative(),
			entries: z.array(BrowserVoiceContextEntrySchema).max(BROWSER_VOICE_CONTEXT_ENTRY_LIMIT),
		})
		.strict()
		.superRefine((value, refinementContext) => {
			if (value.entriesTruncated < value.ownerEntriesTruncated) {
				refinementContext.addIssue({
					code: "custom",
					path: ["entriesTruncated"],
					message: "transport omissions cannot be less than permanent owner omissions",
				});
			}
		});
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
	const CommandArms = [
		z
			.object({
				...BrowserCommandBase,
				command: z.literal("accountLogin"),
				login: JsonValueSchema,
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
		z.object({ ...BrowserCommandBase, command: z.literal("threadLinkRefresh") }).strict(),
		// A bind names the one-shot selection it consumes as well as the thread it
		// believes that selection is, so a list the host has since replaced is
		// refused instead of silently binding whatever now sits at that thread id.
		z
			.object({
				...BrowserCommandBase,
				command: z.literal("threadLinkAttach"),
				selectionId: boundedText(128),
				...BrowserThreadIdCommand,
			})
			.strict(),
		z
			.object({
				...BrowserCommandBase,
				command: z.literal("threadLinkRelink"),
				selectionId: boundedText(128),
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
				response: JsonValueSchema,
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
			threadCandidates: BrowserThreadCandidatesSchema,
			timeline: BrowserTimelineSchema.nullable(),
			queue: BrowserQueueSchema,
			settings: z.array(BrowserSettingsSchema),
			approvals: z.array(BrowserApprovalSchema),
			dynamicApprovals: z.array(dynamic.BrowserDynamicApprovalSchema),
			semantic: BrowserSemanticDeliverySchema.nullable(),
			coordinator: BrowserCoordinatorSchema,
			voice: BrowserVoiceSchema,
			spokenApproval: BrowserSpokenApprovalSchema,
			voiceContext: BrowserVoiceContextSchema.nullable().optional(),
			lease: BrowserCommandLeaseSchema.nullable(),
			operation: BrowserOperationOutcomeSchema.nullable(),
		})
		.strict()
		.superRefine((value, refinementContext) => {
			for (const issue of browserSnapshotRelationshipIssues(value)) {
				refinementContext.addIssue({
					code: "custom",
					path: [...issue.path],
					message: issue.message,
				});
			}
		});
	const BrowserDtoSchema = z.union([
		BrowserSnapshotSchema,
		BrowserReadinessSchema,
		BrowserAccountSchema,
		BrowserLoginSchema,
		BrowserThreadLinkSchema,
		BrowserThreadCandidatesSchema,
		BrowserTimelineSchema,
		BrowserQueueSchema,
		BrowserSettingsSchema,
		BrowserApprovalSchema,
		dynamic.BrowserDynamicApprovalSchema,
		BrowserTextCommandSchema,
		BrowserSemanticDeliverySchema,
		BrowserCoordinatorSchema,
		BrowserVoiceSchema,
		BrowserSpokenApprovalSchema,
		BrowserCommandLeaseSchema,
		BrowserOperationOutcomeSchema,
	]);

	return {
		BrowserReadinessSchema,
		BrowserThreadCandidateSchema,
		BrowserThreadCandidatesSchema,
		BrowserAccountSchema,
		BrowserLoginSchema,
		BrowserThreadLinkSourcePresentationSchema,
		BrowserThreadLinkSchema,
		BrowserTimelineSchema,
		BrowserQueueSchema,
		BrowserSettingsSchema,
		BrowserApprovalSchema,
		BrowserTextCommandSchema,
		BrowserSemanticDeliverySchema,
		BrowserCoordinatorSchema,
		BrowserVoiceSchema,
		BrowserSpokenApprovalSchema,
		BrowserVoiceContextSchema,
		BrowserCommandLeaseSchema,
		BrowserOperationOutcomeSchema,
		BrowserCommandSchema,
		BrowserSnapshotSchema,
		BrowserDtoSchema,
		...dynamic,
	};
}

type BrowserSchemas = ReturnType<typeof createBrowserSchemas>;
type BrowserReadiness = z.infer<BrowserSchemas["BrowserReadinessSchema"]>;
type BrowserAccount = z.infer<BrowserSchemas["BrowserAccountSchema"]>;
type BrowserLogin = z.infer<BrowserSchemas["BrowserLoginSchema"]>;
type BrowserThreadLinkSourcePresentation = z.infer<
	BrowserSchemas["BrowserThreadLinkSourcePresentationSchema"]
>;
type BrowserThreadLink = z.infer<BrowserSchemas["BrowserThreadLinkSchema"]>;
type BrowserThreadCandidate = z.infer<BrowserSchemas["BrowserThreadCandidateSchema"]>;
type BrowserThreadCandidates = z.infer<BrowserSchemas["BrowserThreadCandidatesSchema"]>;
type BrowserTimeline = z.infer<BrowserSchemas["BrowserTimelineSchema"]>;
type BrowserQueue = z.infer<BrowserSchemas["BrowserQueueSchema"]>;
type BrowserSettings = z.infer<BrowserSchemas["BrowserSettingsSchema"]>;
type BrowserApproval = z.infer<BrowserSchemas["BrowserApprovalSchema"]>;
type BrowserTextCommand = z.infer<BrowserSchemas["BrowserTextCommandSchema"]>;
type BrowserSemanticDelivery = z.infer<BrowserSchemas["BrowserSemanticDeliverySchema"]>;
type BrowserCoordinator = z.infer<BrowserSchemas["BrowserCoordinatorSchema"]>;
type BrowserVoice = z.infer<BrowserSchemas["BrowserVoiceSchema"]>;
type BrowserSpokenApproval = z.infer<BrowserSchemas["BrowserSpokenApprovalSchema"]>;
type BrowserVoiceContext = z.infer<BrowserSchemas["BrowserVoiceContextSchema"]>;
type BrowserCommandLease = z.infer<BrowserSchemas["BrowserCommandLeaseSchema"]>;
type BrowserOperationOutcome = z.infer<BrowserSchemas["BrowserOperationOutcomeSchema"]>;
type BrowserCommand = z.infer<BrowserSchemas["BrowserCommandSchema"]>;
type BrowserSnapshot = z.infer<BrowserSchemas["BrowserSnapshotSchema"]>;
type BrowserDto = z.infer<BrowserSchemas["BrowserDtoSchema"]>;
type DeliveryOutcome = z.infer<typeof DeliveryOutcomeSchema>;

export {
	DeliveryOutcomeSchema,
	BROWSER_THREAD_CANDIDATE_LIMIT,
	BROWSER_VOICE_CONTEXT_BODY_MAX_UTF8_BYTES,
	BROWSER_VOICE_CONTEXT_BRIEF_MAX_UTF8_BYTES,
	BROWSER_VOICE_CONTEXT_ENTRY_LIMIT,
	BROWSER_PERMISSION_FILE_ACCESS,
	type BrowserSnapshotRelationshipIssue,
	browserSnapshotRelationshipIssues,
	createBrowserSchemas,
	type BrowserSchemas,
	type BrowserReadiness,
	type BrowserAccount,
	type BrowserLogin,
	type BrowserThreadLinkSourcePresentation,
	type BrowserThreadLink,
	type BrowserThreadCandidate,
	type BrowserThreadCandidates,
	type BrowserTimeline,
	type BrowserQueue,
	type BrowserSettings,
	type BrowserApproval,
	type BrowserTextCommand,
	type BrowserSemanticDelivery,
	type BrowserCoordinator,
	type BrowserVoice,
	type BrowserSpokenApproval,
	type BrowserVoiceContext,
	type BrowserCommandLease,
	type BrowserOperationOutcome,
	type BrowserCommand,
	type BrowserSnapshot,
	type BrowserDto,
	type DeliveryOutcome,
};
