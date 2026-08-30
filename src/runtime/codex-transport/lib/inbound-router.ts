import {
	decodeJsonRpcError,
	decodeResponseEnvelope,
	decodeServerNotification,
	decodeServerRequest,
	isSupportedServerRequestMethod,
	SERVER_REQUEST_SCHEMAS,
	type DecodedServerRequest,
	type ServerRequestPayloads,
} from "../../codex-protocol/index.js";
import type {
	IdentityAuthority,
	LogicalToolCallCorrelation,
	WireRequestCorrelation,
} from "../../../shared/codex-workbench-identity/index.js";
import { CodexTransportUsageError, type CodexRequestFailureReason } from "./errors.js";
import type {
	DynamicDispatcherRegistration,
	ResponseOwner,
	ReverseResponse,
	TransportIssue,
	TransportServerNotification,
	TransportServerRequest,
} from "./types.js";
import type { PendingRequest, RequestTombstone, ReverseRecord, WriteJob } from "./internals.js";
import { createReverseResponder } from "./reverse-responder.js";
import {
	hasOwn,
	isDisabledCapabilityError,
	isInList,
	isRecord,
	isWireId,
	responseKind,
	wireKey,
	boundedText,
	type WireId,
} from "./wire.js";
import { HUMAN_APPROVAL_METHODS, SESSION_SERVER_REQUEST_METHODS } from "./types.js";

export interface InboundRouterOptions {
	readonly identity: IdentityAuthority;
	readonly pendingRequests: Map<string, PendingRequest>;
	readonly tombstones: Map<string, RequestTombstone>;
	readonly reverseRequests: Map<string, ReverseRecord>;
	readonly completedReverseIds: Set<string>;
	readonly reverseHandles: WeakMap<TransportServerRequest, ReverseRecord>;
	readonly dynamicDispatchers: Map<string, DynamicDispatcherRegistration>;
	readonly emitIssue: (issue: TransportIssue) => void;
	readonly emitServerRequest: (request: TransportServerRequest) => void;
	readonly emitServerNotification: (event: TransportServerNotification) => void;
	readonly settleFailure: (
		pending: PendingRequest,
		reason: CodexRequestFailureReason,
		cause?: unknown,
	) => void;
	readonly settleDelivered: (pending: PendingRequest, result: unknown) => void;
	readonly settleRemoteError: (
		pending: PendingRequest,
		rpcError: { readonly code: number; readonly message: string; readonly data?: unknown },
	) => void;
	readonly retainLateResponse: (
		tombstone: RequestTombstone,
		value: Record<string, unknown>,
	) => void;
	readonly retainCompletedReverseId: (key: string) => void;
	readonly enqueue: (job: WriteJob) => void;
}

export interface InboundRouter {
	readonly handleLine: (line: Buffer) => void;
	readonly registerDynamicDispatcher: (registration: DynamicDispatcherRegistration) => void;
	readonly respond: {
		(request: TransportServerRequest, response: ReverseResponse): Promise<void>;
		(
			request: TransportServerRequest,
			owner: ResponseOwner,
			response: ReverseResponse,
		): Promise<void>;
	};
}

export function createInboundRouter(options: InboundRouterOptions): InboundRouter {
	const {
		identity,
		pendingRequests,
		tombstones,
		reverseRequests,
		completedReverseIds,
		reverseHandles,
		dynamicDispatchers,
		emitIssue,
		emitServerRequest,
		emitServerNotification,
		settleFailure,
		settleDelivered,
		settleRemoteError,
		retainLateResponse,
		retainCompletedReverseId,
		enqueue,
	} = options;

	const handleResponse = (value: Record<string, unknown>): void => {
		const rawId = value.id;
		if (!isWireId(rawId)) {
			emitIssue({
				kind: "malformed-frame",
				direction: "response",
				detail: "A response id must be a non-empty string or safe integer",
			});
			return;
		}
		const key = wireKey(rawId);
		const pending = pendingRequests.get(key);
		if (!pending) {
			const tombstone = tombstones.get(key);
			if (tombstone) retainLateResponse(tombstone, value);
			else
				emitIssue({
					kind: "unknown-response",
					direction: "response",
					requestId: rawId,
					detail: "No request in this child epoch owns the response id",
				});
			return;
		}
		const kind = responseKind(value);
		if (kind === "malformed") {
			emitIssue({
				kind: "malformed-frame",
				direction: "response",
				method: pending.method,
				requestId: rawId,
				detail: "A response must contain exactly one result or error",
			});
			settleFailure(pending, "malformed-response");
			return;
		}
		try {
			if (kind === "result") {
				const decoded = decodeResponseEnvelope(pending.method, value);
				settleDelivered(pending, decoded.result);
			} else {
				const decoded = decodeJsonRpcError(value, pending.method);
				settleRemoteError(pending, decoded.error);
			}
		} catch (error) {
			emitIssue({
				kind: "malformed-frame",
				direction: "response",
				method: pending.method,
				requestId: rawId,
				detail: "The response failed the generated Codex decoder",
				cause: error,
			});
			settleFailure(pending, "malformed-response", error);
		}
	};

	const routeServerRequest = (
		decoded: DecodedServerRequest,
		rawId: WireId,
	): TransportServerRequest => {
		const requestId = identity.decoder.adoptJsonRpcRequestId(String(rawId));
		const correlation: WireRequestCorrelation = identity.decoder.createWireRequestCorrelation({
			requestId,
		});
		if (isInList(HUMAN_APPROVAL_METHODS, decoded.method))
			return Object.freeze({
				child: correlation.child,
				epoch: correlation.epoch,
				requestId,
				correlation,
				method: decoded.method,
				params: decoded.params,
				owner: "codex-approvals",
			}) as TransportServerRequest;
		if (decoded.method === "item/tool/call") {
			const params = decoded.params as ServerRequestPayloads["item/tool/call"];
			if (params.namespace === null)
				throw new CodexTransportUsageError("dynamic tool namespace is null");
			const registration = dynamicDispatchers.get(params.namespace);
			if (!registration)
				throw new CodexTransportUsageError(
					`no dynamic dispatcher owns namespace ${JSON.stringify(params.namespace)}`,
				);
			const logicalCall: LogicalToolCallCorrelation =
				identity.decoder.createLogicalToolCallCorrelation({
					threadId: identity.decoder.adoptThreadId(params.threadId),
					turnId: identity.decoder.adoptTurnId(params.turnId),
					callId: identity.decoder.adoptDynamicToolCallId(params.callId),
					namespace: params.namespace,
					tool: params.tool,
					manifestHash: registration.manifestHash,
				});
			return Object.freeze({
				child: correlation.child,
				epoch: correlation.epoch,
				requestId,
				correlation,
				method: decoded.method,
				params,
				owner: registration.owner,
				logicalCall,
			}) as TransportServerRequest;
		}
		if (isInList(SESSION_SERVER_REQUEST_METHODS, decoded.method))
			return Object.freeze({
				child: correlation.child,
				epoch: correlation.epoch,
				requestId,
				correlation,
				method: decoded.method,
				params: decoded.params,
				owner: "codex-session",
			}) as TransportServerRequest;
		throw new CodexTransportUsageError(`no response owner exists for ${String(decoded.method)}`);
	};

	const handleServerRequest = (value: Record<string, unknown>): void => {
		const rawId = value.id;
		if (!isWireId(rawId)) {
			emitIssue({
				kind: "malformed-frame",
				direction: "server-request",
				detail: "A reverse request id must be a non-empty string or safe integer",
			});
			return;
		}
		const key = wireKey(rawId);
		if (reverseRequests.has(key) || completedReverseIds.has(key)) {
			emitIssue({
				kind: "duplicate-server-request",
				direction: "server-request",
				requestId: rawId,
				detail: "A reverse request id is already active or has already been answered",
			});
			return;
		}
		if (typeof value.method !== "string" || !isSupportedServerRequestMethod(value.method)) {
			emitIssue({
				kind: "unsupported-server-request",
				direction: "server-request",
				requestId: rawId,
				detail: `No generated Codex reverse-request schema owns ${String(value.method)}`,
			});
			return;
		}
		let decoded: DecodedServerRequest;
		try {
			decoded = decodeServerRequest(value);
		} catch (error) {
			if (!isDisabledCapabilityError(error)) {
				emitIssue({
					kind: "malformed-frame",
					direction: "server-request",
					method: value.method,
					requestId: rawId,
					detail: "The reverse request failed the generated Codex decoder",
					cause: error,
				});
				return;
			}
			const schema = SERVER_REQUEST_SCHEMAS[value.method];
			const parsed = schema.safeParse(value.params);
			if (!parsed.success) {
				emitIssue({
					kind: "malformed-frame",
					direction: "server-request",
					method: value.method,
					requestId: rawId,
					detail: "The disabled capability request has malformed params",
					cause: parsed.error,
				});
				return;
			}
			decoded = { id: rawId, method: value.method, params: parsed.data } as DecodedServerRequest;
		}
		let request: TransportServerRequest;
		try {
			request = routeServerRequest(decoded, rawId);
		} catch (error) {
			emitIssue({
				kind:
					error instanceof CodexTransportUsageError
						? "unsupported-server-request"
						: "correlation-mismatch",
				direction: "server-request",
				method: decoded.method,
				requestId: rawId,
				detail: error instanceof Error ? error.message : String(error),
				cause: error,
			});
			return;
		}
		const record: ReverseRecord = { key, wireId: rawId, request, responded: false };
		reverseRequests.set(key, record);
		reverseHandles.set(request, record);
		emitServerRequest(request);
	};

	const handleNotification = (value: unknown): void => {
		let notification;
		try {
			notification = decodeServerNotification(value);
		} catch (error) {
			emitIssue({
				kind: "malformed-frame",
				direction: "notification",
				detail: "The server notification failed the generated Codex decoder",
				cause: error,
			});
			return;
		}
		const correlation = Object.freeze({
			child: identity.validator.childId,
			epoch: identity.validator.epoch,
			requestId: null,
		});
		emitServerNotification(Object.freeze({ correlation, notification }));
	};

	const handleLine = (line: Buffer): void => {
		if (line.byteLength === 0) {
			emitIssue({
				kind: "malformed-frame",
				direction: "stdout",
				detail: "An empty stdout line is not JSON",
			});
			return;
		}
		let decoded: unknown;
		try {
			decoded = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(line));
		} catch (error) {
			emitIssue({
				kind: "malformed-frame",
				direction: "stdout",
				detail: "A complete stdout line is not valid UTF-8 JSON",
				cause: error,
			});
			return;
		}
		if (!isRecord(decoded)) {
			emitIssue({
				kind: "unknown-frame",
				direction: "stdout",
				detail: "A JSON frame must be an object",
			});
			return;
		}
		const hasId = hasOwn(decoded, "id");
		const hasMethod = hasOwn(decoded, "method");
		const hasResultOrError = hasOwn(decoded, "result") || hasOwn(decoded, "error");
		if (hasId && hasResultOrError) handleResponse(decoded);
		else if (hasMethod && hasId) handleServerRequest(decoded);
		else if (hasMethod) handleNotification(decoded);
		else
			emitIssue({
				kind: "unknown-frame",
				direction: "stdout",
				detail: "The JSON frame has no known direction",
			});
	};

	const registerDynamicDispatcher = (registration: DynamicDispatcherRegistration): void => {
		if (
			registration.owner !== "codex-dynamic-tools" &&
			registration.owner !== "codex-coordinator-tools"
		)
			throw new CodexTransportUsageError("a dynamic dispatcher must use an approved dynamic owner");
		boundedText(registration.namespace, "dynamic dispatcher namespace");
		boundedText(registration.manifestHash, "dynamic dispatcher manifestHash");
		if (dynamicDispatchers.has(registration.namespace))
			throw new CodexTransportUsageError(
				`namespace ${registration.namespace} already has a dynamic owner`,
			);
		dynamicDispatchers.set(registration.namespace, Object.freeze({ ...registration }));
	};

	const responder = createReverseResponder({
		reverseRequests,
		reverseHandles,
		retainCompletedReverseId,
		enqueue,
	});

	return Object.freeze({
		handleLine,
		registerDynamicDispatcher,
		respond: responder.respond,
	});
}
