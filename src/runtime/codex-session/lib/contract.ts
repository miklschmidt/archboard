import type { CodexProcessLifecycle } from "../../codex-process/index.js";
import type {
	TransportServerNotification,
	TransportServerRequest,
} from "../../codex-transport/server-requests.js";
import type { CodexTransport } from "../../codex-transport/index.js";
import type {
	BedrockSetupParams,
	ClientRequestMethod,
	CodexSessionRequestParams,
	LoginAccountParams,
	ResponseMethod,
} from "../../codex-protocol/index.js";
import type {
	IdentityAuthority,
	ThreadId,
	TurnId,
} from "../../../shared/codex-workbench-identity/index.js";
import type { SessionResponsePayloads } from "./results.js";

export type { BedrockSetupParams } from "../../codex-protocol/index.js";

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

export const CODEX_SESSION_CONTROL: unique symbol = Symbol("codex-session-control");

export interface CodexSessionControl {
	readonly onNotification: (event: TransportServerNotification) => void;
	readonly onServerRequest: (request: TransportServerRequest) => void;
	readonly dispose: () => void;
}

export type ControlledCodexSession = CodexSession & {
	readonly [CODEX_SESSION_CONTROL]: CodexSessionControl;
};

export interface CodexSessionOptions {
	readonly transport: CodexTransport;
	readonly identity: IdentityAuthority;
	readonly storage: CodexSessionStorage;
	/** Canonical checkout cwd supplied by the owning Codex process. */
	readonly checkoutRoot: string;
	readonly lifecycle?: CodexProcessLifecycle;
	readonly onNotification?: SessionNotificationHandler;
	/** Composition owns the sole listener cohort; standalone consumers keep legacy self-registration. */
	readonly listenerOwnership?: "self" | "composition";
	/**
	 * A replacement source generation may adopt the already-completed handshake
	 * on the exact same transport and child epoch.
	 */
	readonly adoptedReadiness?: "login-capable" | "thread-capable";
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
	readonly initialize: () => Promise<SessionResponsePayloads["initialize"]>;
	readonly configRead: (
		params?: SessionParams<"config/read">,
	) => Promise<SessionResponsePayloads["config/read"]>;
	readonly accountRead: (
		params?: SessionParams<"account/read">,
	) => Promise<SessionResponsePayloads["account/read"]>;
	readonly accountLogin: (
		params: SessionLoginParams,
	) => Promise<SessionResponsePayloads["account/login/start"]>;
	readonly accountLoginCancel: (
		params: SessionParams<"account/login/cancel">,
	) => Promise<SessionResponsePayloads["account/login/cancel"]>;
	readonly accountLogout: () => Promise<SessionResponsePayloads["account/logout"]>;
	readonly modelList: (
		params?: SessionParams<"model/list">,
	) => Promise<SessionResponsePayloads["model/list"]>;
	readonly threadStart: (
		params: SessionParams<"thread/start">,
	) => Promise<SessionResponsePayloads["thread/start"]>;
	readonly threadFork: (
		params: SessionParams<"thread/fork">,
	) => Promise<SessionResponsePayloads["thread/fork"]>;
	readonly threadListPage: (
		params?: SessionParams<"thread/list">,
	) => Promise<SessionResponsePayloads["thread/list"]>;
	readonly threadLoadedListPage: (
		params?: SessionParams<"thread/loaded/list">,
	) => Promise<SessionResponsePayloads["thread/loaded/list"]>;
	readonly threadRead: (
		params: SessionParams<"thread/read">,
	) => Promise<SessionResponsePayloads["thread/read"]>;
	readonly threadTurnsListPage: (
		params: SessionParams<"thread/turns/list">,
	) => Promise<SessionResponsePayloads["thread/turns/list"]>;
	readonly threadItemsListPage: (
		params: SessionParams<"thread/items/list">,
	) => Promise<SessionResponsePayloads["thread/items/list"]>;
	readonly threadDelete: (
		params: SessionParams<"thread/delete">,
	) => Promise<SessionResponsePayloads["thread/delete"]>;
	readonly threadSettingsUpdate: (
		params: SessionParams<"thread/settings/update">,
	) => Promise<SessionResponsePayloads["thread/settings/update"]>;
	readonly turnStart: (
		params: SessionParams<"turn/start">,
	) => Promise<SessionResponsePayloads["turn/start"]>;
	readonly turnSteer: (
		params: SessionParams<"turn/steer">,
	) => Promise<SessionResponsePayloads["turn/steer"]>;
	readonly turnInterrupt: (
		params: SessionParams<"turn/interrupt">,
	) => Promise<SessionResponsePayloads["turn/interrupt"]>;
	readonly queueAdd: (
		params: SessionParams<"thread/queue/add">,
	) => Promise<SessionResponsePayloads["thread/queue/add"]>;
	readonly queueListPage: (
		params: SessionParams<"thread/queue/list">,
	) => Promise<SessionResponsePayloads["thread/queue/list"]>;
	readonly queueUpdate: (
		params: SessionParams<"thread/queue/update">,
	) => Promise<SessionResponsePayloads["thread/queue/update"]>;
	readonly queueDelete: (
		params: SessionParams<"thread/queue/delete">,
	) => Promise<SessionResponsePayloads["thread/queue/delete"]>;
	readonly queueReorder: (
		params: SessionParams<"thread/queue/reorder">,
	) => Promise<SessionResponsePayloads["thread/queue/reorder"]>;
	readonly queueStart: (
		params: SessionParams<"thread/queue/start">,
	) => Promise<SessionResponsePayloads["thread/queue/start"]>;
	readonly threadInjectItems: (
		params: SessionParams<"thread/inject_items">,
	) => Promise<SessionResponsePayloads["thread/inject_items"]>;
	readonly realtimeStart: (
		params: SessionParams<"thread/realtime/start">,
	) => Promise<SessionResponsePayloads["thread/realtime/start"]>;
	readonly realtimeAppendText: (
		params: SessionParams<"thread/realtime/appendText">,
	) => Promise<SessionResponsePayloads["thread/realtime/appendText"]>;
	readonly realtimeAppendSpeech: (
		params: SessionParams<"thread/realtime/appendSpeech">,
	) => Promise<SessionResponsePayloads["thread/realtime/appendSpeech"]>;
	readonly realtimeStop: (
		params: SessionParams<"thread/realtime/stop">,
	) => Promise<SessionResponsePayloads["thread/realtime/stop"]>;
	readonly timelineListPage: (
		params: SessionParams<"thread/timeline/list">,
	) => Promise<SessionResponsePayloads["thread/timeline/list"]>;
	readonly respondCurrentTime: (request: SessionCurrentTimeRequest) => Promise<void>;
	readonly respondUnsupportedTokenRefresh: (request: SessionTokenRefreshRequest) => Promise<void>;
	readonly respondUnsupportedAttestation: (request: SessionAttestationRequest) => Promise<void>;
}

export type { ResponseMethod, ThreadId, TurnId };
