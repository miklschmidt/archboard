import { z } from "zod";

import type {
	ApplyPatchApprovalResponse,
	ClientNotification as GeneratedClientNotification,
	ClientRequest as GeneratedClientRequest,
	ExecCommandApprovalResponse,
	InitializeResponse,
	ServerNotification as GeneratedServerNotification,
	ServerRequest as GeneratedServerRequest,
} from "./generated/current/index.js";
import type {
	CommandExecutionRequestApprovalResponse,
	CommandExecutionApprovalDecision,
	CancelLoginAccountResponse,
	ConfigReadResponse,
	ConfigRequirementsReadResponse,
	CurrentTimeReadResponse,
	DynamicToolCallResponse,
	FileChangeRequestApprovalResponse,
	FileChangeApprovalDecision,
	GetAccountResponse,
	LoginAccountResponse,
	LogoutAccountResponse,
	McpServerElicitationRequestResponse,
	ModelListResponse,
	PermissionsRequestApprovalResponse,
	ThreadDeleteResponse,
	ThreadForkResponse,
	ThreadInjectItemsResponse,
	ThreadItemsListResponse,
	ThreadListResponse,
	ThreadLoadedListResponse,
	ThreadQueueAddResponse,
	ThreadQueueDeleteResponse,
	ThreadQueueListResponse,
	ThreadQueueReorderResponse,
	ThreadQueueStartResponse,
	ThreadQueueUpdateResponse,
	ThreadReadResponse,
	ThreadRealtimeAppendSpeechResponse,
	ThreadRealtimeAppendTextResponse,
	ThreadRealtimeStartResponse,
	ThreadRealtimeStopResponse,
	ThreadSettingsUpdateResponse,
	ThreadStartResponse,
	ThreadTimelineListResponse,
	ThreadTurnsListResponse,
	ThreadStatus,
	TurnInterruptResponse,
	TurnStartResponse,
	TurnSteerResponse,
	TurnStatus,
	ToolRequestUserInputResponse,
} from "./generated/current/v2/index.js";

/** JSON representation of one generated ts-rs bigint/i64 field. */
const CodexSafeI64Schema = z.number().int().safe().brand<"CodexSafeI64">();
type CodexSafeI64 = z.infer<typeof CodexSafeI64Schema>;

type CodexJsonWire<T> = unknown extends T
	? keyof T extends never
		? CodexJsonValue
		: T
	: T extends bigint
		? CodexSafeI64
		: T extends readonly (infer Item)[]
			? Array<CodexJsonWire<Item>>
			: T extends object
				? {
						[Key in keyof T]: CodexJsonWire<
							string extends keyof T ? Exclude<T[Key], undefined> : T[Key]
						>;
					}
				: T;

type CodexClientRequest = CodexJsonWire<GeneratedClientRequest>;
type CodexClientNotification = CodexJsonWire<GeneratedClientNotification>;
type CodexServerRequest = CodexJsonWire<GeneratedServerRequest>;
type CodexServerNotification = CodexJsonWire<GeneratedServerNotification>;

type OptionalKeys<Value extends object> = {
	[Key in keyof Value]-?: object extends Pick<Value, Key> ? Key : never;
}[keyof Value];

/** Makes `undefined` irrelevant only when an object key is already optional. */
type NormalizeOptionalValues<Value> = Value extends string | number | boolean | bigint | symbol
	? Value
	: Value extends readonly (infer Item)[]
		? Array<NormalizeOptionalValues<Item>>
		: Value extends object
			? {
					[Key in keyof Value]: NormalizeOptionalValues<
						Key extends OptionalKeys<Value> ? Exclude<Value[Key], undefined> : Value[Key]
					>;
				}
			: Value;

type CodexIngressConformance<Wire, Input, Output> = [NormalizeOptionalValues<Wire>] extends [
	NormalizeOptionalValues<Input>,
]
	? [NormalizeOptionalValues<Output>] extends [NormalizeOptionalValues<Wire>]
		? unknown
		: { readonly __schemaOutputMustExtendCodexGeneratedWire: never }
	: { readonly __codexGeneratedWireMustExtendSchemaInput: never };

type CodexOutputConformance<Wire, Output> = [NormalizeOptionalValues<Output>] extends [
	NormalizeOptionalValues<Wire>,
]
	? unknown
	: { readonly __schemaOutputMustExtendCodexGeneratedWire: never };

type ParamsByMethod<Wire extends { method: string }> = {
	[Method in Wire["method"]]: Extract<Wire, { method: Method }> extends {
		params: infer Params;
	}
		? Params
		: undefined;
};

type WireByMethod<Wire extends { method: string }> = {
	[Method in Wire["method"]]: Extract<Wire, { method: Method }>;
};

type CodexClientRequestParamsByMethod = ParamsByMethod<CodexClientRequest>;
type CodexClientNotificationParamsByMethod = ParamsByMethod<CodexClientNotification>;
type CodexServerRequestParamsByMethod = ParamsByMethod<CodexServerRequest>;
type CodexServerNotificationParamsByMethod = ParamsByMethod<CodexServerNotification>;
type CodexClientNotificationByMethod = WireByMethod<CodexClientNotification>;
type CodexInitializeCapabilities = NonNullable<
	CodexClientRequestParamsByMethod["initialize"]["capabilities"]
>;
type CodexLoginAccountParams = CodexClientRequestParamsByMethod["account/login/start"];
type CodexThreadStatus = CodexJsonWire<ThreadStatus>;
type CodexTurnStatus = CodexJsonWire<TurnStatus>;
type CodexCommandExecutionApprovalDecision = CodexJsonWire<CommandExecutionApprovalDecision>;
type CodexFileChangeApprovalDecision = CodexJsonWire<FileChangeApprovalDecision>;

/** Client requests Archboard implements, checked against the generated request union. */
const CODEX_CLIENT_REQUEST_METHODS = [
	"initialize",
	"config/read",
	"configRequirements/read",
	"account/read",
	"account/login/start",
	"account/login/cancel",
	"account/logout",
	"model/list",
	"thread/start",
	"thread/fork",
	"thread/list",
	"thread/loaded/list",
	"thread/read",
	"thread/turns/list",
	"thread/items/list",
	"thread/delete",
	"thread/settings/update",
	"turn/start",
	"turn/steer",
	"turn/interrupt",
	"thread/queue/add",
	"thread/queue/list",
	"thread/queue/update",
	"thread/queue/delete",
	"thread/queue/reorder",
	"thread/queue/start",
	"thread/inject_items",
	"thread/realtime/start",
	"thread/realtime/appendText",
	"thread/realtime/appendSpeech",
	"thread/realtime/stop",
	"thread/timeline/list",
] as const satisfies readonly (keyof CodexClientRequestParamsByMethod)[];

/** Reverse requests Archboard implements, checked against the generated request union. */
const CODEX_SERVER_REQUEST_METHODS = [
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

const CodexThreadStatusSchema = z.discriminatedUnion("type", [
	z.looseObject({ type: z.literal("notLoaded") }),
	z.looseObject({ type: z.literal("idle") }),
	z.looseObject({ type: z.literal("systemError") }),
	z.looseObject({
		type: z.literal("active"),
		activeFlags: z.array(z.enum(["waitingOnApproval", "waitingOnUserInput"])),
	}),
]) satisfies z.ZodType<CodexThreadStatus>;

const CODEX_THREAD_STATUS_TYPES = [
	"notLoaded",
	"idle",
	"systemError",
	"active",
] as const satisfies readonly CodexThreadStatus["type"][];
type CodexThreadStatusType = (typeof CODEX_THREAD_STATUS_TYPES)[number];
const CodexThreadStatusTypeSchema = z.enum(CODEX_THREAD_STATUS_TYPES);

function isCodexThreadStatusType(value: unknown): value is CodexThreadStatusType {
	return CODEX_THREAD_STATUS_TYPES.includes(value as CodexThreadStatusType);
}

const CodexTurnStatusSchema = z.enum([
	"completed",
	"interrupted",
	"failed",
	"inProgress",
] satisfies readonly CodexTurnStatus[]);

function createCodexCommandExecutionApprovalDecisionSchema(
	options: {
		readonly text?: z.ZodType<string>;
		readonly host?: z.ZodType<string>;
	} = {},
) {
	const text = options.text ?? z.string();
	const host = options.host ?? text;
	return z.union([
		z.enum(["accept", "acceptForSession", "decline", "cancel"]),
		z.strictObject({
			acceptWithExecpolicyAmendment: z.strictObject({
				execpolicy_amendment: z.array(text),
			}),
		}),
		z.strictObject({
			applyNetworkPolicyAmendment: z.strictObject({
				network_policy_amendment: z.strictObject({
					host,
					action: z.enum(["allow", "deny"]),
				}),
			}),
		}),
	]) satisfies z.ZodType<CodexCommandExecutionApprovalDecision>;
}

const CodexCommandExecutionApprovalDecisionSchema =
	createCodexCommandExecutionApprovalDecisionSchema();
const CodexFileChangeApprovalDecisionSchema = z.enum([
	"accept",
	"acceptForSession",
	"decline",
	"cancel",
] satisfies readonly CodexFileChangeApprovalDecision[]);

interface CodexResponseByMethod {
	readonly initialize: CodexJsonWire<InitializeResponse>;
	readonly "config/read": CodexJsonWire<ConfigReadResponse>;
	readonly "configRequirements/read": CodexJsonWire<ConfigRequirementsReadResponse>;
	readonly "account/read": CodexJsonWire<GetAccountResponse>;
	readonly "account/login/start": CodexJsonWire<LoginAccountResponse>;
	readonly "account/login/cancel": CodexJsonWire<CancelLoginAccountResponse>;
	readonly "account/logout": CodexJsonWire<LogoutAccountResponse>;
	readonly "model/list": CodexJsonWire<ModelListResponse>;
	readonly "thread/start": CodexJsonWire<ThreadStartResponse>;
	readonly "thread/fork": CodexJsonWire<ThreadForkResponse>;
	readonly "thread/list": CodexJsonWire<ThreadListResponse>;
	readonly "thread/loaded/list": CodexJsonWire<ThreadLoadedListResponse>;
	readonly "thread/read": CodexJsonWire<ThreadReadResponse>;
	readonly "thread/turns/list": CodexJsonWire<ThreadTurnsListResponse>;
	readonly "thread/items/list": CodexJsonWire<ThreadItemsListResponse>;
	readonly "thread/delete": CodexJsonWire<ThreadDeleteResponse>;
	readonly "thread/settings/update": CodexJsonWire<ThreadSettingsUpdateResponse>;
	readonly "turn/start": CodexJsonWire<TurnStartResponse>;
	readonly "turn/steer": CodexJsonWire<TurnSteerResponse>;
	readonly "turn/interrupt": CodexJsonWire<TurnInterruptResponse>;
	readonly "thread/queue/add": CodexJsonWire<ThreadQueueAddResponse>;
	readonly "thread/queue/list": CodexJsonWire<ThreadQueueListResponse>;
	readonly "thread/queue/update": CodexJsonWire<ThreadQueueUpdateResponse>;
	readonly "thread/queue/delete": CodexJsonWire<ThreadQueueDeleteResponse>;
	readonly "thread/queue/reorder": CodexJsonWire<ThreadQueueReorderResponse>;
	readonly "thread/queue/start": CodexJsonWire<ThreadQueueStartResponse>;
	readonly "thread/inject_items": CodexJsonWire<ThreadInjectItemsResponse>;
	readonly "thread/realtime/start": CodexJsonWire<ThreadRealtimeStartResponse>;
	readonly "thread/realtime/appendText": CodexJsonWire<ThreadRealtimeAppendTextResponse>;
	readonly "thread/realtime/appendSpeech": CodexJsonWire<ThreadRealtimeAppendSpeechResponse>;
	readonly "thread/realtime/stop": CodexJsonWire<ThreadRealtimeStopResponse>;
	readonly "thread/timeline/list": CodexJsonWire<ThreadTimelineListResponse>;
	readonly "currentTime/read": CodexJsonWire<CurrentTimeReadResponse>;
}

interface CodexServerResponseByMethod {
	readonly "item/commandExecution/requestApproval": CodexJsonWire<CommandExecutionRequestApprovalResponse>;
	readonly "item/fileChange/requestApproval": CodexJsonWire<FileChangeRequestApprovalResponse>;
	readonly "item/tool/requestUserInput": CodexJsonWire<ToolRequestUserInputResponse>;
	readonly "mcpServer/elicitation/request": CodexJsonWire<McpServerElicitationRequestResponse>;
	readonly "item/permissions/requestApproval": CodexJsonWire<PermissionsRequestApprovalResponse>;
	readonly "item/tool/call": CodexJsonWire<DynamicToolCallResponse>;
	readonly "currentTime/read": CodexJsonWire<CurrentTimeReadResponse>;
	readonly applyPatchApproval: CodexJsonWire<ApplyPatchApprovalResponse>;
	readonly execCommandApproval: CodexJsonWire<ExecCommandApprovalResponse>;
}

type CodexJsonValue =
	| null
	| boolean
	| number
	| string
	| CodexJsonValue[]
	| { [key: string]: CodexJsonValue };

function normalizeValue(value: unknown, path: string): CodexJsonValue {
	if (value === null || typeof value === "string" || typeof value === "boolean") {
		return value;
	}
	if (typeof value === "number") {
		if (!Number.isFinite(value)) {
			throw new TypeError(`${path} is not a finite JSON number`);
		}
		return value;
	}
	if (typeof value === "bigint") {
		throw new TypeError(`${path} is bigint; Codex JSON i64 values must be safe numbers`);
	}
	if (Array.isArray(value)) {
		return value.map((entry, index) => normalizeValue(entry, `${path}[${index}]`));
	}
	if (typeof value !== "object") {
		throw new TypeError(`${path} is not a JSON value`);
	}
	const prototype = Object.getPrototypeOf(value);
	if (prototype !== Object.prototype && prototype !== null) {
		throw new TypeError(`${path} is not a plain JSON object`);
	}
	return Object.fromEntries(
		Object.entries(value).map(([key, entry]) => [key, normalizeValue(entry, `${path}.${key}`)]),
	);
}

/** Normalizes untrusted app-server JSON before any handwritten ingress parser runs. */
function normalizeCodexJsonWire(value: unknown): CodexJsonValue | undefined {
	if (value === undefined) {
		return undefined;
	}
	return normalizeValue(value, "$codex");
}

export {
	CodexSafeI64Schema,
	type CodexSafeI64,
	type CodexJsonWire,
	type CodexClientRequest,
	type CodexClientNotification,
	type CodexServerRequest,
	type CodexServerNotification,
	type CodexIngressConformance,
	type CodexOutputConformance,
	type CodexClientRequestParamsByMethod,
	type CodexClientNotificationParamsByMethod,
	type CodexServerRequestParamsByMethod,
	type CodexServerNotificationParamsByMethod,
	type CodexClientNotificationByMethod,
	type CodexInitializeCapabilities,
	type CodexLoginAccountParams,
	type CodexThreadStatus,
	type CodexTurnStatus,
	type CodexCommandExecutionApprovalDecision,
	type CodexFileChangeApprovalDecision,
	CODEX_CLIENT_REQUEST_METHODS,
	CODEX_SERVER_REQUEST_METHODS,
	CodexThreadStatusSchema,
	CODEX_THREAD_STATUS_TYPES,
	type CodexThreadStatusType,
	CodexThreadStatusTypeSchema,
	isCodexThreadStatusType,
	CodexTurnStatusSchema,
	createCodexCommandExecutionApprovalDecisionSchema,
	CodexCommandExecutionApprovalDecisionSchema,
	CodexFileChangeApprovalDecisionSchema,
	type CodexResponseByMethod,
	type CodexServerResponseByMethod,
	type CodexJsonValue,
	normalizeCodexJsonWire,
};
