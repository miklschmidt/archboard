import type {
	DecodedServerRequest,
	ServerRequestPayloads,
} from "#runtime/protocol/protocol-decoder.ts";
import {
	decodeFrameBody,
	type JsonRpcErrorKind,
	type RequestEnvelopeProblem,
	type RequestFrame,
	type WireId,
} from "#runtime/protocol/frames.ts";
import type { ServerRequestMethod } from "#runtime/protocol/protocol-methods.ts";
import { CODEX_APP_SERVER_CAPACITY } from "#shared/constants/app-server-capacity.ts";
import type {
	IdentityAuthority,
	JsonRpcRequestId,
	WireRequestCorrelation,
} from "#shared/rules/workbench-identity.ts";
import { CodexTransportUsageError } from "#runtime/transport/clients/transport-errors.ts";
import type {
	DynamicDispatcherRegistration,
	DynamicServerRequest,
	TransportIssue,
	TransportServerRequest,
} from "#runtime/transport/clients/transport-types.ts";
import type { ReverseRecord } from "#runtime/transport/clients/transport-internals.ts";
import type { ReverseByteAccounting } from "#runtime/transport/operations/reverse-ledger.ts";
import { plainResponseOwner } from "#runtime/transport/clients/transport-types.ts";
import { cloneAndFreeze } from "#runtime/transport/operations/public-values.ts";

const REVERSE_ERROR_MESSAGES = Object.freeze({
	invalidRequest: "Invalid reverse request.",
	methodNotFound: "Reverse request method was not found.",
	invalidParams: "Reverse request params were invalid.",
	overloaded: "Server overloaded; retry later.",
	unhandled: "No reverse-request handler is available.",
});

/** Why a reverse request was refused, and the protocol error to answer it with, if any. */
interface ReverseRefusal {
	readonly issue: TransportIssue["kind"];
	readonly detail: string;
	readonly code?: JsonRpcErrorKind;
	readonly message?: string;
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
	readonly protocolError: (rawId: WireId, code: JsonRpcErrorKind, message: string) => void;
}

interface ReverseRequestRouter {
	readonly handleServerRequest: (frame: RequestFrame, frameBytes: number) => void;
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
	code: JsonRpcErrorKind,
	message: string,
): ReverseRefusal {
	return { issue, detail, code, message };
}

const INVALID_PARAMS_REFUSAL = refusal(
	"malformed-frame",
	"The reverse request params were invalid",
	"invalidParams",
	REVERSE_ERROR_MESSAGES.invalidParams,
);

const DUPLICATE_ID_REFUSAL: ReverseRefusal = Object.freeze({
	issue: "duplicate-server-request",
	detail: "A reverse request id was already used",
});

/** The refusal each broken envelope rule answers with. */
const ENVELOPE_REFUSALS: Readonly<Record<RequestEnvelopeProblem, ReverseRefusal>> = Object.freeze({
	"method-invalid": refusal(
		"malformed-frame",
		"A reverse request method is missing or invalid",
		"invalidRequest",
		REVERSE_ERROR_MESSAGES.invalidRequest,
	),
	"envelope-fields": refusal(
		"malformed-frame",
		"A reverse request has invalid envelope fields",
		"invalidRequest",
		REVERSE_ERROR_MESSAGES.invalidRequest,
	),
	"unsupported-method": refusal(
		"unsupported-server-request",
		"The reverse request method is not supported",
		"methodNotFound",
		REVERSE_ERROR_MESSAGES.methodNotFound,
	),
	"no-params": refusal(
		"malformed-frame",
		"A reverse request has no params field",
		"invalidParams",
		REVERSE_ERROR_MESSAGES.invalidParams,
	),
});

const OVERLOADED_REFUSAL = refusal(
	"unsupported-server-request",
	"The reverse-request capacity is full",
	"overloaded",
	REVERSE_ERROR_MESSAGES.overloaded,
);

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
		const owner = plainResponseOwner(decoded.method);
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
				"methodNotFound",
				REVERSE_ERROR_MESSAGES.methodNotFound,
			);
		}
		if (dynamicParams?.namespace === null) {
			return INVALID_PARAMS_REFUSAL;
		}
		return refusal(
			"correlation-mismatch",
			"The reverse request identity is invalid",
			"invalidParams",
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
			options.protocolError(rawId, "internalError", REVERSE_ERROR_MESSAGES.unhandled);
		}
	};

	/**
	 * The refusal a reused id, an envelope or the reverse capacity calls for, in that order.
	 * @param frame The request frame.
	 * @param frameBytes The frame's size.
	 * @returns The refusal, or undefined when the request may be decoded.
	 */
	const admissionRefusal = (
		frame: RequestFrame & { readonly key: string },
		frameBytes: number,
	): ReverseRefusal | undefined => {
		if (idAlreadyUsed(frame.key)) return DUPLICATE_ID_REFUSAL;
		if (frame.problem !== undefined) return ENVELOPE_REFUSALS[frame.problem];
		return reverseCapacityFull(frameBytes) ? OVERLOADED_REFUSAL : undefined;
	};

	/**
	 * Admits, decodes, routes and publishes a reverse request frame.
	 * @param frame The request frame.
	 * @param frameBytes The frame's size.
	 */
	const handleServerRequest = (frame: RequestFrame, frameBytes: number): void => {
		if (frame.id === undefined) {
			options.issueReverse("malformed-frame", "A reverse request id is invalid");
			return;
		}
		const rawId = frame.id;
		const refused = admissionRefusal(frame, frameBytes);
		if (refused) {
			refuse(rawId, refused);
			return;
		}
		const decoded = decodeFrameBody(frame);
		if (!decoded.ok) {
			refuse(rawId, INVALID_PARAMS_REFUSAL);
			return;
		}
		const request = routeOrRefuse(decoded.value, rawId);
		if (request !== undefined) {
			deliverReverseRequest(frame.key, rawId, request, frameBytes);
		}
	};

	return Object.freeze({ handleServerRequest });
}

export { createReverseRequestRouter, REVERSE_ERROR_MESSAGES };
