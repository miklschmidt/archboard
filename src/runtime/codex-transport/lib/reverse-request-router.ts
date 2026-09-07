import {
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
import { CodexTransportUsageError } from "@/runtime/codex-transport/lib/errors";
import type {
	DynamicDispatcherRegistration,
	DynamicServerRequest,
	TransportIssue,
	TransportServerRequest,
} from "@/runtime/codex-transport/lib/types";
import type { ReverseRecord } from "@/runtime/codex-transport/lib/internals";
import type { ReverseByteAccounting } from "@/runtime/codex-transport/lib/reverse-ledger";
import {
	hasOwn,
	isInList,
	isWireId,
	isDisabledCapabilityError,
	wireKey,
	type WireId,
} from "@/runtime/codex-transport/lib/wire";
import {
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
type PlainOwnedRequest = Exclude<
	DecodedServerRequest,
	{ readonly method: "item/tool/call" | "currentTime/read" }
>;

interface ReverseRequestRouterOptions {
	readonly identity: () => IdentityAuthority;
	readonly reverseRequests: Map<string, ReverseRecord>;
	readonly completedReverseIds: Set<string>;
	readonly reverseHandles: WeakMap<TransportServerRequest, ReverseRecord>;
	readonly reverseBytes: ReverseByteAccounting;
	readonly dynamicDispatchers: Map<string, DynamicDispatcherRegistration>;
	readonly emitServerRequest: (request: TransportServerRequest) => boolean;
	readonly issueReverse: (kind: TransportIssue["kind"], detail: string, rawId?: WireId) => void;
	readonly protocolError: (rawId: WireId, code: number, message: string) => void;
}

interface ReverseRequestRouter {
	readonly handleServerRequest: (value: Record<string, unknown>, frameBytes: number) => void;
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

const INVALID_PARAMS_REFUSAL = refusal(
	"malformed-frame",
	"The reverse request params were invalid",
	JSON_RPC_ERROR_CODES.invalidParams,
	REVERSE_ERROR_MESSAGES.invalidParams,
);

const DUPLICATE_ID_REFUSAL: ReverseRefusal = Object.freeze({
	kind: "refused",
	issue: "duplicate-server-request",
	detail: "A reverse request id was already used",
});

/**
 * Whether a frame carries only the JSON-RPC request envelope keys.
 * @param value The decoded frame.
 * @returns True when no foreign key is present.
 */
function hasOnlyEnvelopeKeys(value: Record<string, unknown>): boolean {
	return Object.keys(value).every((keyName) => ENVELOPE_KEYS.includes(keyName));
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
	// oxlint-disable-next-line typescript/no-unsafe-type-assertion -- method and params come from one decoded member
	return {
		...envelope,
		method: decoded.method,
		params: decoded.params,
		owner,
	} as TransportServerRequest;
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
	// oxlint-disable-next-line typescript/no-unsafe-type-assertion -- params parsed by this method's own schema
	return { id: rawId, method, params: parsed.data } as DecodedServerRequest;
}

/**
 * Decodes a reverse request with the generated decoder, keeping disabled-capability
 * requests decodable so the session owner can answer them.
 * @param value The decoded frame.
 * @param method The admitted method.
 * @param rawId The frame's wire id.
 * @returns The decoded request, or undefined when its params are invalid.
 */
function decodeReverseRequest(
	value: Record<string, unknown>,
	method: ServerRequestMethod,
	rawId: WireId,
): DecodedServerRequest | undefined {
	try {
		return decodeServerRequest(value);
	} catch (error) {
		if (!isDisabledCapabilityError(error)) {
			return undefined;
		}
		return decodeDisabledCapabilityRequest(value, method, rawId);
	}
}

/**
 * Validates a reverse frame's envelope beyond its id: a supported method and no foreign keys.
 * @param value The decoded frame.
 * @returns The admitted method, or the refusal.
 */
function admitMethod(value: Record<string, unknown>): ReverseAdmission | ReverseRefusal {
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
}

/**
 * Creates the reverse-request path of the inbound router: admission against the envelope
 * and capacity rules, decoding, owner routing, and delivery to the request listener.
 * @param options The transport's reverse tables, dispatchers and refusal hooks.
 * @returns The router.
 */
function createReverseRequestRouter(options: ReverseRequestRouterOptions): ReverseRequestRouter {
	/**
	 * Raises a refusal's issue and, when it carries one, its protocol error.
	 * @param rawId The refused frame's wire id.
	 * @param refused The refusal.
	 */
	const refuse = (rawId: WireId, refused: ReverseRefusal): void => {
		options.issueReverse(refused.issue, refused.detail, rawId);
		if (refused.code !== undefined && refused.message !== undefined) {
			options.protocolError(rawId, refused.code, refused.message);
		}
	};

	/**
	 * Whether a wire key already names a pending or answered reverse request.
	 * @param key The wire key.
	 * @returns True when the id was already used.
	 */
	const idAlreadyUsed = (key: string): boolean =>
		options.reverseRequests.has(key) || options.completedReverseIds.has(key);

	/**
	 * Whether accepting another reverse request would exceed the pending count or byte bound.
	 * @param frameBytes The frame's size.
	 * @returns True when the request must be refused as overloaded.
	 */
	const reverseCapacityFull = (frameBytes: number): boolean =>
		options.reverseRequests.size >= CODEX_APP_SERVER_CAPACITY.outbound.pendingReverseRequests ||
		options.reverseBytes.pendingBytes() + frameBytes >
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
		options.reverseBytes.addPendingBytes(frameBytes);
		options.reverseHandles.set(request, record);
		const handled = options.emitServerRequest(request);
		if (!handled && !record.responding && options.reverseRequests.get(key) === record) {
			options.reverseRequests.delete(key);
			options.reverseHandles.delete(request);
			options.reverseBytes.removePendingBytes(frameBytes);
			options.issueReverse("unsupported-server-request", REVERSE_ERROR_MESSAGES.unhandled, rawId);
			options.protocolError(
				rawId,
				JSON_RPC_ERROR_CODES.internalError,
				REVERSE_ERROR_MESSAGES.unhandled,
			);
		}
	};

	/**
	 * Decodes, routes and publishes an admitted reverse request.
	 * @param value The decoded frame.
	 * @param key The wire key.
	 * @param rawId The frame's wire id.
	 * @param method The admitted method.
	 * @param frameBytes The frame's size.
	 */
	const acceptServerRequest = (
		value: Record<string, unknown>,
		key: string,
		rawId: WireId,
		method: ServerRequestMethod,
		frameBytes: number,
	): void => {
		const decoded = decodeReverseRequest(value, method, rawId);
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
	 * Admits, decodes, routes and publishes a reverse request frame.
	 * @param value The decoded frame.
	 * @param frameBytes The frame's size.
	 */
	const handleServerRequest = (value: Record<string, unknown>, frameBytes: number): void => {
		const rawId = value["id"];
		if (!isWireId(rawId)) {
			options.issueReverse("malformed-frame", "A reverse request id is invalid");
			return;
		}
		const key = wireKey(rawId);
		if (idAlreadyUsed(key)) {
			refuse(rawId, DUPLICATE_ID_REFUSAL);
			return;
		}
		const admission = admitMethod(value);
		if (admission.kind === "refused") {
			refuse(rawId, admission);
			return;
		}
		const paramsRefusal = admitParams(value, frameBytes);
		if (paramsRefusal) {
			refuse(rawId, paramsRefusal);
			return;
		}
		acceptServerRequest(value, key, rawId, admission.method, frameBytes);
	};

	return Object.freeze({ handleServerRequest });
}

export { createReverseRequestRouter, REVERSE_ERROR_MESSAGES };
export type { ReverseRequestRouter, ReverseRequestRouterOptions };
