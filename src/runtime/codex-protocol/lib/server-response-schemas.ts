import { z } from "zod";

import type {
	CodexOutputConformance,
	CodexServerResponseByMethod,
} from "@/shared/codex-app-server-contract";
import {
	CodexCommandExecutionApprovalDecisionSchema,
	CodexFileChangeApprovalDecisionSchema,
} from "@/shared/codex-app-server-contract";
import {
	UNSUPPORTED_ATTESTATION_ERROR,
	UNSUPPORTED_TOKEN_REFRESH_ERROR,
} from "@/runtime/codex-protocol/lib/authored";
import {
	JsonValueSchema,
	NonNegativeIntegerSchema,
	boundedText,
} from "@/runtime/codex-protocol/lib/scalars";

/**
 *
 */
function codexOutputSchema<Wire>() {
	return <Schema extends z.ZodType>(
		schema: Schema & CodexOutputConformance<Wire, z.output<Schema>>,
	): Schema => schema;
}

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

export const CodexServerResponseSchema = z.discriminatedUnion("method", [
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
