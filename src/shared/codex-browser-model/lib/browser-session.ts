// The session-level DTOs: whether the app server is ready, whose account it
// runs under, a login in flight, and the settings of each owner.

import { z } from "zod";

import { boundedText, SafeUrlSchema } from "@/shared/codex-browser-model/lib/scalars";
import type { IdentitySchemas } from "@/shared/codex-browser-model/lib/scalars";
import { TimestampSchema } from "@/shared/codex-browser-model/lib/browser-vocabulary";

/**
 * Builds the readiness, account, login and settings schemas.
 * @param identity - The session's identity schemas.
 * @returns The four schemas.
 */
function createBrowserSessionSchemas(identity: IdentitySchemas) {
	const { LoginIdSchema } = identity;

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

	return {
		BrowserReadinessSchema,
		BrowserAccountSchema,
		BrowserLoginSchema,
		BrowserSettingsSchema,
	};
}

export { createBrowserSessionSchemas };
