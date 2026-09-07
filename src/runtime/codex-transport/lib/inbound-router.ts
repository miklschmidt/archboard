import {
	decodeJsonRpcError,
	decodeResponseEnvelope,
	decodeServerNotification,
	JSON_RPC_ERROR_CODES,
} from "@/runtime/codex-protocol";
import type { IdentityAuthority } from "@/shared/codex-workbench-identity";
import {
	CodexTransportUsageError,
	type CodexRemoteError,
	type CodexRequestFailureReason,
} from "@/runtime/codex-transport/lib/errors";
import type { ReverseByteAccounting } from "@/runtime/codex-transport/lib/reverse-ledger";
import { createReverseResponder } from "@/runtime/codex-transport/lib/reverse-responder";
import {
	createReverseRequestRouter,
	REVERSE_ERROR_MESSAGES,
} from "@/runtime/codex-transport/lib/reverse-request-router";
import type {
	DynamicDispatcherRegistration,
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
	parseJsonText,
	responseKind,
	wireKey,
	type WireId,
} from "@/runtime/codex-transport/lib/wire";
import { DYNAMIC_DISPATCHER_OWNERS } from "@/runtime/codex-transport/lib/types";
import { cloneAndFreeze } from "@/runtime/codex-transport/lib/public-values";

const SHUTTING_DOWN_MESSAGE = "Codex transport is shutting down.";

type OpenState = "open" | "closing";

interface InboundRouterOptions {
	readonly identity: () => IdentityAuthority;
	readonly state: () => "open" | "closing" | "closed";
	readonly pendingRequests: Map<string, PendingRequest>;
	readonly tombstones: Map<string, RequestTombstone>;
	readonly reverseRequests: Map<string, ReverseRecord>;
	readonly completedReverseIds: Set<string>;
	readonly reverseHandles: WeakMap<TransportServerRequest, ReverseRecord>;
	readonly reverseBytes: ReverseByteAccounting;
	readonly dynamicDispatchers: Map<string, DynamicDispatcherRegistration>;
	readonly emitIssue: (issue: TransportIssue) => void;
	readonly emitServerRequest: (request: TransportServerRequest) => boolean;
	readonly emitServerNotification: (event: TransportServerNotification) => void;
	readonly settleFailure: (pending: PendingRequest, reason: CodexRequestFailureReason) => void;
	readonly settleDelivered: (pending: PendingRequest, result: unknown) => void;
	readonly settleRemoteError: (pending: PendingRequest, rpcError: CodexRemoteError) => void;
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
 * Whether a frame carries a result or an error member, however many.
 * @param value The decoded frame.
 * @returns True when either member is present.
 */
function carriesOutcome(value: Record<string, unknown>): boolean {
	return hasOwn(value, "result") || hasOwn(value, "error");
}

/**
 * Describes a duplicate-key frame by the direction its top-level keys suggest.
 * @param error The decode failure.
 * @param pending The pending request it answered, if any.
 * @returns The issue.
 */
function duplicateKeyIssue(
	error: JsonFrameDecodeError,
	pending: PendingRequest | undefined,
): TransportIssue {
	const reverseDuplicate = error.methodPresent && error.wireId !== undefined;
	return {
		kind: "duplicate-key",
		direction: pending ? "response" : reverseDuplicate ? "server-request" : "stdout",
		detail: "A JSON object contains a duplicate key",
		...(pending === undefined ? {} : { method: pending.method }),
		...(error.wireId === undefined ? {} : { requestId: error.wireId }),
	};
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
	 * Answers a reverse frame that cannot be served: as shutting down while closing, otherwise
	 * as an invalid request.
	 * @param rawId The frame's wire id.
	 * @param state Whether the transport is open or closing.
	 */
	const refuseForState = (rawId: WireId, state: OpenState): void => {
		if (state === "closing") {
			protocolError(rawId, JSON_RPC_ERROR_CODES.internalError, SHUTTING_DOWN_MESSAGE);
		} else {
			protocolError(
				rawId,
				JSON_RPC_ERROR_CODES.invalidRequest,
				REVERSE_ERROR_MESSAGES.invalidRequest,
			);
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
	 * Reports a duplicate-key frame: a response fails its request, a reverse request is answered.
	 * @param error The decode failure.
	 * @param state Whether the transport is open or closing.
	 */
	const reportDuplicateKey = (error: JsonFrameDecodeError, state: OpenState): void => {
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
	const reportDecodeFailure = (error: unknown, state: OpenState): void => {
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
	const decodeFrame = (line: Buffer, state: OpenState): Record<string, unknown> | undefined => {
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

	const reverseRouter = createReverseRequestRouter({
		identity: options.identity,
		reverseRequests: options.reverseRequests,
		completedReverseIds: options.completedReverseIds,
		reverseHandles: options.reverseHandles,
		reverseBytes: options.reverseBytes,
		dynamicDispatchers: options.dynamicDispatchers,
		emitServerRequest: options.emitServerRequest,
		issueReverse,
		protocolError,
	});

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
		protocolError(
			rawId,
			JSON_RPC_ERROR_CODES.invalidRequest,
			REVERSE_ERROR_MESSAGES.invalidRequest,
		);
	};

	/**
	 * Routes a frame with a method: a reverse request when it has an id, else a notification.
	 * @param decoded The decoded frame.
	 * @param frameBytes The frame's size.
	 */
	const routeMethodFrame = (decoded: Record<string, unknown>, frameBytes: number): void => {
		if (hasOwn(decoded, "id")) {
			reverseRouter.handleServerRequest(decoded, frameBytes);
		} else {
			handleNotification(decoded);
		}
	};

	/**
	 * Routes an open-state frame by its envelope shape.
	 * @param decoded The decoded frame.
	 * @param frameBytes The frame's size.
	 */
	const routeFrame = (decoded: Record<string, unknown>, frameBytes: number): void => {
		if (hasOwn(decoded, "method")) {
			routeMethodFrame(decoded, frameBytes);
			return;
		}
		const rawId = hasOwn(decoded, "id") ? decoded["id"] : undefined;
		if (rawId !== undefined && carriesOutcome(decoded)) {
			handleResponse(decoded);
			return;
		}
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
		removePendingBytes: options.reverseBytes.removePendingBytes,
		retainCompletedReverseId: options.retainCompletedReverseId,
		enqueue: options.enqueue,
	});

	return Object.freeze({ handleLine, registerDynamicDispatcher, respond: responder.respond });
}

export { type InboundRouterOptions, type InboundRouter, createInboundRouter };
