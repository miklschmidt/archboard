import { z } from "zod";

import type {
	CodexLoginAccountParams,
	CodexServerResponseByMethod,
} from "#shared/protocol/app-server-contract.ts";
import {
	CodexCommandExecutionApprovalDecisionSchema,
	CodexFileChangeApprovalDecisionSchema,
} from "#shared/protocol/app-server-contract.ts";
import {
	LOGIN_POLICIES,
	UNSUPPORTED_ATTESTATION_ERROR,
	UNSUPPORTED_TOKEN_REFRESH_ERROR,
} from "#runtime/schemas/authored-schemas.ts";
import { ClientUserInputSchema, UserInputSchema } from "#runtime/schemas/core-schemas.ts";
import {
	JsonValueSchema,
	NonNegativeIntegerSchema,
	NullablePageSchema,
	boundedText,
	looseObject,
	optionalNullableText,
} from "#runtime/schemas/scalars.ts";
import { codexIngressSchema, codexOutputSchema } from "#runtime/schemas/vendor-schema.ts";

const WireStringSchema = z.string();
const FileSystemSpecialPathSchema = z.discriminatedUnion("kind", [
	z.object({ kind: z.literal("root") }).strict(),
	z.object({ kind: z.literal("minimal") }).strict(),
	z.object({ kind: z.literal("project_roots"), subpath: WireStringSchema.nullable() }).strict(),
	z.object({ kind: z.literal("tmpdir") }).strict(),
	z.object({ kind: z.literal("slash_tmp") }).strict(),
	z
		.object({
			kind: z.literal("unknown"),
			path: WireStringSchema,
			subpath: WireStringSchema.nullable(),
		})
		.strict(),
]);
const FileSystemPathSchema = z.discriminatedUnion("type", [
	z.object({ type: z.literal("path"), path: WireStringSchema }).strict(),
	z.object({ type: z.literal("glob_pattern"), pattern: WireStringSchema }).strict(),
	z.object({ type: z.literal("special"), value: FileSystemSpecialPathSchema }).strict(),
]);
const GrantedPermissionProfileSchema = z
	.object({
		network: z.object({ enabled: z.boolean().nullable() }).strict().optional(),
		fileSystem: z
			.object({
				read: z.array(WireStringSchema).nullable(),
				write: z.array(WireStringSchema).nullable(),
				globScanMaxDepth: z.number().int().optional(),
				entries: z
					.array(
						z
							.object({
								path: FileSystemPathSchema,
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
				.object({ proposed_execpolicy_amendment: z.array(WireStringSchema) })
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
						.object({ host: WireStringSchema, action: z.enum(["allow", "deny"]) })
						.strict(),
				})
				.strict(),
		})
		.strict(),
	z.object({ denied: z.object({ rejection: WireStringSchema }).strict() }).strict(),
	z.literal("timed_out"),
	z.literal("abort"),
]);

const UserInputResponseSchema = codexOutputSchema<
	CodexServerResponseByMethod["item/tool/requestUserInput"]
>()(
	z
		.object({
			answers: z.record(z.string(), z.object({ answers: z.array(WireStringSchema) }).strict()),
		})
		.strict(),
);
const ElicitationResponseSchema = codexOutputSchema<
	CodexServerResponseByMethod["mcpServer/elicitation/request"]
>()(
	z
		.object({
			action: z.enum(["accept", "decline", "cancel"]),
			content: JsonValueSchema.nullable(),
			_meta: JsonValueSchema.nullable(),
		})
		.strict(),
);
const DynamicToolCallResponseSchema = codexOutputSchema<
	CodexServerResponseByMethod["item/tool/call"]
>()(
	z
		.object({
			contentItems: z.tuple([
				z.object({ type: z.literal("inputText"), text: boundedText(16_384) }).strict(),
			]),
			success: z.boolean(),
		})
		.strict(),
);
const PermissionsResponseSchema = codexOutputSchema<
	CodexServerResponseByMethod["item/permissions/requestApproval"]
>()(
	z
		.object({
			permissions: GrantedPermissionProfileSchema,
			scope: z.enum(["turn", "session"]),
			strictAutoReview: z.boolean().optional(),
		})
		.strict(),
);
const CommandExecutionResponseSchema = codexOutputSchema<
	CodexServerResponseByMethod["item/commandExecution/requestApproval"]
>()(z.object({ decision: CodexCommandExecutionApprovalDecisionSchema }).strict());
const FileChangeResponseSchema = codexOutputSchema<
	CodexServerResponseByMethod["item/fileChange/requestApproval"]
>()(z.object({ decision: CodexFileChangeApprovalDecisionSchema }).strict());
const CurrentTimeResponseSchema = codexOutputSchema<
	CodexServerResponseByMethod["currentTime/read"]
>()(z.object({ currentTimeAt: NonNegativeIntegerSchema }).strict());
const ApplyPatchResponseSchema = codexOutputSchema<
	CodexServerResponseByMethod["applyPatchApproval"]
>()(z.object({ decision: ReviewDecisionSchema }).strict());
const ExecCommandResponseSchema = codexOutputSchema<
	CodexServerResponseByMethod["execCommandApproval"]
>()(z.object({ decision: ReviewDecisionSchema }).strict());

const CodexServerResponseSchema = z.discriminatedUnion("method", [
	z
		.object({
			method: z.literal("item/commandExecution/requestApproval"),
			result: CommandExecutionResponseSchema,
		})
		.strict(),
	z
		.object({
			method: z.literal("item/fileChange/requestApproval"),
			result: FileChangeResponseSchema,
		})
		.strict(),
	z
		.object({ method: z.literal("item/tool/requestUserInput"), result: UserInputResponseSchema })
		.strict(),
	z
		.object({
			method: z.literal("mcpServer/elicitation/request"),
			result: ElicitationResponseSchema,
		})
		.strict(),
	z
		.object({
			method: z.literal("item/permissions/requestApproval"),
			result: PermissionsResponseSchema,
		})
		.strict(),
	z.object({ method: z.literal("item/tool/call"), result: DynamicToolCallResponseSchema }).strict(),
	z
		.object({
			method: z.literal("account/chatgptAuthTokens/refresh"),
			error: z
				.object({
					code: z.literal(UNSUPPORTED_TOKEN_REFRESH_ERROR.code),
					message: z.literal(UNSUPPORTED_TOKEN_REFRESH_ERROR.message),
				})
				.strict(),
		})
		.strict(),
	z
		.object({
			method: z.literal("attestation/generate"),
			error: z
				.object({
					code: z.literal(UNSUPPORTED_ATTESTATION_ERROR.code),
					message: z.literal(UNSUPPORTED_ATTESTATION_ERROR.message),
				})
				.strict(),
		})
		.strict(),
	z.object({ method: z.literal("currentTime/read"), result: CurrentTimeResponseSchema }).strict(),
	z.object({ method: z.literal("applyPatchApproval"), result: ApplyPatchResponseSchema }).strict(),
	z
		.object({ method: z.literal("execCommandApproval"), result: ExecCommandResponseSchema })
		.strict(),
]);

/** A user input as Codex reports it back. */
type SessionUserInput = z.infer<typeof UserInputSchema>;

/** One submission waiting in a thread's queue, as Codex reports it. */
const QueuedSubmissionSchema = looseObject({
	id: z.string(),
	input: z.array(UserInputSchema),
	clientUserMessageId: z.string(),
});

const ThreadQueueAddParamsSchema = z.strictObject({
	threadId: z.string(),
	input: z.array(ClientUserInputSchema),
	clientUserMessageId: z.string(),
});
const ThreadQueueListParamsSchema = z.strictObject({
	threadId: z.string(),
	...NullablePageSchema,
});
const ThreadQueueUpdateParamsSchema = z.strictObject({
	threadId: z.string(),
	queuedSubmissionId: z.string(),
	input: z.array(ClientUserInputSchema),
});
const ThreadQueueDeleteParamsSchema = z.strictObject({
	threadId: z.string(),
	queuedSubmissionId: z.string(),
});
const ThreadQueueReorderParamsSchema = z.strictObject({
	threadId: z.string(),
	queuedSubmissionIds: z.array(z.string()),
});
const ThreadQueueStartParamsSchema = z.strictObject({
	threadId: z.string(),
	queuedSubmissionId: z.string().nullable().optional(),
});
type ThreadQueueAddParams = z.infer<typeof ThreadQueueAddParamsSchema>;
type ThreadQueueListParams = z.infer<typeof ThreadQueueListParamsSchema>;
type ThreadQueueUpdateParams = z.infer<typeof ThreadQueueUpdateParamsSchema>;
type ThreadQueueDeleteParams = z.infer<typeof ThreadQueueDeleteParamsSchema>;
type ThreadQueueReorderParams = z.infer<typeof ThreadQueueReorderParamsSchema>;
type ThreadQueueStartParams = z.infer<typeof ThreadQueueStartParamsSchema>;

const ApiKeyLoginSchema = z
	.object({ type: z.literal("apiKey"), apiKey: boundedText(16_384) })
	.strict();
const ChatgptLoginSchema = z
	.object({
		type: z.literal("chatgpt"),
		codexStreamlinedLogin: z.boolean().optional(),
		useHostedLoginSuccessPage: z.boolean().optional(),
		appBrand: z.enum(["codex", "chatgpt"]).nullable().optional(),
	})
	.strict();
const BedrockApiKeyLoginSchema = z
	.object({
		type: z.literal("amazonBedrock"),
		apiKey: boundedText(16_384),
		region: boundedText(256),
	})
	.strict();
const BedrockAccessKeysLoginSchema = z
	.object({
		type: z.literal("amazonBedrockAccessKeys"),
		accessKeyId: boundedText(256),
		secretAccessKey: boundedText(16_384),
		sessionToken: optionalNullableText(16_384),
		region: boundedText(256),
	})
	.strict();

type SupportedLoginVariant = Extract<
	(typeof LOGIN_POLICIES)[number],
	{ readonly policy: "supported" }
>["variant"];
type SupportedCodexLoginAccountParams = Extract<
	CodexLoginAccountParams,
	{ type: SupportedLoginVariant }
>;

const SupportedLoginAccountParamsSchema = codexIngressSchema<SupportedCodexLoginAccountParams>()(
	z.discriminatedUnion("type", [
		ApiKeyLoginSchema,
		ChatgptLoginSchema,
		BedrockApiKeyLoginSchema,
		BedrockAccessKeysLoginSchema,
	]),
);
type SupportedLoginAccountParams = z.infer<typeof SupportedLoginAccountParamsSchema>;

export {
	CodexServerResponseSchema,
	QueuedSubmissionSchema,
	SupportedLoginAccountParamsSchema,
	ThreadQueueAddParamsSchema,
	ThreadQueueDeleteParamsSchema,
	ThreadQueueListParamsSchema,
	ThreadQueueReorderParamsSchema,
	ThreadQueueStartParamsSchema,
	ThreadQueueUpdateParamsSchema,
	type SessionUserInput,
	type SupportedLoginAccountParams,
	type ThreadQueueAddParams,
	type ThreadQueueDeleteParams,
	type ThreadQueueListParams,
	type ThreadQueueReorderParams,
	type ThreadQueueStartParams,
	type ThreadQueueUpdateParams,
};
