import {
	decodeJsonRpcError,
	decodeResponseEnvelope,
	decodeServerNotification,
	decodeServerRequest,
	isSupportedServerRequestMethod,
	JSON_RPC_ERROR_CODES,
	SERVER_REQUEST_SCHEMAS,
	type DecodedServerRequest,
	type ServerRequestMethod,
	type ServerRequestPayloads,
} from "@/runtime/codex-protocol";
import { CODEX_APP_SERVER_CAPACITY } from "@/shared/codex-app-server-capacity";
import type {
	IdentityAuthority,
	JsonRpcRequestId,
	WireRequestCorrelation,
} from "@/shared/codex-workbench-identity";
import {
	CodexTransportUsageError,
	type CodexRequestFailureReason,
} from "@/runtime/codex-transport/lib/errors";
import { createReverseResponder } from "@/runtime/codex-transport/lib/reverse-responder";
import type {
	DynamicDispatcherRegistration,
	DynamicServerRequest,
	ResponseOwner,
	ReverseResponse,
	TransportIssue,
	TransportServerNotification,
	TransportServerRequest,
} from "@/runtime/codex-transport/lib/types";
import type {
	PendingRequest,
	RequestTombstone,
	ReverseRecord,
	WriteJob,
} from "@/runtime/codex-transport/lib/internals";
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
} from "@/runtime/codex-transport/lib/wire";
import {
	DYNAMIC_DISPATCHER_OWNERS,
	HUMAN_APPROVAL_METHODS,
	SESSION_SERVER_REQUEST_METHODS,
} from "@/runtime/codex-transport/lib/types";
import { cloneAndFreeze } from "@/runtime/codex-transport/lib/public-values";

const REVERSE_ERROR_MESSAGES = Object.freeze({
	invalidRequest: "Invalid reverse request.",
	methodNotFound: "Reverse request method was not found.",
	invalidParams: "Reverse request params were invalid.",
	overloaded: "Server overloaded; retry later.",
	unhandled: "No reverse-request handler is available.",
});

const SHUTTING_DOWN_MESSAGE = "Codex transport is shutting down.";
const OVERLOADED_CODE = -32001;
const ENVELOPE_KEYS: readonly string[] = Object.freeze(["id", "method", "params"]);

/** Why a reverse request was refused, and the protocol error to answer it with, if any. */
interface ReverseRefusal {
	readonly kind: "refused";
	readonly issue: TransportIssue["kind"];
	readonly detail: string;
	readonly code?: number;
	readonly message?: string;
}

/** A reverse request that passed envelope validation. */
interface ReverseAdmission {
	readonly kind: "admitted";
	readonly method: ServerRequestMethod;
}

const INVALID_PARAMS_REFUSAL: ReverseRefusal = Object.freeze({
	kind: "refused",
	issue: "malformed-frame",
	detail: "The reverse request params were invalid",
	code: JSON_RPC_ERROR_CODES.invalidParams,
	message: REVERSE_ERROR_MESSAGES.invalidParams,
});

/** The correlation fields every published reverse request carries. */
interface RequestEnvelopeFields {
	readonly child: WireRequestCorrelation["child"];
	readonly epoch: WireRequestCorrelation["epoch"];
	readonly requestId: JsonRpcRequestId;
	readonly correlation: WireRequestCorrelation;
}

type DecodedRequestFor<Method extends ServerRequestMethod> = Extract<
	DecodedServerRequest,
	{ readonly method: Method }
>;

/** The reverse requests whose envelope is published as decoded, under a fixed owner. */
type PlainOwnedRequest = Exclude<DecodedServerRequest, { readonly method: "item/tool/call" | "currentTime/read" }>;

interface InboundRouterOptions {
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

interface InboundRouter {
	readonly handleLine: (line: Buffer) => void;
	readonly registerDynamicDispatcher: (registration: DynamicDispatcherRegistration) => void;
	readonly respond: (
		request: TransportServerRequest,
		owner: ResponseOwner,
		response: ReverseResponse,
	) => Promise<void>;
}

/**
 * Builds a refusal that answers the frame with a JSON-RPC error.
 * @param issue The issue kind to raise.
 * @param detail The issue detail.
 * @param code The JSON-RPC error code to answer with.
 * @param message The JSON-RPC error message.
 * @returns The refusal.
 */
function refusal(
	issue: TransportIssue["kind"],
	detail: string,
	code: number,
	message: string,
): ReverseRefusal {
	return { kind: "refused", issue, detail, code, message };
}

/**
 * Whether a frame carries only the JSON-RPC request envelope keys.
 * @param value The decoded frame.
 * @returns True when no foreign key is present.
 */
function hasOnlyEnvelopeKeys(value: Record<string, unknown>): boolean {
	return Object.keys(value).every((keyName) => ENVELOPE_KEYS.includes(keyName));
}

/**
 * Whether a frame carries a result or an error member, however many.
 * @param value The decoded frame.
 * @returns True when either member is present.
 */
function carriesOutcome(value: Record<string, unknown>): boolean {
	return hasOwn(value, "result") || hasOwn(value, "error");
}

/**
 * The fixed owner of a reverse method that is published as decoded.
 * @param method The reverse method.
 * @returns The approvals owner for human approvals, the session owner for session methods.
 */
function plainOwner(method: ServerRequestMethod): "codex-approvals" | "codex-session" | undefined {
	if (isInList(HUMAN_APPROVAL_METHODS, method)) return "codex-approvals";
	if (isInList(SESSION_SERVER_REQUEST_METHODS, method)) return "codex-session";
	return undefined;
}

/**
 * Publishes a decoded reverse request under its fixed owner.
 * @param decoded The decoded request.
 * @param envelope The correlation fields.
 * @param owner The owner that answers it.
 * @returns The request as listeners see it.
 */
function plainOwnedRequest(
	decoded: PlainOwnedRequest,
	envelope: RequestEnvelopeFields,
	owner: "codex-approvals" | "codex-session",
): TransportServerRequest {
	// `decoded` is one member of the generated discriminated union, so its method and params
	// already agree; TypeScript cannot re-correlate them once they are read as two properties.
	// oxlint-disable-next-line typescript(no-unsafe-type-assertion) -- method and params come from one decoded member
	return { ...envelope, method: decoded.method, params: decoded.params, owner } as TransportServerRequest;
}

/**
 * Re-parses the params of a reverse request whose capability Archboard disabled, so the
 * session owner can answer it with the method-not-found error the contract requires.
 * @param value The decoded frame.
 * @param method The reverse method.
 * @param rawId The frame's wire id.
 * @returns The decoded request, or undefined when its params do not fit the method's schema.
 */
function decodeDisabledCapabilityRequest(
	value: Record<string, unknown>,
	method: ServerRequestMethod,
	rawId: WireId,
): DecodedServerRequest | undefined {
	const parsed = SERVER_REQUEST_SCHEMAS[method].safeParse(value["params"]);
	if (!parsed.success) {
		return undefined;
	}
	// The params were parsed by the schema registered for this same method, so the pair is
	// correlated; TypeScript cannot relate an indexed schema's output back to its key.
	// oxlint-disable-next-line typescript(no-unsafe-type-assertion) -- params parsed by this method's own schema
	return { id: rawId, method, params: parsed.data } as DecodedServerRequest;
}

/**
 * Creates the stdout frame router: it decodes each line, settles responses, publishes
 * notifications and reverse requests, and answers what it refuses.
 * @param options The transport's tables, settlement hooks and write queue.
 * @returns The router.
 */
function createInboundRouter(options: InboundRouterOptions): InboundRouter {
	/**
	 * Raises an issue attributed to the reverse-request direction.
	 * @param kind The issue kind.
	 * @param detail The issue detail.
	 * @param rawId The frame's wire id, when it was readable.
	 */
	const issueReverse = (kind: TransportIssue["kind"], detail: string, rawId?: WireId): void => {
		options.emitIssue({
			kind,
			direction: "server-request",
			detail,
			...(rawId === undefined ? {} : { requestId: rawId }),
		});
	};

	/**
	 * Answers a frame with a JSON-RPC error on the response lane.
	 * @param rawId The frame's wire id.
	 * @param code The error code.
	 * @param message The error message.
	 */
	const protocolError = (rawId: WireId, code: number, message: string): void => {
		options.enqueueProtocolError(rawId, code, message);
	};

	/**
	 * Raises a refusal's issue and, when it carries one, its protocol error.
	 * @param rawId The refused frame's wire id.
	 * @param refused The refusal.
	 */
	const refuse = (rawId: WireId, refused: ReverseRefusal): void => {
		issueReverse(refused.issue, refused.detail, rawId);
		if (refused.code !== undefined && refused.message !== undefined) {
			protocolError(rawId, refused.code, refused.message);
		}
	};

	/**
	 * Answers a reverse frame received while closing, or when its id was unusable.
	 * @param rawId The frame's wire id.
	 * @param state Whether the transport is open or closing.
	 */
	const refuseForState = (rawId: WireId, state: "open" | "closing"): void => {
		if (state === "closing") {
			protocolError(rawId, JSON_RPC_ERROR_CODES.internalError, SHUTTING_DOWN_MESSAGE);
		} else {
			protocolError(rawId, JSON_RPC_ERROR_CODES.invalidRequest, REVERSE_ERROR_MESSAGES.invalidRequest);
		}
	};

	/**
	 * Retains a response for a settled request, or reports one nothing owns.
	 * @param key The wire key.
	 * @param rawId The frame's wire id.
	 * @param value The response frame.
	 */
	const retainOrReportLateResponse = (
		key: string,
		rawId: WireId,
		value: Record<string, unknown>,
	): void => {
		const tombstone = options.tombstones.get(key);
		if (tombstone) {
			options.retainLateResponse(tombstone, value);
			return;
		}
		options.emitIssue({
			kind: "unknown-response",
			direction: "response",
			requestId: rawId,
			detail: "No request in this child epoch owns the response id",
		});
	};

	/**
	 * Settles a pending request from its response frame.
	 * @param pending The pending request.
	 * @param rawId The frame's wire id.
	 * @param value The response frame.
	 */
	const settleResponse = (
		pending: PendingRequest,
		rawId: WireId,
		value: Record<string, unknown>,
	): void => {
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
			if (kind === "result") {
				options.settleDelivered(pending, decodeResponseEnvelope(pending.method, value).result);
			} else {
				options.settleRemoteError(pending, decodeJsonRpcError(value, pending.method).error);
			}
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

	/**
	 * Routes a response frame to its pending request or the late-response log.
	 * @param value The decoded frame.
	 */
	const handleResponse = (value: Record<string, unknown>): void => {
		const rawId = value["id"];
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
			retainOrReportLateResponse(key, rawId, value);
			return;
		}
		settleResponse(pending, rawId, value);
	};

	/**
	 * Publishes a dynamic tool call under the dispatcher registered for its namespace.
	 * @param decoded The decoded call.
	 * @param envelope The correlation fields.
	 * @param identity The identity authority that adopts the call's ids.
	 * @returns The request as the dispatcher sees it.
	 */
	const dynamicToolRequest = (
		decoded: DecodedRequestFor<"item/tool/call">,
		envelope: RequestEnvelopeFields,
		identity: IdentityAuthority,
	): DynamicServerRequest => {
		const params = decoded.params;
		if (params.namespace === null) {
			throw new CodexTransportUsageError("dynamic tool namespace is null");
		}
		const registration = options.dynamicDispatchers.get(params.namespace);
		if (!registration) {
			throw new CodexTransportUsageError("no dynamic dispatcher owns the requested namespace");
		}
		const logicalCall = identity.decoder.createLogicalToolCallCorrelation({
			threadId: identity.decoder.adoptThreadId(params.threadId),
			turnId: identity.decoder.adoptTurnId(params.turnId),
			callId: identity.decoder.adoptDynamicToolCallId(params.callId),
			namespace: params.namespace,
			tool: params.tool,
			manifestHash: registration.manifestHash,
		});
		return {
			...envelope,
			method: decoded.method,
			params,
			owner: registration.owner,
			logicalCall,
		};
	};

	/**
	 * Publishes a reverse request under the owner that answers it.
	 * @param decoded The decoded request.
	 * @param rawId The frame's wire id.
	 * @returns The request as listeners see it.
	 */
	const routeServerRequest = (
		decoded: DecodedServerRequest,
		rawId: WireId,
	): TransportServerRequest => {
		const identity = options.identity();
		const requestId = identity.decoder.adoptJsonRpcRequestId(rawId);
		const correlation: WireRequestCorrelation = identity.decoder.createWireRequestCorrelation({
			requestId,
		});
		const envelope: RequestEnvelopeFields = {
			child: correlation.child,
			epoch: correlation.epoch,
			requestId,
			correlation,
		};
		if (decoded.method === "item/tool/call") {
			return dynamicToolRequest(decoded, envelope, identity);
		}
		if (decoded.method === "currentTime/read") {
			return {
				...envelope,
				method: decoded.method,
				params: {
					...decoded.params,
					threadId: identity.decoder.resolveThreadId(decoded.params.threadId),
				},
				owner: "codex-session",
			};
		}
		const owner = plainOwner(decoded.method);
		if (owner === undefined) {
			throw new CodexTransportUsageError("no response owner exists for the reverse method");
		}
		return plainOwnedRequest(decoded, envelope, owner);
	};

	/**
	 * Whether a dynamic tool call names a namespace no dispatcher registered.
	 * @param error What routing threw.
	 * @param dynamicParams The call's params, when the request was a dynamic tool call.
	 * @returns True for an unregistered namespace.
	 */
	const missingDispatcher = (
		error: unknown,
		dynamicParams: ServerRequestPayloads["item/tool/call"] | undefined,
	): boolean =>
		error instanceof CodexTransportUsageError &&
		dynamicParams !== undefined &&
		dynamicParams.namespace !== null &&
		!options.dynamicDispatchers.has(dynamicParams.namespace);

	/**
	 * Classifies a routing failure as a missing dispatcher, invalid dynamic params, or an
	 * identity the child epoch does not own.
	 * @param error What routing threw.
	 * @param decoded The decoded request.
	 * @returns The refusal.
	 */
	const routingRefusal = (error: unknown, decoded: DecodedServerRequest): ReverseRefusal => {
		const dynamicParams = decoded.method === "item/tool/call" ? decoded.params : undefined;
		if (missingDispatcher(error, dynamicParams)) {
			return refusal(
				"unsupported-server-request",
				"The reverse request has no registered dispatcher",
				JSON_RPC_ERROR_CODES.methodNotFound,
				REVERSE_ERROR_MESSAGES.methodNotFound,
			);
		}
		if (dynamicParams?.namespace === null) {
			return INVALID_PARAMS_REFUSAL;
		}
		return refusal(
			"correlation-mismatch",
			"The reverse request identity is invalid",
			JSON_RPC_ERROR_CODES.invalidParams,
			REVERSE_ERROR_MESSAGES.invalidParams,
		);
	};

	/**
	 * Validates a reverse frame's envelope: a fresh id, a supported method, and no foreign keys.
	 * @param value The decoded frame.
	 * @param key The wire key.
	 * @returns The admitted method, or the refusal.
	 */
	const admitEnvelope = (
		value: Record<string, unknown>,
		key: string,
	): ReverseAdmission | ReverseRefusal => {
		if (options.reverseRequests.has(key) || options.completedReverseIds.has(key)) {
			return {
				kind: "refused",
				issue: "duplicate-server-request",
				detail: "A reverse request id was already used",
			};
		}
		const method = value["method"];
		if (typeof method !== "string") {
			return refusal(
				"malformed-frame",
				"A reverse request method is missing or invalid",
				JSON_RPC_ERROR_CODES.invalidRequest,
				REVERSE_ERROR_MESSAGES.invalidRequest,
			);
		}
		if (!hasOnlyEnvelopeKeys(value)) {
			return refusal(
				"malformed-frame",
				"A reverse request has invalid envelope fields",
				JSON_RPC_ERROR_CODES.invalidRequest,
				REVERSE_ERROR_MESSAGES.invalidRequest,
			);
		}
		if (!isSupportedServerRequestMethod(method)) {
			return refusal(
				"unsupported-server-request",
				"The reverse request method is not supported",
				JSON_RPC_ERROR_CODES.methodNotFound,
				REVERSE_ERROR_MESSAGES.methodNotFound,
			);
		}
		return { kind: "admitted", method };
	};

	/**
	 * Whether accepting another reverse request would exceed the pending count or byte bound.
	 * @param frameBytes The frame's size.
	 * @returns True when the request must be refused as overloaded.
	 */
	const reverseCapacityFull = (frameBytes: number): boolean =>
		options.reverseRequests.size >= CODEX_APP_SERVER_CAPACITY.outbound.pendingReverseRequests ||
		options.pendingReverseBytes.get() + frameBytes >
			CODEX_APP_SERVER_CAPACITY.outbound.pendingReverseBytes;

	/**
	 * Checks that a reverse frame carries params and that capacity remains for it.
	 * @param value The decoded frame.
	 * @param frameBytes The frame's size.
	 * @returns The refusal, or undefined when the request may proceed.
	 */
	const admitParams = (
		value: Record<string, unknown>,
		frameBytes: number,
	): ReverseRefusal | undefined => {
		if (!hasOwn(value, "params")) {
			return refusal(
				"malformed-frame",
				"A reverse request has no params field",
				JSON_RPC_ERROR_CODES.invalidParams,
				REVERSE_ERROR_MESSAGES.invalidParams,
			);
		}
		if (reverseCapacityFull(frameBytes)) {
			return refusal(
				"unsupported-server-request",
				"The reverse-request capacity is full",
				OVERLOADED_CODE,
				REVERSE_ERROR_MESSAGES.overloaded,
			);
		}
		return undefined;
	};

	/**
	 * Decodes a reverse request with the generated decoder, keeping disabled-capability
	 * requests decodable so the session owner can answer them.
	 * @param value The decoded frame.
	 * @param method The admitted method.
	 * @param rawId The frame's wire id.
	 * @returns The decoded request, or undefined when its params are invalid.
	 */
	const decodeReverseRequest = (
		value: Record<string, unknown>,
		method: ServerRequestMethod,
		rawId: WireId,
	): DecodedServerRequest | undefined => {
		try {
			return decodeServerRequest(value);
		} catch (error) {
			if (!isDisabledCapabilityError(error)) {
				return undefined;
			}
			return decodeDisabledCapabilityRequest(value, method, rawId);
		}
	};

	/**
	 * Routes a decoded reverse request, refusing it when routing fails.
	 * @param decoded The decoded request.
	 * @param rawId The frame's wire id.
	 * @returns The frozen request, or undefined after a refusal.
	 */
	const routeOrRefuse = (
		decoded: DecodedServerRequest,
		rawId: WireId,
	): TransportServerRequest | undefined => {
		try {
			return cloneAndFreeze(routeServerRequest(decoded, rawId));
		} catch (error) {
			refuse(rawId, routingRefusal(error, decoded));
			return undefined;
		}
	};

	/**
	 * Records a reverse request as pending and publishes it; an unhandled request is
	 * released and answered with an internal error.
	 * @param key The wire key.
	 * @param rawId The frame's wire id.
	 * @param request The frozen request.
	 * @param frameBytes The frame's size, charged against pending bytes.
	 */
	const deliverReverseRequest = (
		key: string,
		rawId: WireId,
		request: TransportServerRequest,
		frameBytes: number,
	): void => {
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

	/**
	 * Admits, decodes, routes and publishes a reverse request frame.
	 * @param value The decoded frame.
	 * @param frameBytes The frame's size.
	 */
	const handleServerRequest = (value: Record<string, unknown>, frameBytes: number): void => {
		const rawId = value["id"];
		if (!isWireId(rawId)) {
			issueReverse("malformed-frame", "A reverse request id is invalid");
			return;
		}
		const key = wireKey(rawId);
		const admission = admitEnvelope(value, key);
		if (admission.kind === "refused") {
			refuse(rawId, admission);
			return;
		}
		const paramsRefusal = admitParams(value, frameBytes);
		if (paramsRefusal) {
			refuse(rawId, paramsRefusal);
			return;
		}
		const decoded = decodeReverseRequest(value, admission.method, rawId);
		if (decoded === undefined) {
			refuse(rawId, INVALID_PARAMS_REFUSAL);
			return;
		}
		const request = routeOrRefuse(decoded, rawId);
		if (request !== undefined) {
			deliverReverseRequest(key, rawId, request, frameBytes);
		}
	};

	/**
	 * Publishes a server notification with the child epoch's correlation.
	 * @param value The decoded frame.
	 */
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

	/**
	 * The pending request a duplicate-key response frame was addressed to, if any.
	 * @param error The decode failure.
	 * @returns The pending request, or undefined for reverse frames and unknown ids.
	 */
	const pendingForDuplicateKey = (error: JsonFrameDecodeError): PendingRequest | undefined => {
		if (error.wireId === undefined || error.methodPresent) {
			return undefined;
		}
		return options.pendingRequests.get(wireKey(error.wireId));
	};

	/**
	 * Describes a duplicate-key frame by the direction its top-level keys suggest.
	 * @param error The decode failure.
	 * @param pending The pending request it answered, if any.
	 * @returns The issue.
	 */
	const duplicateKeyIssue = (
		error: JsonFrameDecodeError,
		pending: PendingRequest | undefined,
	): TransportIssue => {
		const reverseDuplicate = error.methodPresent && error.wireId !== undefined;
		return {
			kind: "duplicate-key",
			direction: pending ? "response" : reverseDuplicate ? "server-request" : "stdout",
			detail: "A JSON object contains a duplicate key",
			...(pending === undefined ? {} : { method: pending.method }),
			...(error.wireId === undefined ? {} : { requestId: error.wireId }),
		};
	};

	/**
	 * Reports a duplicate-key frame: a response fails its request, a reverse request is answered.
	 * @param error The decode failure.
	 * @param state Whether the transport is open or closing.
	 */
	const reportDuplicateKey = (error: JsonFrameDecodeError, state: "open" | "closing"): void => {
		const pending = pendingForDuplicateKey(error);
		options.emitIssue(duplicateKeyIssue(error, pending));
		if (pending) {
			options.settleFailure(pending, "malformed-response");
			return;
		}
		if (error.methodPresent && error.wireId !== undefined) {
			refuseForState(error.wireId, state);
		}
	};

	/**
	 * Reports a line that did not decode as strict JSON.
	 * @param error What decoding threw.
	 * @param state Whether the transport is open or closing.
	 */
	const reportDecodeFailure = (error: unknown, state: "open" | "closing"): void => {
		if (error instanceof JsonFrameDecodeError && error.kind === "duplicate-key") {
			reportDuplicateKey(error, state);
			return;
		}
		options.emitIssue({
			kind: "malformed-frame",
			direction: "stdout",
			detail: "A complete stdout line is not valid UTF-8 JSON",
		});
	};

	/**
	 * Decodes a stdout line as one JSON object.
	 * @param line The line bytes.
	 * @param state Whether the transport is open or closing.
	 * @returns The object, or undefined after reporting why the line was unusable.
	 */
	const decodeFrame = (
		line: Buffer,
		state: "open" | "closing",
	): Record<string, unknown> | undefined => {
		let decoded: unknown;
		try {
			decoded = parseJsonText(
				new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(line),
			);
		} catch (error) {
			reportDecodeFailure(error, state);
			return undefined;
		}
		if (isRecord(decoded)) {
			return decoded;
		}
		options.emitIssue({
			kind: "unknown-frame",
			direction: "stdout",
			detail: "A JSON frame must be an object",
		});
		return undefined;
	};

	/**
	 * Answers a reverse frame received while closing; responses and notifications are ignored.
	 * @param decoded The decoded frame.
	 */
	const refuseWhileClosing = (decoded: Record<string, unknown>): void => {
		if (!hasOwn(decoded, "method") || !hasOwn(decoded, "id")) {
			return;
		}
		const rawId = decoded["id"];
		if (isWireId(rawId)) {
			protocolError(rawId, JSON_RPC_ERROR_CODES.internalError, SHUTTING_DOWN_MESSAGE);
			return;
		}
		options.emitIssue({
			kind: "malformed-frame",
			direction: "server-request",
			detail: "A closing reverse request id is invalid",
		});
	};

	/**
	 * Routes a frame that has an id but neither a method nor an outcome, by what owns the id.
	 * @param decoded The decoded frame.
	 * @param rawId The frame's wire id.
	 */
	const routeBareId = (decoded: Record<string, unknown>, rawId: WireId): void => {
		const key = wireKey(rawId);
		if (options.pendingRequests.has(key)) {
			handleResponse(decoded);
			return;
		}
		if (options.reverseRequests.has(key) || options.completedReverseIds.has(key)) {
			issueReverse("duplicate-server-request", "A reverse request id was already used", rawId);
			return;
		}
		protocolError(rawId, JSON_RPC_ERROR_CODES.invalidRequest, REVERSE_ERROR_MESSAGES.invalidRequest);
	};

	/**
	 * Routes an open-state frame by its envelope shape.
	 * @param decoded The decoded frame.
	 * @param frameBytes The frame's size.
	 */
	const routeFrame = (decoded: Record<string, unknown>, frameBytes: number): void => {
		if (hasOwn(decoded, "method")) {
			if (hasOwn(decoded, "id")) {
				handleServerRequest(decoded, frameBytes);
			} else {
				handleNotification(decoded);
			}
			return;
		}
		if (!hasOwn(decoded, "id")) {
			options.emitIssue({
				kind: "unknown-frame",
				direction: "stdout",
				detail: "The JSON frame has no known direction",
			});
			return;
		}
		if (carriesOutcome(decoded)) {
			handleResponse(decoded);
			return;
		}
		const rawId = decoded["id"];
		if (isWireId(rawId)) {
			routeBareId(decoded, rawId);
			return;
		}
		options.emitIssue({
			kind: "unknown-frame",
			direction: "stdout",
			detail: "The JSON frame has no known direction",
		});
	};

	/**
	 * Handles one complete stdout line.
	 * @param line The line bytes without the newline.
	 */
	const handleLine = (line: Buffer): void => {
		const state = options.state();
		if (state === "closed") {
			return;
		}
		if (line.byteLength === 0) {
			options.emitIssue({
				kind: "malformed-frame",
				direction: "stdout",
				detail: "An empty stdout line is not JSON",
			});
			return;
		}
		const decoded = decodeFrame(line, state);
		if (decoded === undefined) {
			return;
		}
		if (state === "closing") {
			refuseWhileClosing(decoded);
			return;
		}
		routeFrame(decoded, line.byteLength);
	};

	/**
	 * Registers the dispatcher that answers dynamic tool calls in a namespace.
	 * @param registration The owner, namespace and manifest hash.
	 */
	const registerDynamicDispatcher = (registration: DynamicDispatcherRegistration): void => {
		const owner: string = registration.owner;
		if (!isInList(DYNAMIC_DISPATCHER_OWNERS, owner)) {
			throw new CodexTransportUsageError("a dynamic dispatcher must use an approved dynamic owner");
		}
		boundedText(registration.namespace, "dynamic dispatcher namespace");
		boundedText(registration.manifestHash, "dynamic dispatcher manifestHash");
		if (options.dynamicDispatchers.has(registration.namespace)) {
			throw new CodexTransportUsageError(
				`namespace ${registration.namespace} already has a dynamic owner`,
			);
		}
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

export { type InboundRouterOptions, type InboundRouter, createInboundRouter };
