import { z } from "zod";

import type {
	CodexIngressConformance,
	CodexOutputConformance,
	CodexServerRequest as GeneratedCodexServerRequest,
	CodexServerRequestParamsByMethod,
	CodexServerResponseByMethod,
} from "../../codex-app-server-contract/index.js";
import { CodexSafeI64Schema } from "../../codex-app-server-contract/index.js";
import {
	CurrentTimeReadResponseSchema,
	UNSUPPORTED_ATTESTATION_ERROR,
	UNSUPPORTED_TOKEN_REFRESH_ERROR,
} from "./authored.js";
import { FileChangeSchema, JsonValueSchema, boundedText } from "./server-request-scalars.js";
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
] as const satisfies readonly (keyof CodexServerRequestParamsByMethod)[];

function codexIngressSchema<Wire>() {
	return <Schema extends z.ZodType>(
		schema: Schema & CodexIngressConformance<Wire, z.input<Schema>, z.output<Schema>>,
	): Schema => schema;
}

function codexOutputSchema<Wire>() {
	return <Schema extends z.ZodType>(
		schema: Schema & CodexOutputConformance<Wire, z.output<Schema>>,
	): Schema => schema;
}

const WireNumberSchema = z.number();
const WireIntegerSchema = z.number().int();
const NonNegativeCodexSafeI64Schema = CodexSafeI64Schema.refine((value) => value >= 0, {
	message: "Expected a non-negative safe i64",
});
const WireStringSchema = z.string();
const OptionalWireStringSchema = () => WireStringSchema.optional();

function createMcpElicitationSchema() {
	const CommonStringFields = {
		title: OptionalWireStringSchema(),
		description: OptionalWireStringSchema(),
	};
	const StringSchema = z
		.object({
			type: z.literal("string"),
			...CommonStringFields,
			minLength: WireIntegerSchema.nonnegative().optional(),
			maxLength: WireIntegerSchema.nonnegative().optional(),
			format: z.enum(["email", "uri", "date", "date-time"]).optional(),
			default: WireStringSchema.optional(),
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
	const ConstOptionSchema = z.object({ const: WireStringSchema, title: WireStringSchema }).strict();
	const UntitledSingleSelectSchema = z
		.object({
			type: z.literal("string"),
			...CommonStringFields,
			enum: z.array(WireStringSchema),
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
			enum: z.array(WireStringSchema),
			enumNames: z.array(WireStringSchema).optional(),
			default: z.string().optional(),
		})
		.strict()
		.superRefine((value, context) => {
			if (value.default !== undefined && !value.enum.includes(value.default)) {
				context.addIssue({ code: "custom", path: ["default"], message: "default is not in enum" });
			}
		});
	const UntitledMultiItemsSchema = z
		.object({ type: z.literal("string"), enum: z.array(WireStringSchema) })
		.strict();
	const TitledMultiItemsSchema = z.object({ anyOf: z.array(ConstOptionSchema) }).strict();
	const UntitledMultiSelectSchema = z
		.object({
			type: z.literal("array"),
			...CommonStringFields,
			minItems: NonNegativeCodexSafeI64Schema.optional(),
			maxItems: NonNegativeCodexSafeI64Schema.optional(),
			items: UntitledMultiItemsSchema,
			default: z.array(WireStringSchema).optional(),
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
			minItems: NonNegativeCodexSafeI64Schema.optional(),
			maxItems: NonNegativeCodexSafeI64Schema.optional(),
			items: TitledMultiItemsSchema,
			default: z.array(WireStringSchema).optional(),
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
			$schema: OptionalWireStringSchema(),
			type: z.literal("object"),
			properties: z.record(z.string(), PrimitiveSchema),
			required: z.array(WireStringSchema).optional(),
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
			host: WireStringSchema,
			protocol: z.enum(["http", "https", "socks5Tcp", "socks5Udp"]),
		})
		.strict();
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
	const FileSystemEntrySchema = z
		.object({ path: FileSystemPathSchema, access: z.enum(["read", "write", "deny"]) })
		.strict();
	const AdditionalFileSystemPermissionsSchema = z
		.object({
			read: z.array(WireStringSchema).nullable(),
			write: z.array(WireStringSchema).nullable(),
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
		.object({ host: WireStringSchema, action: z.enum(["allow", "deny"]) })
		.strict();
	const ExecPolicyAmendmentSchema = z.array(WireStringSchema);
	const CommandActionSchema = z.discriminatedUnion("type", [
		z
			.object({
				type: z.literal("read"),
				command: WireStringSchema,
				name: WireStringSchema,
				path: WireStringSchema,
			})
			.strict(),
		z
			.object({
				type: z.literal("listFiles"),
				command: WireStringSchema,
				path: WireStringSchema.nullable(),
			})
			.strict(),
		z
			.object({
				type: z.literal("search"),
				command: WireStringSchema,
				query: WireStringSchema.nullable(),
				path: WireStringSchema.nullable(),
			})
			.strict(),
		z.object({ type: z.literal("unknown"), command: WireStringSchema }).strict(),
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
		environmentId: WireStringSchema.nullable(),
		reason: WireStringSchema.nullable().optional(),
		networkApprovalContext: NetworkApprovalContextSchema.nullable().optional(),
		command: WireStringSchema.nullable().optional(),
		cwd: WireStringSchema.nullable().optional(),
		commandActions: z.array(CommandActionSchema).nullable().optional(),
		additionalPermissions: AdditionalPermissionProfileSchema.nullable().optional(),
		proposedExecpolicyAmendment: ExecPolicyAmendmentSchema.nullable().optional(),
		proposedNetworkPolicyAmendments: z.array(NetworkPolicyAmendmentSchema).nullable().optional(),
		availableDecisions: z.array(CommandExecutionApprovalDecisionSchema).nullable().optional(),
	}).strict();
	const FileChangeRequestApprovalParamsSchema = RequestIdentityFieldsSchema.extend({
		startedAtMs: WireIntegerSchema,
		reason: WireStringSchema.nullable().optional(),
		grantRoot: WireStringSchema.nullable().optional(),
	}).strict();
	const ToolRequestUserInputOptionSchema = z
		.object({ label: WireStringSchema, description: WireStringSchema })
		.strict();
	const ToolRequestUserInputQuestionSchema = z
		.object({
			id: WireStringSchema,
			header: WireStringSchema,
			question: WireStringSchema,
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
			serverName: WireStringSchema,
			mode: z.literal("form"),
			_meta: JsonValueSchema.nullable(),
			message: WireStringSchema,
			requestedSchema: McpElicitationSchema,
		})
		.strict()
		.or(
			z
				.object({
					threadId: ThreadIdSchema,
					turnId: TurnIdSchema.nullable(),
					serverName: WireStringSchema,
					mode: z.literal("openai/form"),
					_meta: JsonValueSchema.nullable(),
					message: WireStringSchema,
					requestedSchema: JsonValueSchema,
				})
				.strict(),
		)
		.or(
			z
				.object({
					threadId: ThreadIdSchema,
					turnId: TurnIdSchema.nullable(),
					serverName: WireStringSchema,
					mode: z.literal("url"),
					_meta: JsonValueSchema.nullable(),
					message: WireStringSchema,
					url: WireStringSchema,
					elicitationId: WireStringSchema,
				})
				.strict(),
		);
	const PermissionsRequestApprovalParamsSchema = z
		.object({
			threadId: ThreadIdSchema,
			turnId: TurnIdSchema,
			itemId: ItemIdSchema,
			environmentId: WireStringSchema.nullable(),
			startedAtMs: WireIntegerSchema,
			cwd: WireStringSchema,
			reason: WireStringSchema.nullable(),
			permissions: RequestPermissionProfileSchema,
		})
		.strict();
	const DynamicToolCallParamsSchema = z
		.object({
			threadId: ThreadIdSchema,
			turnId: TurnIdSchema,
			callId: DynamicToolCallIdSchema,
			namespace: WireStringSchema.nullable(),
			tool: WireStringSchema,
			arguments: JsonValueSchema,
		})
		.strict();
	const TokenRefreshParamsSchema = z
		.object({
			reason: z.literal("unauthorized"),
			previousAccountId: WireStringSchema.nullable().optional(),
		})
		.strict();
	const EmptyParamsSchema = z.object({}).strict();
	const CurrentTimeReadParamsSchema = z.object({ threadId: ThreadIdSchema }).strict();
	const PatchApprovalParamsSchema = z
		.object({
			conversationId: ThreadIdSchema,
			callId: WireStringSchema,
			fileChanges: z.record(z.string(), FileChangeSchema),
			reason: WireStringSchema.nullable(),
			grantRoot: WireStringSchema.nullable(),
		})
		.strict();
	const ParsedCommandSchema = z.discriminatedUnion("type", [
		z
			.object({
				type: z.literal("read"),
				cmd: WireStringSchema,
				name: WireStringSchema,
				path: WireStringSchema,
			})
			.strict(),
		z
			.object({
				type: z.literal("list_files"),
				cmd: WireStringSchema,
				path: WireStringSchema.nullable(),
			})
			.strict(),
		z
			.object({
				type: z.literal("search"),
				cmd: WireStringSchema,
				query: WireStringSchema.nullable(),
				path: WireStringSchema.nullable(),
			})
			.strict(),
		z.object({ type: z.literal("unknown"), cmd: WireStringSchema }).strict(),
	]);
	const ExecCommandApprovalParamsSchema = z
		.object({
			conversationId: ThreadIdSchema,
			callId: WireStringSchema,
			approvalId: ApprovalIdSchema.nullable(),
			command: z.array(WireStringSchema),
			cwd: WireStringSchema,
			reason: WireStringSchema.nullable(),
			parsedCmd: z.array(ParsedCommandSchema),
		})
		.strict();

	const ServerRequestSchema = codexIngressSchema<GeneratedCodexServerRequest>()(
		z.discriminatedUnion("method", [
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
		]),
	);

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
		z.object({ denied: z.object({ rejection: WireStringSchema }).strict() }).strict(),
		z.literal("timed_out"),
		z.literal("abort"),
	]);
	const UserInputAnswerSchema = z.object({ answers: z.array(WireStringSchema) }).strict();
	const UserInputResponseSchema = codexOutputSchema<
		CodexServerResponseByMethod["item/tool/requestUserInput"]
	>()(z.object({ answers: z.record(z.string(), UserInputAnswerSchema) }).strict());
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
	>()(z.object({ decision: CommandExecutionApprovalDecisionSchema }).strict());
	const FileChangeResponseSchema = codexOutputSchema<
		CodexServerResponseByMethod["item/fileChange/requestApproval"]
	>()(z.object({ decision: FileChangeApprovalDecisionSchema }).strict());
	const CurrentTimeResponseSchema = codexOutputSchema<
		CodexServerResponseByMethod["currentTime/read"]
	>()(CurrentTimeReadResponseSchema);
	const ApplyPatchResponseSchema = codexOutputSchema<
		CodexServerResponseByMethod["applyPatchApproval"]
	>()(z.object({ decision: ReviewDecisionSchema }).strict());
	const ExecCommandResponseSchema = codexOutputSchema<
		CodexServerResponseByMethod["execCommandApproval"]
	>()(z.object({ decision: ReviewDecisionSchema }).strict());
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
export type CodexServerRequest = GeneratedCodexServerRequest;
