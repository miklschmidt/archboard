import { z } from "zod";

import {
	CurrentTimeReadResponseSchema,
	UNSUPPORTED_ATTESTATION_ERROR,
	UNSUPPORTED_TOKEN_REFRESH_ERROR,
} from "./authored.js";
import {
	FileChangeSchema,
	JsonValueSchema,
	boundedText,
	wireText,
} from "./server-request-scalars.js";
import type { IdentitySchemas } from "./scalars.js";

export const SERVER_REQUEST_METHODS = [
	"item/commandExecution/requestApproval",
	"item/fileChange/requestApproval",
	"item/tool/requestUserInput",
	"mcpServer/elicitation/request",
	"item/permissions/requestApproval",
	"item/tool/call",
	"account/chatgptAuthTokens/refresh",
	"attestation/generate",
	"currentTime/read",
	"applyPatchApproval",
	"execCommandApproval",
] as const;

const WireNumberSchema = z.number();
const WireIntegerSchema = z.number().int();
const OptionalWireTextSchema = () => wireText().optional();

function createMcpElicitationSchema() {
	const CommonStringFields = {
		title: OptionalWireTextSchema(),
		description: OptionalWireTextSchema(),
	};
	const StringSchema = z
		.object({
			type: z.literal("string"),
			...CommonStringFields,
			minLength: WireIntegerSchema.nonnegative().optional(),
			maxLength: WireIntegerSchema.nonnegative().optional(),
			format: z.enum(["email", "uri", "date", "date-time"]).optional(),
			default: wireText().optional(),
		})
		.strict();
	const NumberSchema = z
		.object({
			type: z.enum(["number", "integer"]),
			...CommonStringFields,
			minimum: WireNumberSchema.optional(),
			maximum: WireNumberSchema.optional(),
			default: WireNumberSchema.optional(),
		})
		.strict();
	const BooleanSchema = z
		.object({
			type: z.literal("boolean"),
			...CommonStringFields,
			default: z.boolean().optional(),
		})
		.strict();
	const ConstOptionSchema = z.object({ const: wireText(), title: wireText() }).strict();
	const UntitledSingleSelectSchema = z
		.object({
			type: z.literal("string"),
			...CommonStringFields,
			enum: z.array(wireText()),
			default: z.string().optional(),
		})
		.strict()
		.superRefine((value, context) => {
			if (value.default !== undefined && !value.enum.includes(value.default)) {
				context.addIssue({ code: "custom", path: ["default"], message: "default is not in enum" });
			}
		});
	const TitledSingleSelectSchema = z
		.object({
			type: z.literal("string"),
			...CommonStringFields,
			oneOf: z.array(ConstOptionSchema),
			default: z.string().optional(),
		})
		.strict()
		.superRefine((value, context) => {
			if (
				value.default !== undefined &&
				!value.oneOf.some((option) => option.const === value.default)
			) {
				context.addIssue({ code: "custom", path: ["default"], message: "default is not in oneOf" });
			}
		});
	const LegacyTitledEnumSchema = z
		.object({
			type: z.literal("string"),
			...CommonStringFields,
			enum: z.array(wireText()),
			enumNames: z.array(wireText()).optional(),
			default: z.string().optional(),
		})
		.strict()
		.superRefine((value, context) => {
			if (value.default !== undefined && !value.enum.includes(value.default)) {
				context.addIssue({ code: "custom", path: ["default"], message: "default is not in enum" });
			}
		});
	const UntitledMultiItemsSchema = z
		.object({ type: z.literal("string"), enum: z.array(wireText()) })
		.strict();
	const TitledMultiItemsSchema = z.object({ anyOf: z.array(ConstOptionSchema) }).strict();
	const UntitledMultiSelectSchema = z
		.object({
			type: z.literal("array"),
			...CommonStringFields,
			minItems: WireIntegerSchema.nonnegative().optional(),
			maxItems: WireIntegerSchema.nonnegative().optional(),
			items: UntitledMultiItemsSchema,
			default: z.array(wireText()).optional(),
		})
		.strict()
		.superRefine((value, context) => {
			if (value.default?.some((entry) => !value.items.enum.includes(entry)) === true) {
				context.addIssue({ code: "custom", path: ["default"], message: "default is not in enum" });
			}
		});
	const TitledMultiSelectSchema = z
		.object({
			type: z.literal("array"),
			...CommonStringFields,
			minItems: WireIntegerSchema.nonnegative().optional(),
			maxItems: WireIntegerSchema.nonnegative().optional(),
			items: TitledMultiItemsSchema,
			default: z.array(wireText()).optional(),
		})
		.strict()
		.superRefine((value, context) => {
			const values = new Set(value.items.anyOf.map((entry) => entry.const));
			if (value.default?.some((entry) => !values.has(entry)) === true) {
				context.addIssue({ code: "custom", path: ["default"], message: "default is not in oneOf" });
			}
		});
	const EnumSchema = z.union([
		UntitledSingleSelectSchema,
		TitledSingleSelectSchema,
		LegacyTitledEnumSchema,
		UntitledMultiSelectSchema,
		TitledMultiSelectSchema,
	]);
	const PrimitiveSchema = z.union([StringSchema, NumberSchema, BooleanSchema, EnumSchema]);
	const SchemaSchema = z
		.object({
			$schema: OptionalWireTextSchema(),
			type: z.literal("object"),
			properties: z.record(z.string(), PrimitiveSchema),
			required: z.array(wireText()).optional(),
		})
		.strict();
	return { SchemaSchema, PrimitiveSchema };
}

export function createServerRequestSchemas(identities: IdentitySchemas) {
	const {
		ApprovalIdSchema,
		DynamicToolCallIdSchema,
		ItemIdSchema,
		JsonRpcRequestIdSchema,
		ThreadIdSchema,
		TurnIdSchema,
	} = identities;
	const RequestIdentityFieldsSchema = z
		.object({ threadId: ThreadIdSchema, turnId: TurnIdSchema, itemId: ItemIdSchema })
		.strict();
	const NetworkApprovalContextSchema = z
		.object({
			host: wireText(),
			protocol: z.enum(["http", "https", "socks5Tcp", "socks5Udp"]),
		})
		.strict();
	const FileSystemSpecialPathSchema = z.discriminatedUnion("kind", [
		z.object({ kind: z.literal("root") }).strict(),
		z.object({ kind: z.literal("minimal") }).strict(),
		z.object({ kind: z.literal("project_roots"), subpath: wireText().nullable() }).strict(),
		z.object({ kind: z.literal("tmpdir") }).strict(),
		z.object({ kind: z.literal("slash_tmp") }).strict(),
		z
			.object({
				kind: z.literal("unknown"),
				path: wireText(),
				subpath: wireText().nullable(),
			})
			.strict(),
	]);
	const FileSystemPathSchema = z.discriminatedUnion("type", [
		z.object({ type: z.literal("path"), path: wireText() }).strict(),
		z.object({ type: z.literal("glob_pattern"), pattern: wireText() }).strict(),
		z.object({ type: z.literal("special"), value: FileSystemSpecialPathSchema }).strict(),
	]);
	const FileSystemEntrySchema = z
		.object({ path: FileSystemPathSchema, access: z.enum(["read", "write", "deny"]) })
		.strict();
	const AdditionalFileSystemPermissionsSchema = z
		.object({
			read: z.array(wireText()).nullable(),
			write: z.array(wireText()).nullable(),
			globScanMaxDepth: WireIntegerSchema.optional(),
			entries: z.array(FileSystemEntrySchema).optional(),
		})
		.strict();
	const AdditionalNetworkPermissionsSchema = z.object({ enabled: z.boolean().nullable() }).strict();
	const AdditionalPermissionProfileSchema = z
		.object({
			network: AdditionalNetworkPermissionsSchema.nullable(),
			fileSystem: AdditionalFileSystemPermissionsSchema.nullable(),
		})
		.strict();
	const RequestPermissionProfileSchema = AdditionalPermissionProfileSchema;
	const GrantedPermissionProfileSchema = z
		.object({
			network: AdditionalNetworkPermissionsSchema.optional(),
			fileSystem: AdditionalFileSystemPermissionsSchema.optional(),
		})
		.strict();
	const NetworkPolicyAmendmentSchema = z
		.object({ host: wireText(), action: z.enum(["allow", "deny"]) })
		.strict();
	const ExecPolicyAmendmentSchema = z.array(wireText());
	const CommandActionSchema = z.discriminatedUnion("type", [
		z
			.object({
				type: z.literal("read"),
				command: wireText(),
				name: wireText(),
				path: wireText(),
			})
			.strict(),
		z
			.object({
				type: z.literal("listFiles"),
				command: wireText(),
				path: wireText().nullable(),
			})
			.strict(),
		z
			.object({
				type: z.literal("search"),
				command: wireText(),
				query: wireText().nullable(),
				path: wireText().nullable(),
			})
			.strict(),
		z.object({ type: z.literal("unknown"), command: wireText() }).strict(),
	]);
	const CommandExecutionApprovalDecisionSchema = z.union([
		z.enum(["accept", "acceptForSession", "decline", "cancel"]),
		z
			.object({
				acceptWithExecpolicyAmendment: z
					.object({ execpolicy_amendment: ExecPolicyAmendmentSchema })
					.strict(),
			})
			.strict(),
		z
			.object({
				applyNetworkPolicyAmendment: z
					.object({ network_policy_amendment: NetworkPolicyAmendmentSchema })
					.strict(),
			})
			.strict(),
	]);
	const CommandExecutionRequestApprovalParamsSchema = RequestIdentityFieldsSchema.extend({
		kind: z.enum(["command", "writeStdin"]),
		startedAtMs: WireIntegerSchema,
		approvalId: ApprovalIdSchema.nullable().optional(),
		environmentId: wireText().nullable(),
		reason: wireText().nullable().optional(),
		networkApprovalContext: NetworkApprovalContextSchema.nullable().optional(),
		command: wireText().nullable().optional(),
		cwd: wireText().nullable().optional(),
		commandActions: z.array(CommandActionSchema).nullable().optional(),
		additionalPermissions: AdditionalPermissionProfileSchema.nullable().optional(),
		proposedExecpolicyAmendment: ExecPolicyAmendmentSchema.nullable().optional(),
		proposedNetworkPolicyAmendments: z.array(NetworkPolicyAmendmentSchema).nullable().optional(),
		availableDecisions: z.array(CommandExecutionApprovalDecisionSchema).nullable().optional(),
	}).strict();
	const FileChangeRequestApprovalParamsSchema = RequestIdentityFieldsSchema.extend({
		startedAtMs: WireIntegerSchema,
		reason: wireText().nullable().optional(),
		grantRoot: wireText().nullable().optional(),
	}).strict();
	const ToolRequestUserInputOptionSchema = z
		.object({ label: wireText(), description: wireText() })
		.strict();
	const ToolRequestUserInputQuestionSchema = z
		.object({
			id: wireText(),
			header: wireText(),
			question: wireText(),
			isOther: z.boolean(),
			isSecret: z.boolean(),
			options: z.array(ToolRequestUserInputOptionSchema).nullable(),
		})
		.strict();
	const ToolRequestUserInputParamsSchema = RequestIdentityFieldsSchema.extend({
		questions: z.array(ToolRequestUserInputQuestionSchema),
		isBlocking: z.boolean(),
		autoResolutionMs: WireNumberSchema.nullable(),
	}).strict();
	const { SchemaSchema: McpElicitationSchema } = createMcpElicitationSchema();
	const ElicitationRequestParamsSchema = z
		.object({
			threadId: ThreadIdSchema,
			turnId: TurnIdSchema.nullable(),
			serverName: wireText(),
			mode: z.literal("form"),
			_meta: JsonValueSchema.nullable(),
			message: wireText(),
			requestedSchema: McpElicitationSchema,
		})
		.strict()
		.or(
			z
				.object({
					threadId: ThreadIdSchema,
					turnId: TurnIdSchema.nullable(),
					serverName: wireText(),
					mode: z.literal("openai/form"),
					_meta: JsonValueSchema.nullable(),
					message: wireText(),
					requestedSchema: JsonValueSchema,
				})
				.strict(),
		)
		.or(
			z
				.object({
					threadId: ThreadIdSchema,
					turnId: TurnIdSchema.nullable(),
					serverName: wireText(),
					mode: z.literal("url"),
					_meta: JsonValueSchema.nullable(),
					message: wireText(),
					url: wireText(),
					elicitationId: wireText(),
				})
				.strict(),
		);
	const PermissionsRequestApprovalParamsSchema = z
		.object({
			threadId: ThreadIdSchema,
			turnId: TurnIdSchema,
			itemId: ItemIdSchema,
			environmentId: wireText().nullable(),
			startedAtMs: WireIntegerSchema,
			cwd: wireText(),
			reason: wireText().nullable(),
			permissions: RequestPermissionProfileSchema,
		})
		.strict();
	const DynamicToolCallParamsSchema = z
		.object({
			threadId: ThreadIdSchema,
			turnId: TurnIdSchema,
			callId: DynamicToolCallIdSchema,
			namespace: wireText().nullable(),
			tool: wireText(),
			arguments: JsonValueSchema,
		})
		.strict();
	const TokenRefreshParamsSchema = z
		.object({
			reason: z.literal("unauthorized"),
			previousAccountId: wireText().nullable().optional(),
		})
		.strict();
	const EmptyParamsSchema = z.object({}).strict();
	const CurrentTimeReadParamsSchema = z.object({ threadId: ThreadIdSchema }).strict();
	const PatchApprovalParamsSchema = z
		.object({
			conversationId: ThreadIdSchema,
			callId: wireText(),
			fileChanges: z.record(z.string(), FileChangeSchema),
			reason: wireText().nullable(),
			grantRoot: wireText().nullable(),
		})
		.strict();
	const ParsedCommandSchema = z.discriminatedUnion("type", [
		z
			.object({
				type: z.literal("read"),
				cmd: wireText(),
				name: wireText(),
				path: wireText(),
			})
			.strict(),
		z
			.object({
				type: z.literal("list_files"),
				cmd: wireText(),
				path: wireText().nullable(),
			})
			.strict(),
		z
			.object({
				type: z.literal("search"),
				cmd: wireText(),
				query: wireText().nullable(),
				path: wireText().nullable(),
			})
			.strict(),
		z.object({ type: z.literal("unknown"), cmd: wireText() }).strict(),
	]);
	const ExecCommandApprovalParamsSchema = z
		.object({
			conversationId: ThreadIdSchema,
			callId: wireText(),
			approvalId: ApprovalIdSchema.nullable(),
			command: z.array(wireText()),
			cwd: wireText(),
			reason: wireText().nullable(),
			parsedCmd: z.array(ParsedCommandSchema),
		})
		.strict();

	const ServerRequestSchema = z.discriminatedUnion("method", [
		z
			.object({
				method: z.literal("item/commandExecution/requestApproval"),
				id: JsonRpcRequestIdSchema,
				params: CommandExecutionRequestApprovalParamsSchema,
			})
			.strict(),
		z
			.object({
				method: z.literal("item/fileChange/requestApproval"),
				id: JsonRpcRequestIdSchema,
				params: FileChangeRequestApprovalParamsSchema,
			})
			.strict(),
		z
			.object({
				method: z.literal("item/tool/requestUserInput"),
				id: JsonRpcRequestIdSchema,
				params: ToolRequestUserInputParamsSchema,
			})
			.strict(),
		z
			.object({
				method: z.literal("mcpServer/elicitation/request"),
				id: JsonRpcRequestIdSchema,
				params: ElicitationRequestParamsSchema,
			})
			.strict(),
		z
			.object({
				method: z.literal("item/permissions/requestApproval"),
				id: JsonRpcRequestIdSchema,
				params: PermissionsRequestApprovalParamsSchema,
			})
			.strict(),
		z
			.object({
				method: z.literal("item/tool/call"),
				id: JsonRpcRequestIdSchema,
				params: DynamicToolCallParamsSchema,
			})
			.strict(),
		z
			.object({
				method: z.literal("account/chatgptAuthTokens/refresh"),
				id: JsonRpcRequestIdSchema,
				params: TokenRefreshParamsSchema,
			})
			.strict(),
		z
			.object({
				method: z.literal("attestation/generate"),
				id: JsonRpcRequestIdSchema,
				params: EmptyParamsSchema,
			})
			.strict(),
		z
			.object({
				method: z.literal("currentTime/read"),
				id: JsonRpcRequestIdSchema,
				params: CurrentTimeReadParamsSchema,
			})
			.strict(),
		z
			.object({
				method: z.literal("applyPatchApproval"),
				id: JsonRpcRequestIdSchema,
				params: PatchApprovalParamsSchema,
			})
			.strict(),
		z
			.object({
				method: z.literal("execCommandApproval"),
				id: JsonRpcRequestIdSchema,
				params: ExecCommandApprovalParamsSchema,
			})
			.strict(),
	]);

	const FileChangeApprovalDecisionSchema = z.enum([
		"accept",
		"acceptForSession",
		"decline",
		"cancel",
	]);
	const ReviewDecisionSchema = z.union([
		z.literal("approved"),
		z
			.object({
				approved_execpolicy_amendment: z
					.object({ proposed_execpolicy_amendment: ExecPolicyAmendmentSchema })
					.strict(),
			})
			.strict(),
		z.literal("approved_for_session"),
		z.literal("approved_mcp_policy_amendment"),
		z
			.object({
				network_policy_amendment: z
					.object({ network_policy_amendment: NetworkPolicyAmendmentSchema })
					.strict(),
			})
			.strict(),
		z.object({ denied: z.object({ rejection: wireText() }).strict() }).strict(),
		z.literal("timed_out"),
		z.literal("abort"),
	]);
	const UserInputAnswerSchema = z.object({ answers: z.array(wireText()) }).strict();
	const UserInputResponseSchema = z
		.object({ answers: z.record(z.string(), UserInputAnswerSchema) })
		.strict();
	const ElicitationResponseSchema = z
		.object({
			action: z.enum(["accept", "decline", "cancel"]),
			content: JsonValueSchema.nullable(),
			_meta: JsonValueSchema.nullable(),
		})
		.strict();
	const DynamicToolCallResponseSchema = z
		.object({
			contentItems: z.tuple([
				z.object({ type: z.literal("inputText"), text: boundedText(16_384) }).strict(),
			]),
			success: z.boolean(),
		})
		.strict();
	const PermissionsResponseSchema = z
		.object({
			permissions: GrantedPermissionProfileSchema,
			scope: z.enum(["turn", "session"]),
			strictAutoReview: z.boolean().optional(),
		})
		.strict();
	const CommandExecutionResponseSchema = z
		.object({ decision: CommandExecutionApprovalDecisionSchema })
		.strict();
	const FileChangeResponseSchema = z
		.object({ decision: FileChangeApprovalDecisionSchema })
		.strict();
	const CurrentTimeResponseSchema = CurrentTimeReadResponseSchema;
	const ApplyPatchResponseSchema = z.object({ decision: ReviewDecisionSchema }).strict();
	const ExecCommandResponseSchema = z.object({ decision: ReviewDecisionSchema }).strict();
	const TokenRefreshErrorSchema = z
		.object({
			code: z.literal(UNSUPPORTED_TOKEN_REFRESH_ERROR.code),
			message: z.literal(UNSUPPORTED_TOKEN_REFRESH_ERROR.message),
		})
		.strict();
	const AttestationErrorSchema = z
		.object({
			code: z.literal(UNSUPPORTED_ATTESTATION_ERROR.code),
			message: z.literal(UNSUPPORTED_ATTESTATION_ERROR.message),
		})
		.strict();

	const ServerRequestResultSchema = z.discriminatedUnion("method", [
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
		z
			.object({ method: z.literal("item/tool/call"), result: DynamicToolCallResponseSchema })
			.strict(),
		z
			.object({
				method: z.literal("account/chatgptAuthTokens/refresh"),
				error: TokenRefreshErrorSchema,
			})
			.strict(),
		z.object({ method: z.literal("attestation/generate"), error: AttestationErrorSchema }).strict(),
		z.object({ method: z.literal("currentTime/read"), result: CurrentTimeResponseSchema }).strict(),
		z
			.object({ method: z.literal("applyPatchApproval"), result: ApplyPatchResponseSchema })
			.strict(),
		z
			.object({ method: z.literal("execCommandApproval"), result: ExecCommandResponseSchema })
			.strict(),
	]);

	return {
		ServerRequestMethodSchema: z.enum(SERVER_REQUEST_METHODS),
		ServerRequestSchema,
		ServerRequestResultSchema,
		CommandExecutionApprovalDecisionSchema,
		FileChangeApprovalDecisionSchema,
		ReviewDecisionSchema,
		UserInputResponseSchema,
		ElicitationResponseSchema,
		PermissionsResponseSchema,
		DynamicToolCallResponseSchema,
	};
}

export type ServerRequestSchemas = ReturnType<typeof createServerRequestSchemas>;
export type ServerRequestMethod = z.infer<ServerRequestSchemas["ServerRequestMethodSchema"]>;
export type ServerRequest = z.infer<ServerRequestSchemas["ServerRequestSchema"]>;
export type ServerRequestResult = z.infer<ServerRequestSchemas["ServerRequestResultSchema"]>;
export type CodexServerRequest = ServerRequest;
