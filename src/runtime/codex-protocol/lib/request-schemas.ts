import { z } from "zod";

import { CommandActionSchema, FileChangeSchema } from "./item-schemas.js";
import type { ClientNotificationMethod, ServerRequestMethod } from "./methods.js";
import {
	ObjectSchema,
	JsonRecordSchema,
	JsonValueSchema,
	RequestIdSchema,
	looseObject,
} from "./scalars.js";

export const ClientInfoSchema = z.strictObject({
	name: z.string(),
	title: z.string().nullable(),
	version: z.string(),
});

/** The literal capabilities authored by Archboard's app-server client. */
export const InitializeCapabilitiesSchema = z.strictObject({
	experimentalApi: z.literal(true),
	requestAttestation: z.literal(false),
	mcpServerOpenaiFormElicitation: z.literal(true),
	optOutNotificationMethods: z.array(z.string()).length(0),
	extensions: z.strictObject({}),
});

export const InitializeParamsSchema = z.strictObject({
	clientInfo: ClientInfoSchema,
	capabilities: InitializeCapabilitiesSchema,
});

export const LoginAccountParamsSchema = z.discriminatedUnion("type", [
	looseObject({ type: z.literal("apiKey"), apiKey: z.string() }),
	looseObject({
		type: z.literal("chatgpt"),
		codexStreamlinedLogin: z.boolean().optional(),
		useHostedLoginSuccessPage: z.boolean().optional(),
		appBrand: JsonValueSchema.nullable().optional(),
	}),
	looseObject({ type: z.literal("chatgptDeviceCode") }),
	looseObject({
		type: z.literal("chatgptAuthTokens"),
		accessToken: z.string(),
		chatgptAccountId: z.string(),
		chatgptPlanType: z.string().nullable().optional(),
	}),
	looseObject({ type: z.literal("amazonBedrock"), apiKey: z.string(), region: z.string() }),
	looseObject({
		type: z.literal("amazonBedrockAccessKeys"),
		accessKeyId: z.string(),
		secretAccessKey: z.string(),
		sessionToken: z.string().nullable().optional(),
		region: z.string(),
	}),
]);

export const CancelLoginAccountParamsSchema = looseObject({ loginId: z.string() });
export const AccountReadParamsSchema = looseObject({ refreshToken: z.boolean().optional() });

const RequestPermissionSchema = looseObject({
	network: JsonRecordSchema.nullable(),
	fileSystem: JsonRecordSchema.nullable(),
});

export const CommandExecutionRequestApprovalParamsSchema = looseObject({
	kind: z.enum(["command", "writeStdin"]),
	threadId: z.string(),
	turnId: z.string(),
	itemId: z.string(),
	startedAtMs: z.number().finite(),
	approvalId: z.string().nullable().optional(),
	environmentId: z.string().nullable(),
	reason: z.string().nullable().optional(),
	networkApprovalContext: ObjectSchema.nullable().optional(),
	command: z.string().nullable().optional(),
	cwd: z.string().nullable().optional(),
	commandActions: z.array(CommandActionSchema).nullable().optional(),
	additionalPermissions: RequestPermissionSchema.nullable().optional(),
	proposedExecpolicyAmendment: z.array(z.string()).nullable().optional(),
	proposedNetworkPolicyAmendments: z.array(ObjectSchema).nullable().optional(),
	availableDecisions: z.array(JsonValueSchema).nullable().optional(),
});

export const FileChangeRequestApprovalParamsSchema = looseObject({
	threadId: z.string(),
	turnId: z.string(),
	itemId: z.string(),
	startedAtMs: z.number().finite(),
	reason: z.string().nullable().optional(),
	grantRoot: z.string().nullable().optional(),
});

const UserInputQuestionSchema = looseObject({
	id: z.string(),
	header: z.string(),
	question: z.string(),
	isOther: z.boolean(),
	isSecret: z.boolean(),
	options: z.array(looseObject({ label: z.string(), description: z.string() })).nullable(),
});

export const ToolRequestUserInputParamsSchema = looseObject({
	threadId: z.string(),
	turnId: z.string(),
	itemId: z.string(),
	questions: z.array(UserInputQuestionSchema),
	isBlocking: z.boolean(),
	autoResolutionMs: z.number().finite().nullable(),
});

const McpElicitationBaseSchema = {
	threadId: z.string(),
	turnId: z.string().nullable(),
	serverName: z.string(),
};
export const McpServerElicitationRequestParamsSchema = z.discriminatedUnion("mode", [
	looseObject({
		...McpElicitationBaseSchema,
		mode: z.literal("form"),
		_meta: JsonValueSchema.nullable(),
		message: z.string(),
		requestedSchema: ObjectSchema,
	}),
	looseObject({
		...McpElicitationBaseSchema,
		mode: z.literal("openai/form"),
		_meta: JsonValueSchema.nullable(),
		message: z.string(),
		requestedSchema: JsonValueSchema,
	}),
	looseObject({
		...McpElicitationBaseSchema,
		mode: z.literal("url"),
		_meta: JsonValueSchema.nullable(),
		message: z.string(),
		url: z.string(),
		elicitationId: z.string(),
	}),
]);

export const PermissionsRequestApprovalParamsSchema = looseObject({
	threadId: z.string(),
	turnId: z.string(),
	itemId: z.string(),
	environmentId: z.string().nullable(),
	startedAtMs: z.number().finite(),
	cwd: z.string(),
	reason: z.string().nullable(),
	permissions: RequestPermissionSchema,
});

export const DynamicToolCallParamsSchema = looseObject({
	threadId: z.string(),
	turnId: z.string(),
	callId: z.string(),
	namespace: z.string().nullable(),
	tool: z.string(),
	arguments: JsonValueSchema,
});

export const ChatgptAuthTokensRefreshParamsSchema = looseObject({
	reason: z.literal("unauthorized"),
	previousAccountId: z.string().nullable().optional(),
});
export const AttestationGenerateParamsSchema = z.strictObject({});
export const CurrentTimeReadParamsSchema = looseObject({ threadId: z.string() });

const ParsedCommandSchema = z.discriminatedUnion("type", [
	looseObject({ type: z.literal("read"), cmd: z.string(), name: z.string(), path: z.string() }),
	looseObject({ type: z.literal("list_files"), cmd: z.string(), path: z.string().nullable() }),
	looseObject({
		type: z.literal("search"),
		cmd: z.string(),
		query: z.string().nullable(),
		path: z.string().nullable(),
	}),
	looseObject({ type: z.literal("unknown"), cmd: z.string() }),
]);

export const ApplyPatchApprovalParamsSchema = looseObject({
	conversationId: z.string(),
	callId: z.string(),
	fileChanges: z.record(z.string(), FileChangeSchema),
	reason: z.string().nullable(),
	grantRoot: z.string().nullable(),
});

export const ExecCommandApprovalParamsSchema = looseObject({
	conversationId: z.string(),
	callId: z.string(),
	approvalId: z.string().nullable(),
	command: z.array(z.string()),
	cwd: z.string(),
	reason: z.string().nullable(),
	parsedCmd: z.array(ParsedCommandSchema),
});

export const SERVER_REQUEST_SCHEMAS = {
	"item/commandExecution/requestApproval": CommandExecutionRequestApprovalParamsSchema,
	"item/fileChange/requestApproval": FileChangeRequestApprovalParamsSchema,
	"item/tool/requestUserInput": ToolRequestUserInputParamsSchema,
	"mcpServer/elicitation/request": McpServerElicitationRequestParamsSchema,
	"item/permissions/requestApproval": PermissionsRequestApprovalParamsSchema,
	"item/tool/call": DynamicToolCallParamsSchema,
	"account/chatgptAuthTokens/refresh": ChatgptAuthTokensRefreshParamsSchema,
	"attestation/generate": AttestationGenerateParamsSchema,
	"currentTime/read": CurrentTimeReadParamsSchema,
	applyPatchApproval: ApplyPatchApprovalParamsSchema,
	execCommandApproval: ExecCommandApprovalParamsSchema,
} as const satisfies Record<ServerRequestMethod, z.ZodTypeAny>;

export const CLIENT_NOTIFICATION_SCHEMAS = {
	initialized: z.strictObject({ method: z.literal("initialized") }),
} as const satisfies Record<ClientNotificationMethod, z.ZodTypeAny>;

export const JsonRpcErrorSchema = looseObject({
	id: RequestIdSchema,
	error: looseObject({
		code: z.number().int(),
		message: z.string(),
		data: JsonValueSchema.optional(),
	}),
});

export const JSON_RPC_ERROR_CODES = Object.freeze({
	parseError: -32700,
	invalidRequest: -32600,
	methodNotFound: -32601,
	invalidParams: -32602,
	internalError: -32603,
});

export type ServerRequestSchemas = typeof SERVER_REQUEST_SCHEMAS;
export type ClientNotificationSchemas = typeof CLIENT_NOTIFICATION_SCHEMAS;
