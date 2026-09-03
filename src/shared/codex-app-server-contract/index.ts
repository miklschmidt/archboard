import type {
	ApplyPatchApprovalResponse,
	ClientNotification as GeneratedClientNotification,
	ClientRequest as GeneratedClientRequest,
	ExecCommandApprovalResponse,
	InitializeResponse,
	ServerNotification as GeneratedServerNotification,
	ServerRequest as GeneratedServerRequest,
} from "./generated/index.js";
import type {
	CommandExecutionRequestApprovalResponse,
	CancelLoginAccountResponse,
	ConfigReadResponse,
	ConfigRequirementsReadResponse,
	CurrentTimeReadResponse,
	DynamicToolCallResponse,
	FileChangeRequestApprovalResponse,
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
	TurnInterruptResponse,
	TurnStartResponse,
	TurnSteerResponse,
	ToolRequestUserInputResponse,
} from "./generated/v2/index.js";

export type CodexJsonWire<T> = unknown extends T
	? keyof T extends never
		? CodexJsonValue
		: T
	: T extends bigint
		? number
		: T extends readonly (infer Item)[]
			? Array<CodexJsonWire<Item>>
			: T extends object
				? {
						[Key in keyof T]: CodexJsonWire<
							string extends keyof T ? Exclude<T[Key], undefined> : T[Key]
						>;
					}
				: T;

export type CodexClientRequest = CodexJsonWire<GeneratedClientRequest>;
export type CodexClientNotification = CodexJsonWire<GeneratedClientNotification>;
export type CodexServerRequest = CodexJsonWire<GeneratedServerRequest>;
export type CodexServerNotification = CodexJsonWire<GeneratedServerNotification>;

export type CodexIngressConformance<Wire, Input, Output> = [Wire] extends [Input]
	? [Output] extends [Wire]
		? unknown
		: { readonly __schemaOutputMustExtendCodexGeneratedWire: never }
	: { readonly __codexGeneratedWireMustExtendSchemaInput: never };

export type CodexOutputConformance<Wire, Output> = [Output] extends [Wire]
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

export type CodexClientRequestParamsByMethod = ParamsByMethod<CodexClientRequest>;
export type CodexClientNotificationParamsByMethod = ParamsByMethod<CodexClientNotification>;
export type CodexServerRequestParamsByMethod = ParamsByMethod<CodexServerRequest>;
export type CodexServerNotificationParamsByMethod = ParamsByMethod<CodexServerNotification>;
export type CodexClientNotificationByMethod = WireByMethod<CodexClientNotification>;
export type CodexInitializeCapabilities = NonNullable<
	CodexClientRequestParamsByMethod["initialize"]["capabilities"]
>;
export type CodexLoginAccountParams = CodexClientRequestParamsByMethod["account/login/start"];

export interface CodexResponseByMethod {
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

export interface CodexServerResponseByMethod {
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

export type CodexJsonValue =
	| null
	| boolean
	| number
	| string
	| CodexJsonValue[]
	| { [key: string]: CodexJsonValue };

function normalizeValue(value: unknown, path: string): CodexJsonValue {
	if (value === null || typeof value === "string" || typeof value === "boolean") return value;
	if (typeof value === "number") {
		if (!Number.isFinite(value)) throw new TypeError(`${path} is not a finite JSON number`);
		if (Number.isInteger(value) && !Number.isSafeInteger(value)) {
			throw new TypeError(`${path} is outside the safe JSON integer range`);
		}
		return value;
	}
	if (typeof value === "bigint") {
		throw new TypeError(`${path} is bigint; Codex JSON i64 values must be safe numbers`);
	}
	if (Array.isArray(value)) {
		return value.map((entry, index) => normalizeValue(entry, `${path}[${index}]`));
	}
	if (typeof value !== "object") throw new TypeError(`${path} is not a JSON value`);
	const prototype = Object.getPrototypeOf(value);
	if (prototype !== Object.prototype && prototype !== null) {
		throw new TypeError(`${path} is not a plain JSON object`);
	}
	const normalized: { [key: string]: CodexJsonValue } = {};
	for (const [key, entry] of Object.entries(value)) {
		normalized[key] = normalizeValue(entry, `${path}.${key}`);
	}
	return normalized;
}

/** Normalizes untrusted app-server JSON before any handwritten ingress parser runs. */
export function normalizeCodexJsonWire(value: unknown): CodexJsonValue | undefined {
	if (value === undefined) return undefined;
	return normalizeValue(value, "$codex");
}
