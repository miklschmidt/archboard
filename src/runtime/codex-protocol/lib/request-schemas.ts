import { z } from "zod";

import { CommandActionSchema } from "./item-schemas.js";
import type { ClientNotificationMethod, ServerRequestMethod } from "./methods.js";
import {
	AdditionalPermissionProfileSchema,
	ApplyPatchApprovalParamsSchema,
	CommandExecutionApprovalDecisionSchema,
	ExecPolicyAmendmentSchema,
	ExecCommandApprovalParamsSchema,
	McpServerElicitationRequestParamsSchema,
	NetworkApprovalContextSchema,
	NetworkPolicyAmendmentSchema,
	RequestPermissionProfileSchema,
} from "./approval-schemas.js";
import { JsonValueSchema, RequestIdSchema, looseObject } from "./scalars.js";

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
		appBrand: z.enum(["codex", "chatgpt"]).nullable().optional(),
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

/** Approval prompts are closed so an unrecognized permission cannot be acted on. */
export const CommandExecutionRequestApprovalParamsSchema = z.strictObject({
	kind: z.enum(["command", "writeStdin"]),
	threadId: z.string(),
	turnId: z.string(),
	itemId: z.string(),
	startedAtMs: z.number().finite(),
	approvalId: z.string().nullable().optional(),
	environmentId: z.string().nullable(),
	reason: z.string().nullable().optional(),
	networkApprovalContext: NetworkApprovalContextSchema.nullable().optional(),
	command: z.string().nullable().optional(),
	cwd: z.string().nullable().optional(),
	commandActions: z.array(CommandActionSchema).nullable().optional(),
	additionalPermissions: AdditionalPermissionProfileSchema.nullable().optional(),
	proposedExecpolicyAmendment: ExecPolicyAmendmentSchema.nullable().optional(),
	proposedNetworkPolicyAmendments: z.array(NetworkPolicyAmendmentSchema).nullable().optional(),
	availableDecisions: z.array(CommandExecutionApprovalDecisionSchema).nullable().optional(),
});

export const FileChangeRequestApprovalParamsSchema = z.strictObject({
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

/** Filesystem/network permission requests are closed at the request boundary. */
export const PermissionsRequestApprovalParamsSchema = z.strictObject({
	threadId: z.string(),
	turnId: z.string(),
	itemId: z.string(),
	environmentId: z.string().nullable(),
	startedAtMs: z.number().finite(),
	cwd: z.string(),
	reason: z.string().nullable(),
	permissions: RequestPermissionProfileSchema,
});

export const DynamicToolCallParamsSchema = looseObject({
	threadId: z.string(),
	turnId: z.string(),
	callId: z.string(),
	namespace: z.string().nullable(),
	tool: z.string(),
	/** Dynamic tool arguments are intentionally open JSON from the generated contract. */
	arguments: JsonValueSchema,
});

export const ChatgptAuthTokensRefreshParamsSchema = looseObject({
	reason: z.literal("unauthorized"),
	previousAccountId: z.string().nullable().optional(),
});
export const AttestationGenerateParamsSchema = z.strictObject({});
export const CurrentTimeReadParamsSchema = looseObject({ threadId: z.string() });

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
	result: z.never().optional(),
	error: looseObject({
		code: z.number().int(),
		message: z.string(),
		/** JSON-RPC error data is an intentionally open standard extension. */
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
