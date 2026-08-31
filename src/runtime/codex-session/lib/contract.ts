import type { CodexProcessLifecycle } from "../../codex-process/index.js";
import type {
	TransportServerNotification,
	TransportServerRequest,
} from "../../codex-transport/server-requests.js";
import type { CodexTransport } from "../../codex-transport/index.js";
import type { ResponseMethod, ResponsePayloads } from "../../codex-protocol/index.js";
import type {
	IdentityAuthority,
	ThreadId,
	TurnId,
} from "../../../shared/codex-workbench-identity/index.js";
import type { LoginAccountParams } from "../../../shared/codex-browser-model/index.js";

export type BedrockSetupParams =
	| { readonly type: "profile"; readonly profile: string; readonly region: string }
	| { readonly type: "environment"; readonly region: string };

/** The public methods of one reviewed Codex app-server session. */
export const SESSION_METHODS = Object.freeze([
	"initialize",
	"configRead",
	"accountRead",
	"accountLogin",
	"accountLoginCancel",
	"accountLogout",
	"modelList",
	"threadStart",
	"threadFork",
	"threadListPage",
	"threadLoadedListPage",
	"threadRead",
	"threadTurnsListPage",
	"threadItemsListPage",
	"threadDelete",
	"threadSettingsUpdate",
	"turnStart",
	"turnSteer",
	"turnInterrupt",
	"queueAdd",
	"queueListPage",
	"queueUpdate",
	"queueDelete",
	"queueReorder",
	"queueStart",
	"threadInjectItems",
	"realtimeStart",
	"realtimeAppendText",
	"realtimeAppendSpeech",
	"realtimeStop",
	"timelineListPage",
	"respondCurrentTime",
	"respondUnsupportedTokenRefresh",
	"respondUnsupportedAttestation",
] as const);

export type SessionMethod = (typeof SESSION_METHODS)[number];

/** Parameters for generated methods whose request schema is owned by Codex. */
export type SessionParams = Readonly<Record<string, unknown>>;

export type SessionLoginParams = LoginAccountParams | BedrockSetupParams;

/** The prepared storage facts supplied by codex-process. */
export interface CodexSessionStorage {
	readonly codexHome: string;
	readonly sqliteHome: string;
	readonly configPath: string;
}

export type SessionNotificationHandler = (event: TransportServerNotification) => void;

export interface CodexSessionOptions {
	readonly transport: CodexTransport;
	readonly identity: IdentityAuthority;
	readonly storage: CodexSessionStorage;
	readonly lifecycle?: CodexProcessLifecycle;
	readonly onNotification?: SessionNotificationHandler;
	/** Alias retained for callers that use the transport event's name. */
	readonly onServerNotification?: SessionNotificationHandler;
	readonly now?: () => number;
}

export type SessionServerRequest = Extract<
	TransportServerRequest,
	{ readonly owner: "codex-session" }
>;
export type SessionCurrentTimeRequest = Extract<
	SessionServerRequest,
	{ readonly method: "currentTime/read" }
>;
export type SessionTokenRefreshRequest = Extract<
	SessionServerRequest,
	{ readonly method: "account/chatgptAuthTokens/refresh" }
>;
export type SessionAttestationRequest = Extract<
	SessionServerRequest,
	{ readonly method: "attestation/generate" }
>;

export type SessionMutationOutcome = "delivered" | "not_delivered" | "outcome_unknown";

export type CodexSessionErrorCode =
	| "already_initialized"
	| "not_initialized"
	| "not_account_ready"
	| "storage_mismatch"
	| "unsupported_login"
	| "invalid_identity"
	| "invalid_request"
	| "initialization_failed"
	| "mutation_failed";

export class CodexSessionError extends Error {
	override readonly name: string = "CodexSessionError";
	readonly code: CodexSessionErrorCode;
	readonly cause: unknown;

	constructor(code: CodexSessionErrorCode, message: string, cause?: unknown) {
		super(message);
		this.code = code;
		this.cause = cause;
	}
}

export class CodexSessionStorageError extends CodexSessionError {
	override readonly name = "CodexSessionStorageError";

	constructor(message: string, cause?: unknown) {
		super("storage_mismatch", message, cause);
	}
}

export class CodexSessionMutationError extends CodexSessionError {
	override readonly name = "CodexSessionMutationError";
	readonly method: string;
	readonly outcome: SessionMutationOutcome;

	constructor(method: string, outcome: SessionMutationOutcome, message: string, cause?: unknown) {
		super("mutation_failed", message, cause);
		this.method = method;
		this.outcome = outcome;
	}
}

export interface CodexSession {
	readonly initialize: () => Promise<ResponsePayloads["initialize"]>;
	readonly configRead: (params?: SessionParams) => Promise<ResponsePayloads["config/read"]>;
	readonly accountRead: (params?: SessionParams) => Promise<ResponsePayloads["account/read"]>;
	readonly accountLogin: (
		params: SessionLoginParams,
	) => Promise<ResponsePayloads["account/login/start"]>;
	readonly accountLoginCancel: (
		params?: SessionParams,
	) => Promise<ResponsePayloads["account/login/cancel"]>;
	readonly accountLogout: (params?: SessionParams) => Promise<ResponsePayloads["account/logout"]>;
	readonly modelList: (params?: SessionParams) => Promise<ResponsePayloads["model/list"]>;
	readonly threadStart: (params: SessionParams) => Promise<ResponsePayloads["thread/start"]>;
	readonly threadFork: (params: SessionParams) => Promise<ResponsePayloads["thread/fork"]>;
	readonly threadListPage: (params?: SessionParams) => Promise<ResponsePayloads["thread/list"]>;
	readonly threadLoadedListPage: (
		params?: SessionParams,
	) => Promise<ResponsePayloads["thread/loaded/list"]>;
	readonly threadRead: (params: SessionParams) => Promise<ResponsePayloads["thread/read"]>;
	readonly threadTurnsListPage: (
		params?: SessionParams,
	) => Promise<ResponsePayloads["thread/turns/list"]>;
	readonly threadItemsListPage: (
		params?: SessionParams,
	) => Promise<ResponsePayloads["thread/items/list"]>;
	readonly threadDelete: (params: SessionParams) => Promise<ResponsePayloads["thread/delete"]>;
	readonly threadSettingsUpdate: (
		params: SessionParams,
	) => Promise<ResponsePayloads["thread/settings/update"]>;
	readonly turnStart: (params: SessionParams) => Promise<ResponsePayloads["turn/start"]>;
	readonly turnSteer: (params: SessionParams) => Promise<ResponsePayloads["turn/steer"]>;
	readonly turnInterrupt: (params: SessionParams) => Promise<ResponsePayloads["turn/interrupt"]>;
	readonly queueAdd: (params: SessionParams) => Promise<ResponsePayloads["thread/queue/add"]>;
	readonly queueListPage: (
		params?: SessionParams,
	) => Promise<ResponsePayloads["thread/queue/list"]>;
	readonly queueUpdate: (params: SessionParams) => Promise<ResponsePayloads["thread/queue/update"]>;
	readonly queueDelete: (params: SessionParams) => Promise<ResponsePayloads["thread/queue/delete"]>;
	readonly queueReorder: (
		params: SessionParams,
	) => Promise<ResponsePayloads["thread/queue/reorder"]>;
	readonly queueStart: (params: SessionParams) => Promise<ResponsePayloads["thread/queue/start"]>;
	readonly threadInjectItems: (
		params: SessionParams,
	) => Promise<ResponsePayloads["thread/inject_items"]>;
	readonly realtimeStart: (
		params: SessionParams,
	) => Promise<ResponsePayloads["thread/realtime/start"]>;
	readonly realtimeAppendText: (
		params: SessionParams,
	) => Promise<ResponsePayloads["thread/realtime/appendText"]>;
	readonly realtimeAppendSpeech: (
		params: SessionParams,
	) => Promise<ResponsePayloads["thread/realtime/appendSpeech"]>;
	readonly realtimeStop: (
		params: SessionParams,
	) => Promise<ResponsePayloads["thread/realtime/stop"]>;
	readonly timelineListPage: (
		params?: SessionParams,
	) => Promise<ResponsePayloads["thread/timeline/list"]>;
	readonly respondCurrentTime: (request: SessionCurrentTimeRequest) => Promise<void>;
	readonly respondUnsupportedTokenRefresh: (request: SessionTokenRefreshRequest) => Promise<void>;
	readonly respondUnsupportedAttestation: (request: SessionAttestationRequest) => Promise<void>;
}

export type { ResponseMethod, ThreadId, TurnId };
