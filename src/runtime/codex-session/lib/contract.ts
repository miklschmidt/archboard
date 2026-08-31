import type { CodexProcessLifecycle } from "../../codex-process/index.js";
import type {
	TransportServerNotification,
	TransportServerRequest,
} from "../../codex-transport/server-requests.js";
import type { CodexTransport } from "../../codex-transport/index.js";
import type {
	ClientRequestMethod,
	CodexSessionRequestParams,
	ResponseMethod,
	ResponsePayloads,
} from "../../codex-protocol/index.js";
import type {
	IdentityAuthority,
	ThreadId,
	TurnId,
} from "../../../shared/codex-workbench-identity/index.js";
import type {
	BedrockSetupParams,
	LoginAccountParams,
} from "../../../shared/codex-browser-model/index.js";

export type { BedrockSetupParams } from "../../../shared/codex-browser-model/index.js";

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

/** Branded parameters for one generated Codex request owned by this session. */
export type SessionParams<Method extends ClientRequestMethod = ClientRequestMethod> =
	CodexSessionRequestParams<Method>;

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
	/** Canonical checkout cwd supplied by the owning Codex process. */
	readonly checkoutRoot: string;
	readonly lifecycle?: CodexProcessLifecycle;
	readonly onNotification?: SessionNotificationHandler;
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

export type SessionMutationOutcome = "not_delivered" | "outcome_unknown";

export type CodexSessionErrorCode =
	| "already_initialized"
	| "not_initialized"
	| "not_account_ready"
	| "storage_mismatch"
	| "unsupported_login"
	| "invalid_identity"
	| "invalid_request"
	| "mutation_failed";

export class CodexSessionError extends Error {
	override readonly name: string = "CodexSessionError";
	readonly code: CodexSessionErrorCode;
	override readonly cause: unknown;

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
	readonly retryEligible = false;

	constructor(method: string, outcome: SessionMutationOutcome, message: string, cause?: unknown) {
		super("mutation_failed", message, cause);
		this.method = method;
		this.outcome = outcome;
	}
}

export interface CodexSession {
	readonly initialize: () => Promise<ResponsePayloads["initialize"]>;
	readonly configRead: (
		params?: SessionParams<"config/read">,
	) => Promise<ResponsePayloads["config/read"]>;
	readonly accountRead: (
		params?: SessionParams<"account/read">,
	) => Promise<ResponsePayloads["account/read"]>;
	readonly accountLogin: (
		params: SessionLoginParams,
	) => Promise<ResponsePayloads["account/login/start"]>;
	readonly accountLoginCancel: (
		params: SessionParams<"account/login/cancel">,
	) => Promise<ResponsePayloads["account/login/cancel"]>;
	readonly accountLogout: () => Promise<ResponsePayloads["account/logout"]>;
	readonly modelList: (
		params?: SessionParams<"model/list">,
	) => Promise<ResponsePayloads["model/list"]>;
	readonly threadStart: (
		params: SessionParams<"thread/start">,
	) => Promise<ResponsePayloads["thread/start"]>;
	readonly threadFork: (
		params: SessionParams<"thread/fork">,
	) => Promise<ResponsePayloads["thread/fork"]>;
	readonly threadListPage: (
		params?: SessionParams<"thread/list">,
	) => Promise<ResponsePayloads["thread/list"]>;
	readonly threadLoadedListPage: (
		params?: SessionParams<"thread/loaded/list">,
	) => Promise<ResponsePayloads["thread/loaded/list"]>;
	readonly threadRead: (
		params: SessionParams<"thread/read">,
	) => Promise<ResponsePayloads["thread/read"]>;
	readonly threadTurnsListPage: (
		params: SessionParams<"thread/turns/list">,
	) => Promise<ResponsePayloads["thread/turns/list"]>;
	readonly threadItemsListPage: (
		params: SessionParams<"thread/items/list">,
	) => Promise<ResponsePayloads["thread/items/list"]>;
	readonly threadDelete: (
		params: SessionParams<"thread/delete">,
	) => Promise<ResponsePayloads["thread/delete"]>;
	readonly threadSettingsUpdate: (
		params: SessionParams<"thread/settings/update">,
	) => Promise<ResponsePayloads["thread/settings/update"]>;
	readonly turnStart: (
		params: SessionParams<"turn/start">,
	) => Promise<ResponsePayloads["turn/start"]>;
	readonly turnSteer: (
		params: SessionParams<"turn/steer">,
	) => Promise<ResponsePayloads["turn/steer"]>;
	readonly turnInterrupt: (
		params: SessionParams<"turn/interrupt">,
	) => Promise<ResponsePayloads["turn/interrupt"]>;
	readonly queueAdd: (
		params: SessionParams<"thread/queue/add">,
	) => Promise<ResponsePayloads["thread/queue/add"]>;
	readonly queueListPage: (
		params: SessionParams<"thread/queue/list">,
	) => Promise<ResponsePayloads["thread/queue/list"]>;
	readonly queueUpdate: (
		params: SessionParams<"thread/queue/update">,
	) => Promise<ResponsePayloads["thread/queue/update"]>;
	readonly queueDelete: (
		params: SessionParams<"thread/queue/delete">,
	) => Promise<ResponsePayloads["thread/queue/delete"]>;
	readonly queueReorder: (
		params: SessionParams<"thread/queue/reorder">,
	) => Promise<ResponsePayloads["thread/queue/reorder"]>;
	readonly queueStart: (
		params: SessionParams<"thread/queue/start">,
	) => Promise<ResponsePayloads["thread/queue/start"]>;
	readonly threadInjectItems: (
		params: SessionParams<"thread/inject_items">,
	) => Promise<ResponsePayloads["thread/inject_items"]>;
	readonly realtimeStart: (
		params: SessionParams<"thread/realtime/start">,
	) => Promise<ResponsePayloads["thread/realtime/start"]>;
	readonly realtimeAppendText: (
		params: SessionParams<"thread/realtime/appendText">,
	) => Promise<ResponsePayloads["thread/realtime/appendText"]>;
	readonly realtimeAppendSpeech: (
		params: SessionParams<"thread/realtime/appendSpeech">,
	) => Promise<ResponsePayloads["thread/realtime/appendSpeech"]>;
	readonly realtimeStop: (
		params: SessionParams<"thread/realtime/stop">,
	) => Promise<ResponsePayloads["thread/realtime/stop"]>;
	readonly timelineListPage: (
		params: SessionParams<"thread/timeline/list">,
	) => Promise<ResponsePayloads["thread/timeline/list"]>;
	readonly respondCurrentTime: (request: SessionCurrentTimeRequest) => Promise<void>;
	readonly respondUnsupportedTokenRefresh: (request: SessionTokenRefreshRequest) => Promise<void>;
	readonly respondUnsupportedAttestation: (request: SessionAttestationRequest) => Promise<void>;
}

export type { ResponseMethod, ThreadId, TurnId };
