import type { ChildProcessEventMap, ChildProcessWithoutNullStreams } from "node:child_process";

import type {
	ClientNotificationMethod,
	ClientRequestMethodWithoutParams,
	DecodedServerNotification,
	ResponseMethod,
	ResponsePayloads,
	ServerRequestMethod,
	ServerRequestPayloads,
} from "../../codex-protocol/index.js";
import type {
	ChildEpoch,
	ChildId,
	IdentityAuthority,
	JsonRpcRequestId,
	LogicalToolCallCorrelation,
	ThreadId,
	WireRequestCorrelation,
} from "../../../shared/codex-workbench-identity/index.js";
import type {
	CodexRemoteError,
	CodexRequestFailureReason,
	CodexRequestOutcome,
	CodexTransportRequestError,
	TransportRemoteErrorSummary,
	CodexTransportRemoteError,
	CodexTransportWriteError,
} from "./errors.js";

/** The subset of the Node child-process contract that the transport needs. */
export type CodexTransportChild = Pick<
	ChildProcessWithoutNullStreams,
	"stdin" | "stdout" | "stderr"
> & {
	on<E extends "error" | "exit">(
		event: E,
		listener: (...args: ChildProcessEventMap[E]) => void,
	): CodexTransportChild;
	removeListener<E extends "error" | "exit">(
		event: E,
		listener: (...args: ChildProcessEventMap[E]) => void,
	): CodexTransportChild;
};

export type ResponseOwner =
	| "codex-approvals"
	| "codex-dynamic-tools"
	| "codex-coordinator-tools"
	| "codex-session";

export type DynamicDispatcherOwner = Exclude<ResponseOwner, "codex-approvals" | "codex-session">;

export const HUMAN_APPROVAL_METHODS = Object.freeze([
	"item/commandExecution/requestApproval",
	"item/fileChange/requestApproval",
	"item/tool/requestUserInput",
	"mcpServer/elicitation/request",
	"item/permissions/requestApproval",
	"applyPatchApproval",
	"execCommandApproval",
] as const);

export type HumanApprovalMethod = (typeof HUMAN_APPROVAL_METHODS)[number];

export const SESSION_SERVER_REQUEST_METHODS = Object.freeze([
	"currentTime/read",
	"account/chatgptAuthTokens/refresh",
	"attestation/generate",
] as const);

export type SessionServerRequestMethod = (typeof SESSION_SERVER_REQUEST_METHODS)[number];

export interface DynamicDispatcherRegistration {
	readonly owner: DynamicDispatcherOwner;
	readonly namespace: string;
	readonly manifestHash: string;
}

export type TransportFrameCorrelation = {
	readonly child: ChildId;
	readonly epoch: ChildEpoch;
	readonly requestId: JsonRpcRequestId | null;
};

export interface TransportServerNotification {
	readonly correlation: TransportFrameCorrelation;
	readonly notification: DecodedServerNotification;
}

type ServerRequestEnvelope<Method extends ServerRequestMethod, Owner extends ResponseOwner> = {
	readonly child: ChildId;
	readonly epoch: ChildEpoch;
	readonly requestId: JsonRpcRequestId;
	readonly correlation: WireRequestCorrelation;
	readonly method: Method;
	readonly params: ServerRequestPayloads[Method];
	readonly owner: Owner;
};

type HumanServerRequest = {
	[Method in HumanApprovalMethod]: ServerRequestEnvelope<Method, "codex-approvals">;
}[HumanApprovalMethod];

type CurrentTimeServerRequest = Omit<
	ServerRequestEnvelope<"currentTime/read", "codex-session">,
	"params"
> & {
	readonly params: Omit<ServerRequestPayloads["currentTime/read"], "threadId"> & {
		readonly threadId: ThreadId;
	};
};

type SessionServerRequest =
	| CurrentTimeServerRequest
	| {
			[Method in Exclude<SessionServerRequestMethod, "currentTime/read">]: ServerRequestEnvelope<
				Method,
				"codex-session"
			>;
	  }[Exclude<SessionServerRequestMethod, "currentTime/read">];

export type DynamicServerRequest = ServerRequestEnvelope<
	"item/tool/call",
	DynamicDispatcherOwner
> & {
	readonly logicalCall: LogicalToolCallCorrelation;
};

export type TransportServerRequest =
	| HumanServerRequest
	| SessionServerRequest
	| DynamicServerRequest;

export type ReverseResponse =
	| { readonly result: unknown; readonly error?: never }
	| { readonly error: CodexRemoteError; readonly result?: never };

export interface CodexTransportRequestOptions {
	readonly signal?: AbortSignal;
	/** Compatibility metadata; it never changes delivered-versus-unknown settlement. */
	readonly idempotent?: boolean;
	/** The caller may safely retry after inspecting the returned settlement. */
	readonly retryEligible?: boolean;
}

export interface CodexTransportResponse<Method extends ResponseMethod> {
	readonly method: Method;
	readonly correlation: WireRequestCorrelation;
	readonly result: ResponsePayloads[Method];
}

export type TransportServerRequestListener = (request: TransportServerRequest) => void;
export type TransportServerNotificationListener = (event: TransportServerNotification) => void;

export interface TransportStderrChunk {
	readonly text: string;
	readonly bytes: number;
	readonly retainedBytes: number;
	readonly truncated: boolean;
}

export interface TransportExit {
	readonly child: ChildId;
	readonly epoch: ChildEpoch;
	readonly code: number | null;
	readonly signal: NodeJS.Signals | null;
}

export type TransportIssueKind =
	| "malformed-frame"
	| "duplicate-key"
	| "oversized-frame"
	| "unknown-frame"
	| "unknown-response"
	| "duplicate-response"
	| "duplicate-server-request"
	| "correlation-mismatch"
	| "unsupported-server-request"
	| "read-error"
	| "stderr-error"
	| "write-error"
	| "listener-error"
	| "shutdown-timeout";

export interface TransportIssue {
	readonly kind: TransportIssueKind;
	readonly detail: string;
	readonly direction?:
		| "stdout"
		| "stderr"
		| "response"
		| "server-request"
		| "notification"
		| "write";
	readonly method?: string;
	readonly requestId?: string | number;
}

export type LateResponseKind = "result" | "error" | "malformed" | "redacted";
export type LateResponseOutcome = "outcome_unknown" | "duplicate";

type TransportLateResponseContext<Method extends ResponseMethod> = {
	readonly outcome: LateResponseOutcome;
	readonly method: Method;
	readonly settlement: "delivered" | CodexRequestOutcome;
	readonly retryEligible: boolean;
	readonly reason?: CodexRequestFailureReason;
};

type TransportCorrelatedLateResponse<Method extends ResponseMethod> =
	TransportLateResponseContext<Method> & {
		readonly correlation: WireRequestCorrelation;
		readonly requestId: JsonRpcRequestId;
	} & (
			| { readonly kind: "result"; readonly payload: ResponsePayloads[Method] }
			| { readonly kind: "error"; readonly payload: TransportRemoteErrorSummary }
			| { readonly kind: "malformed"; readonly payload: TransportLateMalformedPayload }
		);

type TransportRedactedLateResponse<Method extends ResponseMethod> =
	TransportLateResponseContext<Method> & {
		readonly kind: "redacted";
		readonly payload: TransportLateRedactedPayload;
		/** Correlation is omitted only when retaining it would exceed the record bound. */
		readonly correlation?: WireRequestCorrelation;
		readonly requestId?: JsonRpcRequestId;
	};

export interface TransportLateMalformedPayload {
	readonly reason: "response-schema";
}

export interface TransportLateRedactedPayload {
	readonly reason: "retained-size";
	readonly byteLength: number;
}

export type TransportLateResponseFor<Method extends ResponseMethod> =
	| TransportCorrelatedLateResponse<Method>
	| TransportRedactedLateResponse<Method>;

export type TransportLateResponse = {
	[Method in ResponseMethod]: TransportLateResponseFor<Method>;
}[ResponseMethod];

export interface TransportSnapshot {
	readonly state: "open" | "closing" | "closed";
	readonly pendingRequests: number;
	readonly pendingReverseRequests: number;
	readonly pendingReverseBytes: number;
	readonly queuedFrames: number;
	readonly queuedBytes: number;
	readonly writeInFlight: boolean;
	readonly maxQueuedFrames: number;
	readonly maxQueuedBytes: number;
	readonly responseQueuedFrames: number;
	readonly responseQueuedBytes: number;
	readonly maxResponseQueuedFrames: number;
	readonly maxResponseQueuedBytes: number;
	readonly maxPendingReverseRequests: number;
	readonly maxPendingReverseBytes: number;
}

export interface TransportStderrSnapshot {
	readonly text: string;
	readonly retainedBytes: number;
	readonly totalBytes: number;
	readonly truncated: boolean;
}

export type TransportIssueListener = (issue: TransportIssue) => void;
export type TransportStderrListener = (chunk: TransportStderrChunk) => void;
export type TransportExitListener = (exit: TransportExit) => void;
export type Unsubscribe = () => void;

export type CodexTransportRequestParams<Method extends ResponseMethod> =
	Method extends ClientRequestMethodWithoutParams ? undefined : unknown;

export interface CodexTransportRequest {
	<Method extends ResponseMethod>(
		method: Method,
		params: CodexTransportRequestParams<Method>,
		options?: CodexTransportRequestOptions,
	): Promise<CodexTransportResponse<Method>>;
}

export interface CodexTransport {
	readonly request: CodexTransportRequest;
	readonly sendNotification: (method: ClientNotificationMethod) => Promise<void>;
	readonly registerDynamicDispatcher: (registration: DynamicDispatcherRegistration) => void;
	readonly ownsPendingReverseRequest: (
		request: TransportServerRequest,
		owner: ResponseOwner,
	) => boolean;
	readonly respond: {
		(
			request: TransportServerRequest,
			owner: ResponseOwner,
			response: ReverseResponse,
		): Promise<void>;
	};
	readonly onServerRequest: (listener: TransportServerRequestListener) => Unsubscribe;
	readonly onServerNotification: (listener: TransportServerNotificationListener) => Unsubscribe;
	readonly onIssue: (listener: TransportIssueListener) => Unsubscribe;
	readonly onStderr: (listener: TransportStderrListener) => Unsubscribe;
	readonly onExit: (listener: TransportExitListener) => Unsubscribe;
	readonly inspect: () => TransportSnapshot;
	readonly inspectLateResponses: () => readonly TransportLateResponse[];
	readonly inspectIssues: () => readonly TransportIssue[];
	readonly inspectStderr: () => TransportStderrSnapshot;
	readonly shutdown: () => Promise<void>;
}

export type TransportRequestFailure =
	| CodexTransportRequestError
	| CodexTransportRemoteError
	| CodexTransportWriteError;

export interface CodexTransportOptions {
	readonly child: CodexTransportChild;
	readonly identity: IdentityAuthority;
	readonly dynamicDispatchers?: readonly DynamicDispatcherRegistration[];
}
