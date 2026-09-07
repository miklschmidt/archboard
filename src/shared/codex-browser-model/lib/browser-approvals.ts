// The ordinary (non-dynamic) approval DTO: one envelope every approval kind
// shares, plus the kind-specific body the pane renders and answers.

import { z } from "zod";

import {
	CodexFileChangeApprovalDecisionSchema,
	createCodexCommandExecutionApprovalDecisionSchema,
} from "@/shared/codex-app-server-contract/index";
import type { CodexCommandExecutionApprovalDecision } from "@/shared/codex-app-server-contract/index";
import {
	BROWSER_PERMISSION_FILE_ACCESS,
	TimestampSchema,
} from "@/shared/codex-browser-model/lib/browser-vocabulary";
import {
	assertCurrentTarget,
	boundedText,
	JsonValueSchema,
	optionalNullableText,
	SafeUrlSchema,
} from "@/shared/codex-browser-model/lib/scalars";
import type { IdentityContext, IdentitySchemas } from "@/shared/codex-browser-model/lib/scalars";

/**
 * Tells whether an optional lower and upper bound contradict each other.
 * @param minimum - The lower bound, or null when unbounded.
 * @param maximum - The upper bound, or null when unbounded.
 * @returns True when both are set and the lower exceeds the upper.
 */
function contradictoryBounds(minimum: number | null, maximum: number | null): boolean {
	return minimum !== null && maximum !== null && minimum > maximum;
}

/**
 * Builds the approval schema.
 * @param identity - The session's identity schemas.
 * @param context - The validator that knows the current child and epoch.
 * @returns The discriminated approval schema.
 */
function createBrowserApprovalSchemas(identity: IdentitySchemas, context: IdentityContext) {
	const {
		ApprovalIdSchema,
		ChildEpochSchema,
		ChildIdSchema,
		ItemIdSchema,
		JsonRpcRequestIdSchema,
		ThreadIdSchema,
		TurnIdSchema,
	} = identity;
	const NullableReasonSchema = optionalNullableText(512);

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
			if (contradictoryBounds(field.minLength, field.maxLength)) {
				refinementContext.addIssue({
					code: "custom",
					path: ["maxLength"],
					message: "elicitation text bounds are contradictory",
				});
			}
			if (contradictoryBounds(field.minimumItems, field.maximumItems)) {
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

	return { BrowserApprovalSchema };
}

export { createBrowserApprovalSchemas };
