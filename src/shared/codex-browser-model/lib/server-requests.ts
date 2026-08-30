import { z } from "zod";

import {
	ApprovalIdSchema,
	DynamicToolCallIdSchema,
	FileChangeSchema,
	JsonRpcRequestIdSchema,
	ItemIdSchema,
	JsonValueSchema,
	ThreadIdSchema,
	TurnIdSchema,
	boundedText,
	optionalNullableText,
} from "./server-request-scalars.js";

const RequestIdentityFieldsSchema = z
	.object({ threadId: ThreadIdSchema, turnId: TurnIdSchema, itemId: ItemIdSchema })
	.strict();

const NetworkApprovalContextSchema = z
	.object({
		host: boundedText(2048),
		protocol: z.enum(["http", "https", "socks5Tcp", "socks5Udp"]),
	})
	.strict();

const NetworkPermissionSchema = z.object({ enabled: z.boolean().nullable() }).strict();
const FileSystemSpecialPathSchema = z.discriminatedUnion("kind", [
	z.object({ kind: z.literal("root") }).strict(),
	z.object({ kind: z.literal("minimal") }).strict(),
	z.object({ kind: z.literal("project_roots"), subpath: boundedText(16_384).nullable() }).strict(),
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
const FileSystemPathSchema = z.discriminatedUnion("type", [
	z.object({ type: z.literal("path"), path: boundedText(16_384) }).strict(),
	z.object({ type: z.literal("glob_pattern"), pattern: boundedText(16_384) }).strict(),
	z.object({ type: z.literal("special"), value: FileSystemSpecialPathSchema }).strict(),
]);
const FileSystemEntrySchema = z
	.object({ path: FileSystemPathSchema, access: z.enum(["read", "write", "deny"]) })
	.strict();
const FileSystemPermissionSchema = z
	.object({
		read: z.array(JsonValueSchema).nullable(),
		write: z.array(JsonValueSchema).nullable(),
		globScanMaxDepth: z.number().int().optional(),
		entries: z.array(FileSystemEntrySchema).optional(),
	})
	.strict();
const PermissionProfileSchema = z
	.object({
		network: NetworkPermissionSchema.nullable(),
		fileSystem: FileSystemPermissionSchema.nullable(),
	})
	.strict();

const CommandActionSchema = z.discriminatedUnion("type", [
	z
		.object({
			type: z.literal("read"),
			command: boundedText(16_384),
			name: boundedText(256),
			path: boundedText(16_384),
		})
		.strict(),
	z
		.object({
			type: z.literal("listFiles"),
			command: boundedText(16_384),
			path: boundedText(16_384).nullable(),
		})
		.strict(),
	z
		.object({
			type: z.literal("search"),
			command: boundedText(16_384),
			query: boundedText(16_384).nullable(),
			path: boundedText(16_384).nullable(),
		})
		.strict(),
	z.object({ type: z.literal("unknown"), command: boundedText(16_384) }).strict(),
]);

const ExecPolicyAmendmentSchema = z.array(boundedText(16_384));
const NetworkPolicyAmendmentSchema = z
	.object({ host: boundedText(2048), action: z.enum(["allow", "deny"]) })
	.strict();
const CommandDecisionSchema = z.union([
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

const CommandExecutionRequestParamsSchema = RequestIdentityFieldsSchema.extend({
	kind: z.enum(["command", "writeStdin"]),
	startedAtMs: z.number().int().nonnegative(),
	approvalId: ApprovalIdSchema.nullable().optional(),
	environmentId: boundedText(256).nullable(),
	reason: optionalNullableText(16_384),
	networkApprovalContext: NetworkApprovalContextSchema.nullable().optional(),
	command: boundedText(16_384).nullable().optional(),
	cwd: boundedText(16_384).nullable().optional(),
	commandActions: z.array(CommandActionSchema).nullable().optional(),
	additionalPermissions: PermissionProfileSchema.nullable().optional(),
	proposedExecpolicyAmendment: ExecPolicyAmendmentSchema.nullable().optional(),
	proposedNetworkPolicyAmendments: z.array(NetworkPolicyAmendmentSchema).nullable().optional(),
	availableDecisions: z.array(CommandDecisionSchema).nullable().optional(),
}).strict();

const FileChangeRequestParamsSchema = RequestIdentityFieldsSchema.extend({
	startedAtMs: z.number().int().nonnegative(),
	reason: optionalNullableText(16_384),
	grantRoot: optionalNullableText(16_384),
}).strict();

const UserInputOptionSchema = z
	.object({ label: boundedText(256), description: boundedText(2048) })
	.strict();
const UserInputQuestionSchema = z
	.object({
		id: boundedText(256),
		header: boundedText(256),
		question: boundedText(4096),
		isOther: z.boolean(),
		isSecret: z.boolean(),
		options: z.array(UserInputOptionSchema).nullable(),
	})
	.strict();
const UserInputRequestParamsSchema = RequestIdentityFieldsSchema.extend({
	questions: z.array(UserInputQuestionSchema),
	isBlocking: z.boolean(),
	autoResolutionMs: z.number().int().nonnegative().nullable(),
}).strict();

const ElicitationPrimitiveSchema = z
	.object({
		type: z.enum(["string", "number", "integer", "boolean"]),
		title: boundedText(256).optional(),
		description: boundedText(2048).optional(),
		minLength: z.number().int().nonnegative().optional(),
		maxLength: z.number().int().nonnegative().optional(),
		minimum: z.number().optional(),
		maximum: z.number().optional(),
		format: boundedText(256).optional(),
		default: JsonValueSchema.optional(),
	})
	.strict();
const ElicitationSchema = z
	.object({
		$schema: boundedText(2048).optional(),
		type: z.literal("object"),
		properties: z.record(z.string(), ElicitationPrimitiveSchema),
		required: z.array(boundedText(256)).optional(),
	})
	.strict();
const ElicitationRequestParamsSchema = z
	.object({
		threadId: ThreadIdSchema,
		turnId: TurnIdSchema.nullable(),
		serverName: boundedText(256),
	})
	.and(
		z.discriminatedUnion("mode", [
			z
				.object({
					mode: z.literal("form"),
					_meta: JsonValueSchema.nullable(),
					message: boundedText(16_384),
					requestedSchema: ElicitationSchema,
				})
				.strict(),
			z
				.object({
					mode: z.literal("openai/form"),
					_meta: JsonValueSchema.nullable(),
					message: boundedText(16_384),
					requestedSchema: JsonValueSchema,
				})
				.strict(),
			z
				.object({
					mode: z.literal("url"),
					_meta: JsonValueSchema.nullable(),
					message: boundedText(16_384),
					url: boundedText(2048),
					elicitationId: boundedText(256),
				})
				.strict(),
		]),
	);

const PermissionsRequestParamsSchema = z
	.object({
		threadId: ThreadIdSchema,
		turnId: TurnIdSchema,
		itemId: ItemIdSchema,
		environmentId: boundedText(256).nullable(),
		startedAtMs: z.number().int().nonnegative(),
		cwd: boundedText(16_384),
		reason: boundedText(16_384).nullable(),
		permissions: PermissionProfileSchema,
	})
	.strict();

const DynamicToolCallParamsSchema = z
	.object({
		threadId: ThreadIdSchema,
		turnId: TurnIdSchema,
		callId: DynamicToolCallIdSchema,
		namespace: boundedText(256).nullable(),
		tool: boundedText(256),
		arguments: JsonValueSchema,
	})
	.strict();

const TokenRefreshParamsSchema = z
	.object({ reason: z.literal("unauthorized"), previousAccountId: optionalNullableText(256) })
	.strict();
const EmptyParamsSchema = z.object({}).strict();
const CurrentTimeRequestParamsSchema = z.object({ threadId: ThreadIdSchema }).strict();
const PatchApprovalParamsSchema = z
	.object({
		conversationId: ThreadIdSchema,
		callId: boundedText(256),
		fileChanges: z.record(z.string(), FileChangeSchema),
		reason: boundedText(16_384).nullable(),
		grantRoot: boundedText(16_384).nullable(),
	})
	.strict();
const ParsedCommandSchema = z.discriminatedUnion("type", [
	z
		.object({
			type: z.literal("read"),
			cmd: boundedText(16_384),
			name: boundedText(256),
			path: boundedText(16_384),
		})
		.strict(),
	z
		.object({
			type: z.literal("list_files"),
			cmd: boundedText(16_384),
			path: boundedText(16_384).nullable(),
		})
		.strict(),
	z
		.object({
			type: z.literal("search"),
			cmd: boundedText(16_384),
			query: boundedText(16_384).nullable(),
			path: boundedText(16_384).nullable(),
		})
		.strict(),
	z.object({ type: z.literal("unknown"), cmd: boundedText(16_384) }).strict(),
]);
const ExecApprovalParamsSchema = z
	.object({
		conversationId: ThreadIdSchema,
		callId: boundedText(256),
		approvalId: ApprovalIdSchema.nullable(),
		command: z.array(boundedText(16_384)),
		cwd: boundedText(16_384),
		reason: boundedText(16_384).nullable(),
		parsedCmd: z.array(ParsedCommandSchema),
	})
	.strict();

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
export const ServerRequestMethodSchema = z.enum(SERVER_REQUEST_METHODS);

export const ServerRequestSchema = z.discriminatedUnion("method", [
	z
		.object({
			method: z.literal("item/commandExecution/requestApproval"),
			id: JsonRpcRequestIdSchema,
			params: CommandExecutionRequestParamsSchema,
		})
		.strict(),
	z
		.object({
			method: z.literal("item/fileChange/requestApproval"),
			id: JsonRpcRequestIdSchema,
			params: FileChangeRequestParamsSchema,
		})
		.strict(),
	z
		.object({
			method: z.literal("item/tool/requestUserInput"),
			id: JsonRpcRequestIdSchema,
			params: UserInputRequestParamsSchema,
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
			params: PermissionsRequestParamsSchema,
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
			params: CurrentTimeRequestParamsSchema,
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
			params: ExecApprovalParamsSchema,
		})
		.strict(),
]);

export const ServerRequestResultSchema = z
	.object({
		contentItems: z.tuple([
			z.object({ type: z.literal("inputText"), text: boundedText(16_384) }).strict(),
		]),
		success: z.boolean(),
	})
	.strict();

export type ServerRequestMethod = (typeof SERVER_REQUEST_METHODS)[number];
export type ServerRequest = z.infer<typeof ServerRequestSchema>;
export type ServerRequestResult = z.infer<typeof ServerRequestResultSchema>;
export type CodexServerRequest = ServerRequest;
