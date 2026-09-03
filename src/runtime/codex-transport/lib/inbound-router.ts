import {
	decodeJsonRpcError,
	decodeResponseEnvelope,
	decodeServerNotification,
	decodeServerRequest,
	isSupportedServerRequestMethod,
	JSON_RPC_ERROR_CODES,
	SERVER_REQUEST_SCHEMAS,
	type DecodedServerRequest,
	type ServerRequestPayloads,
} from "../../codex-protocol/index.js";
import { CODEX_APP_SERVER_CAPACITY } from "../../../shared/codex-app-server-capacity/index.js";
import type {
	IdentityAuthority,
	LogicalToolCallCorrelation,
	WireRequestCorrelation,
} from "../../../shared/codex-workbench-identity/index.js";
import { CodexTransportUsageError, type CodexRequestFailureReason } from "./errors.js";
import { createReverseResponder } from "./reverse-responder.js";
import type {
	DynamicDispatcherRegistration,
	ResponseOwner,
	ReverseResponse,
	TransportIssue,
	TransportServerNotification,
	TransportServerRequest,
} from "./types.js";
import type { PendingRequest, RequestTombstone, ReverseRecord, WriteJob } from "./internals.js";
import {
	JsonFrameDecodeError,
	boundedText,
	hasOwn,
	isInList,
	isRecord,
	isWireId,
	isDisabledCapabilityError,
	parseJsonText,
	responseKind,
	wireKey,
	type WireId,
} from "./wire.js";
import { HUMAN_APPROVAL_METHODS, SESSION_SERVER_REQUEST_METHODS } from "./types.js";
import { cloneAndFreeze } from "./public-values.js";

const REVERSE_ERROR_MESSAGES = Object.freeze({
	invalidRequest: "Invalid reverse request.",
	methodNotFound: "Reverse request method was not found.",
	invalidParams: "Reverse request params were invalid.",
	overloaded: "Server overloaded; retry later.",
	unhandled: "No reverse-request handler is available.",
});

export interface InboundRouterOptions {
	readonly identity: () => IdentityAuthority;
	readonly state: () => "open" | "closing" | "closed";
	readonly pendingRequests: Map<string, PendingRequest>;
	readonly tombstones: Map<string, RequestTombstone>;
	readonly reverseRequests: Map<string, ReverseRecord>;
	readonly completedReverseIds: Set<string>;
	readonly reverseHandles: WeakMap<TransportServerRequest, ReverseRecord>;
	readonly pendingReverseBytes: {
		readonly get: () => number;
		readonly add: (bytes: number) => void;
		readonly remove: (bytes: number) => void;
	};
	readonly dynamicDispatchers: Map<string, DynamicDispatcherRegistration>;
	readonly emitIssue: (issue: TransportIssue) => void;
	readonly emitServerRequest: (request: TransportServerRequest) => boolean;
	readonly emitServerNotification: (event: TransportServerNotification) => void;
	readonly settleFailure: (pending: PendingRequest, reason: CodexRequestFailureReason) => void;
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
	readonly enqueue: (job: WriteJob, lane?: "regular" | "response") => void;
	readonly enqueueProtocolError: (wireId: WireId, code: number, message: string) => boolean;
}

export interface InboundRouter {
	readonly handleLine: (line: Buffer) => void;
	readonly registerDynamicDispatcher: (registration: DynamicDispatcherRegistration) => void;
	readonly respond: (
		request: TransportServerRequest,
		owner: ResponseOwner,
		response: ReverseResponse,
	) => Promise<void>;
}

export function createInboundRouter(options: InboundRouterOptions): InboundRouter {
	const issueReverse = (kind: TransportIssue["kind"], detail: string, rawId?: WireId): void => {
		options.emitIssue({
			kind,
			direction: "server-request",
			detail,
			...(rawId === undefined ? {} : { requestId: rawId }),
		});
	};

	const protocolError = (rawId: WireId, code: number, message: string): void => {
		options.enqueueProtocolError(rawId, code, message);
	};
	const handleResponse = (value: Record<string, unknown>): void => {
		const rawId = value.id;
		if (!isWireId(rawId)) {
			options.emitIssue({
				kind: "malformed-frame",
				direction: "response",
				detail: "A response id must be a non-empty string or safe integer",
			});
			return;
		}
		const key = wireKey(rawId);
		const pending = options.pendingRequests.get(key);
		if (!pending) {
			const tombstone = options.tombstones.get(key);
			if (tombstone) options.retainLateResponse(tombstone, value);
			else
				options.emitIssue({
					kind: "unknown-response",
					direction: "response",
					requestId: rawId,
					detail: "No request in this child epoch owns the response id",
				});
			return;
		}
		const kind = responseKind(value);
		if (kind === "malformed") {
			options.emitIssue({
				kind: "malformed-frame",
				direction: "response",
				method: pending.method,
				requestId: rawId,
				detail: "A response must contain exactly one result or error",
			});
			options.settleFailure(pending, "malformed-response");
			return;
		}
		try {
			if (kind === "result")
				options.settleDelivered(pending, decodeResponseEnvelope(pending.method, value).result);
			else options.settleRemoteError(pending, decodeJsonRpcError(value, pending.method).error);
		} catch {
			options.emitIssue({
				kind: "malformed-frame",
				direction: "response",
				method: pending.method,
				requestId: rawId,
				detail: "The response failed the generated Codex decoder",
			});
			options.settleFailure(pending, "malformed-response");
		}
	};
	const routeServerRequest = (
		decoded: DecodedServerRequest,
		rawId: WireId,
	): TransportServerRequest => {
		const identity = options.identity();
		const requestId = identity.decoder.adoptJsonRpcRequestId(rawId);
		const correlation: WireRequestCorrelation = identity.decoder.createWireRequestCorrelation({
			requestId,
		});
		if (isInList(HUMAN_APPROVAL_METHODS, decoded.method))
			return {
				child: correlation.child,
				epoch: correlation.epoch,
				requestId,
				correlation,
				method: decoded.method,
				params: decoded.params,
				owner: "codex-approvals",
			} as TransportServerRequest;
		if (decoded.method === "item/tool/call") {
			const params = decoded.params as ServerRequestPayloads["item/tool/call"];
			if (params.namespace === null)
				throw new CodexTransportUsageError("dynamic tool namespace is null");
			const registration = options.dynamicDispatchers.get(params.namespace);
			if (!registration)
				throw new CodexTransportUsageError("no dynamic dispatcher owns the requested namespace");
			const logicalCall: LogicalToolCallCorrelation =
				identity.decoder.createLogicalToolCallCorrelation({
					threadId: identity.decoder.adoptThreadId(params.threadId),
					turnId: identity.decoder.adoptTurnId(params.turnId),
					callId: identity.decoder.adoptDynamicToolCallId(params.callId),
					namespace: params.namespace,
					tool: params.tool,
					manifestHash: registration.manifestHash,
				});
			return {
				child: correlation.child,
				epoch: correlation.epoch,
				requestId,
				correlation,
				method: decoded.method,
				params,
				owner: registration.owner,
				logicalCall,
			} as TransportServerRequest;
		}
		if (decoded.method === "currentTime/read") {
			const params = decoded.params as ServerRequestPayloads["currentTime/read"];
			return {
				child: correlation.child,
				epoch: correlation.epoch,
				requestId,
				correlation,
				method: decoded.method,
				params: {
					...params,
					threadId: identity.decoder.resolveThreadId(params.threadId),
				},
				owner: "codex-session",
			} as TransportServerRequest;
		}
		if (isInList(SESSION_SERVER_REQUEST_METHODS, decoded.method))
			return {
				child: correlation.child,
				epoch: correlation.epoch,
				requestId,
				correlation,
				method: decoded.method,
				params: decoded.params,
				owner: "codex-session",
			} as TransportServerRequest;
		throw new CodexTransportUsageError("no response owner exists for the reverse method");
	};
	const handleServerRequest = (value: Record<string, unknown>, frameBytes: number): void => {
		const rawId = value.id;
		if (!isWireId(rawId)) {
			issueReverse("malformed-frame", "A reverse request id is invalid");
			return;
		}
		const key = wireKey(rawId);
		if (options.reverseRequests.has(key) || options.completedReverseIds.has(key)) {
			issueReverse("duplicate-server-request", "A reverse request id was already used", rawId);
			return;
		}
		const method = value.method;
		if (typeof method !== "string") {
			issueReverse("malformed-frame", "A reverse request method is missing or invalid", rawId);
			protocolError(
				rawId,
				JSON_RPC_ERROR_CODES.invalidRequest,
				REVERSE_ERROR_MESSAGES.invalidRequest,
			);
			return;
		}
		if (Object.keys(value).some((keyName) => !["id", "method", "params"].includes(keyName))) {
			issueReverse("malformed-frame", "A reverse request has invalid envelope fields", rawId);
			protocolError(
				rawId,
				JSON_RPC_ERROR_CODES.invalidRequest,
				REVERSE_ERROR_MESSAGES.invalidRequest,
			);
			return;
		}
		if (!isSupportedServerRequestMethod(method)) {
			issueReverse(
				"unsupported-server-request",
				"The reverse request method is not supported",
				rawId,
			);
			protocolError(
				rawId,
				JSON_RPC_ERROR_CODES.methodNotFound,
				REVERSE_ERROR_MESSAGES.methodNotFound,
			);
			return;
		}
		if (!hasOwn(value, "params")) {
			issueReverse("malformed-frame", "A reverse request has no params field", rawId);
			protocolError(
				rawId,
				JSON_RPC_ERROR_CODES.invalidParams,
				REVERSE_ERROR_MESSAGES.invalidParams,
			);
			return;
		}
		if (
			options.reverseRequests.size >= CODEX_APP_SERVER_CAPACITY.outbound.pendingReverseRequests ||
			options.pendingReverseBytes.get() + frameBytes >
				CODEX_APP_SERVER_CAPACITY.outbound.pendingReverseBytes
		) {
			issueReverse("unsupported-server-request", "The reverse-request capacity is full", rawId);
			protocolError(rawId, -32001, REVERSE_ERROR_MESSAGES.overloaded);
			return;
		}
		let decoded: DecodedServerRequest;
		try {
			decoded = decodeServerRequest(value);
		} catch (error) {
			if (!isDisabledCapabilityError(error)) {
				issueReverse("malformed-frame", "The reverse request params were invalid", rawId);
				protocolError(
					rawId,
					JSON_RPC_ERROR_CODES.invalidParams,
					REVERSE_ERROR_MESSAGES.invalidParams,
				);
				return;
			}
			const schema = SERVER_REQUEST_SCHEMAS[method];
			const parsed = schema.safeParse(value.params);
			if (!parsed.success) {
				issueReverse("malformed-frame", "The reverse request params were invalid", rawId);
				protocolError(
					rawId,
					JSON_RPC_ERROR_CODES.invalidParams,
					REVERSE_ERROR_MESSAGES.invalidParams,
				);
				return;
			}
			decoded = { id: rawId, method, params: parsed.data } as DecodedServerRequest;
		}
		let request: TransportServerRequest;
		try {
			request = cloneAndFreeze(routeServerRequest(decoded, rawId));
		} catch (error) {
			const dynamicParams =
				method === "item/tool/call"
					? (decoded.params as ServerRequestPayloads["item/tool/call"])
					: undefined;
			const missingOwner =
				error instanceof CodexTransportUsageError &&
				method === "item/tool/call" &&
				dynamicParams?.namespace !== null &&
				dynamicParams !== undefined &&
				!options.dynamicDispatchers.has(dynamicParams.namespace);
			const invalidDynamicParams = method === "item/tool/call" && dynamicParams?.namespace === null;
			issueReverse(
				missingOwner
					? "unsupported-server-request"
					: invalidDynamicParams
						? "malformed-frame"
						: "correlation-mismatch",
				missingOwner
					? "The reverse request has no registered dispatcher"
					: invalidDynamicParams
						? "The reverse request params were invalid"
						: "The reverse request identity is invalid",
				rawId,
			);
			protocolError(
				rawId,
				missingOwner ? JSON_RPC_ERROR_CODES.methodNotFound : JSON_RPC_ERROR_CODES.invalidParams,
				missingOwner ? REVERSE_ERROR_MESSAGES.methodNotFound : REVERSE_ERROR_MESSAGES.invalidParams,
			);
			return;
		}
		const record: ReverseRecord = {
			key,
			wireId: rawId,
			request,
			bytes: frameBytes,
			responded: false,
			responding: false,
		};
		options.reverseRequests.set(key, record);
		options.pendingReverseBytes.add(frameBytes);
		options.reverseHandles.set(request, record);
		const handled = options.emitServerRequest(request);
		if (!handled && !record.responding && options.reverseRequests.get(key) === record) {
			options.reverseRequests.delete(key);
			options.reverseHandles.delete(request);
			options.pendingReverseBytes.remove(frameBytes);
			issueReverse("unsupported-server-request", REVERSE_ERROR_MESSAGES.unhandled, rawId);
			protocolError(rawId, JSON_RPC_ERROR_CODES.internalError, REVERSE_ERROR_MESSAGES.unhandled);
		}
	};
	const handleNotification = (value: unknown): void => {
		try {
			const notification = cloneAndFreeze(decodeServerNotification(value));
			const correlation = Object.freeze({
				child: options.identity().validator.childId,
				epoch: options.identity().validator.epoch,
				requestId: null,
			});
			options.emitServerNotification(Object.freeze({ correlation, notification }));
		} catch {
			options.emitIssue({
				kind: "malformed-frame",
				direction: "notification",
				detail: "The server notification failed the generated Codex decoder",
			});
		}
	};
	const handleLine = (line: Buffer): void => {
		const state = options.state();
		if (state === "closed") return;
		if (line.byteLength === 0) {
			options.emitIssue({
				kind: "malformed-frame",
				direction: "stdout",
				detail: "An empty stdout line is not JSON",
			});
			return;
		}
		let decoded: unknown;
		try {
			decoded = parseJsonText(
				new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(line),
			);
		} catch (error) {
			if (error instanceof JsonFrameDecodeError && error.kind === "duplicate-key") {
				const pending =
					error.wireId === undefined || error.methodPresent
						? undefined
						: options.pendingRequests.get(wireKey(error.wireId));
				const reverseDuplicate = error.methodPresent && error.wireId !== undefined;
				options.emitIssue({
					kind: "duplicate-key",
					direction: pending ? "response" : reverseDuplicate ? "server-request" : "stdout",
					detail: "A JSON object contains a duplicate key",
					...(pending === undefined ? {} : { method: pending.method }),
					...(error.wireId === undefined ? {} : { requestId: error.wireId }),
				});
				if (pending) options.settleFailure(pending, "malformed-response");
				else if (error.methodPresent && error.wireId !== undefined)
					protocolError(
						error.wireId,
						state === "closing"
							? JSON_RPC_ERROR_CODES.internalError
							: JSON_RPC_ERROR_CODES.invalidRequest,
						state === "closing"
							? "Codex transport is shutting down."
							: REVERSE_ERROR_MESSAGES.invalidRequest,
					);
			} else {
				options.emitIssue({
					kind: "malformed-frame",
					direction: "stdout",
					detail: "A complete stdout line is not valid UTF-8 JSON",
				});
			}
			return;
		}
		if (!isRecord(decoded)) {
			options.emitIssue({
				kind: "unknown-frame",
				direction: "stdout",
				detail: "A JSON frame must be an object",
			});
			return;
		}
		const hasId = hasOwn(decoded, "id");
		const hasMethod = hasOwn(decoded, "method");
		const hasResultOrError = hasOwn(decoded, "result") || hasOwn(decoded, "error");
		if (state === "closing") {
			if (hasMethod && hasId && isWireId(decoded.id))
				protocolError(
					decoded.id,
					JSON_RPC_ERROR_CODES.internalError,
					"Codex transport is shutting down.",
				);
			else if (hasMethod && hasId)
				options.emitIssue({
					kind: "malformed-frame",
					direction: "server-request",
					detail: "A closing reverse request id is invalid",
				});
			return;
		}
		if (hasMethod) {
			if (hasId) handleServerRequest(decoded, line.byteLength);
			else handleNotification(decoded);
		} else if (hasId && hasResultOrError) handleResponse(decoded);
		else if (hasId && isWireId(decoded.id)) {
			const key = wireKey(decoded.id);
			if (options.pendingRequests.has(key)) handleResponse(decoded);
			else if (options.reverseRequests.has(key) || options.completedReverseIds.has(key))
				issueReverse(
					"duplicate-server-request",
					"A reverse request id was already used",
					decoded.id,
				);
			else
				protocolError(
					decoded.id,
					JSON_RPC_ERROR_CODES.invalidRequest,
					REVERSE_ERROR_MESSAGES.invalidRequest,
				);
		} else
			options.emitIssue({
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
		if (options.dynamicDispatchers.has(registration.namespace))
			throw new CodexTransportUsageError(
				`namespace ${registration.namespace} already has a dynamic owner`,
			);
		options.dynamicDispatchers.set(registration.namespace, Object.freeze({ ...registration }));
	};
	const responder = createReverseResponder({
		reverseRequests: options.reverseRequests,
		reverseHandles: options.reverseHandles,
		removePendingBytes: options.pendingReverseBytes.remove,
		retainCompletedReverseId: options.retainCompletedReverseId,
		enqueue: (job, lane) => options.enqueue(job, lane),
	});

	return Object.freeze({ handleLine, registerDynamicDispatcher, respond: responder.respond });
}
