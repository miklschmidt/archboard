import { z } from "zod";

import type {
	CodexClientNotificationByMethod,
	CodexServerRequestParamsByMethod,
} from "@/shared/codex-app-server-contract";
import { CommandActionSchema } from "@/runtime/codex-protocol/lib/item-schemas";
import type {
	ClientNotificationMethod,
	ServerRequestMethod,
} from "@/runtime/codex-protocol/lib/methods";
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
} from "@/runtime/codex-protocol/lib/approval-schemas";
import {
	JsonValueSchema,
	RequestIdSchema,
	looseObject,
} from "@/runtime/codex-protocol/lib/scalars";
import { codexIngressSchemas } from "@/runtime/codex-protocol/lib/vendor-schema";

const ClientInfoSchema = z.strictObject({
	name: z.string(),
	title: z.string().nullable(),
	version: z.string(),
});

const LoginAccountParamsSchema = z.discriminatedUnion("type", [
	z.strictObject({ type: z.literal("apiKey"), apiKey: z.string() }),
	z.strictObject({
		type: z.literal("chatgpt"),
		codexStreamlinedLogin: z.boolean().optional(),
		useHostedLoginSuccessPage: z.boolean().optional(),
		appBrand: z.enum(["codex", "chatgpt"]).nullable().optional(),
	}),
	z.strictObject({ type: z.literal("chatgptDeviceCode") }),
	z.strictObject({
		type: z.literal("chatgptAuthTokens"),
		accessToken: z.string(),
		chatgptAccountId: z.string(),
		chatgptPlanType: z.string().nullable().optional(),
	}),
	z.strictObject({ type: z.literal("amazonBedrock"), apiKey: z.string(), region: z.string() }),
	z.strictObject({
		type: z.literal("amazonBedrockAccessKeys"),
		accessKeyId: z.string(),
		secretAccessKey: z.string(),
		sessionToken: z.string().nullable().optional(),
		region: z.string(),
	}),
]);

const CancelLoginAccountParamsSchema = z.strictObject({ loginId: z.string() });
const AccountReadParamsSchema = z.strictObject({ refreshToken: z.boolean().optional() });

/** Approval prompts are closed so an unrecognized permission cannot be acted on. */
const CommandExecutionRequestApprovalParamsSchema = z.strictObject({
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

const FileChangeRequestApprovalParamsSchema = z.strictObject({
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

const ToolRequestUserInputParamsSchema = looseObject({
	threadId: z.string(),
	turnId: z.string(),
	itemId: z.string(),
	questions: z.array(UserInputQuestionSchema),
	isBlocking: z.boolean(),
	autoResolutionMs: z.number().finite().nullable(),
});

/** Filesystem/network permission requests are closed at the request boundary. */
const PermissionsRequestApprovalParamsSchema = z.strictObject({
	threadId: z.string(),
	turnId: z.string(),
	itemId: z.string(),
	environmentId: z.string().nullable(),
	startedAtMs: z.number().finite(),
	cwd: z.string(),
	reason: z.string().nullable(),
	permissions: RequestPermissionProfileSchema,
});

const DynamicToolCallParamsSchema = looseObject({
	threadId: z.string(),
	turnId: z.string(),
	callId: z.string(),
	namespace: z.string().nullable(),
	tool: z.string(),
	/** Dynamic tool arguments are intentionally open JSON from the generated contract. */
	arguments: JsonValueSchema,
});

const ChatgptAuthTokensRefreshParamsSchema = looseObject({
	reason: z.literal("unauthorized"),
	previousAccountId: z.string().nullable().optional(),
});
const AttestationGenerateParamsSchema = z.strictObject({});
const CurrentTimeReadParamsSchema = looseObject({ threadId: z.string() });

const SERVER_REQUEST_SCHEMAS = codexIngressSchemas<
	Pick<CodexServerRequestParamsByMethod, ServerRequestMethod>
>()({
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
} as const);

const CLIENT_NOTIFICATION_SCHEMAS = codexIngressSchemas<
	Pick<CodexClientNotificationByMethod, ClientNotificationMethod>
>()({
	initialized: z.strictObject({ method: z.literal("initialized") }),
} as const);

const JsonRpcErrorSchema = z.strictObject({
	id: RequestIdSchema,
	result: z.never().optional(),
	error: z.strictObject({
		code: z.number().int(),
		message: z.string(),
		/** JSON-RPC error data is an intentionally open standard extension. */
		data: JsonValueSchema.optional(),
	}),
});

const JSON_RPC_ERROR_CODES = Object.freeze({
	parseError: -32700,
	invalidRequest: -32600,
	methodNotFound: -32601,
	invalidParams: -32602,
	internalError: -32603,
});

type ServerRequestSchemas = typeof SERVER_REQUEST_SCHEMAS;
type ClientNotificationSchemas = typeof CLIENT_NOTIFICATION_SCHEMAS;

export {
	ClientInfoSchema,
	LoginAccountParamsSchema,
	CancelLoginAccountParamsSchema,
	AccountReadParamsSchema,
	CommandExecutionRequestApprovalParamsSchema,
	FileChangeRequestApprovalParamsSchema,
	ToolRequestUserInputParamsSchema,
	PermissionsRequestApprovalParamsSchema,
	DynamicToolCallParamsSchema,
	ChatgptAuthTokensRefreshParamsSchema,
	AttestationGenerateParamsSchema,
	CurrentTimeReadParamsSchema,
	SERVER_REQUEST_SCHEMAS,
	CLIENT_NOTIFICATION_SCHEMAS,
	JsonRpcErrorSchema,
	JSON_RPC_ERROR_CODES,
	type ServerRequestSchemas,
	type ClientNotificationSchemas,
};
