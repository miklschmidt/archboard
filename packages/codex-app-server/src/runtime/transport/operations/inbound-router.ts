import {
	decodeFrame,
	decodeFrameBody,
	type BareIdFrame,
	type DuplicateKeyFrame,
	type InboundFrame,
	type JsonRpcErrorKind,
	type NotificationFrame,
	type ResponseFrame,
	type WireId,
} from "#runtime/protocol/frames.ts";
import { CODEX_APP_SERVER_CAPACITY } from "#shared/constants/app-server-capacity.ts";
import type { IdentityAuthority } from "#shared/rules/workbench-identity.ts";
import {
	CodexTransportUsageError,
	type CodexRemoteError,
	type CodexRequestFailureReason,
} from "#runtime/transport/clients/transport-errors.ts";
import type { ReverseByteAccounting } from "#runtime/transport/operations/reverse-ledger.ts";
import { createReverseResponder } from "#runtime/transport/operations/reverse-responder.ts";
import {
	createReverseRequestRouter,
	REVERSE_ERROR_MESSAGES,
} from "#runtime/transport/operations/reverse-request-router.ts";
import type {
	DynamicDispatcherRegistration,
	ResponseOwner,
	ReverseResponse,
	TransportIssue,
	TransportServerNotification,
	TransportServerRequest,
} from "#runtime/transport/clients/transport-types.ts";
import type {
	PendingRequest,
	RequestTombstone,
	ReverseRecord,
	WriteJob,
} from "#runtime/transport/clients/transport-internals.ts";
import { isDynamicDispatcherOwner } from "#runtime/transport/clients/transport-types.ts";
import { cloneAndFreeze } from "#runtime/transport/operations/public-values.ts";

const SHUTTING_DOWN_MESSAGE = "Codex transport is shutting down.";

type OpenState = "open" | "closing";

/** A frame that is one JSON object with a known envelope class. */
type RoutableFrame = Exclude<
	InboundFrame,
	{ readonly kind: "empty" | "malformed" | "duplicate-key" | "not-object" }
>;

interface InboundRouterOptions {
	readonly identity: IdentityAuthority;
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
	readonly retainLateResponse: (tombstone: RequestTombstone, frame: ResponseFrame) => void;
	readonly retainCompletedReverseId: (key: string) => void;
	readonly enqueue: (job: WriteJob, lane?: "regular" | "response") => void;
	readonly enqueueProtocolError: (
		wireId: WireId,
		code: JsonRpcErrorKind,
		message: string,
	) => boolean;
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
 * Refuses a caller-supplied label that is empty, padded, oversized or contains NUL.
 * @param value The candidate label.
 * @param field What the label names, for the refusal message.
 */
function boundedText(value: unknown, field: string): asserts value is string {
	if (
		typeof value !== "string" ||
		value.length === 0 ||
		value.length > CODEX_APP_SERVER_CAPACITY.text.maxChars ||
		value.trim() !== value ||
		value.includes("\0")
	)
		throw new CodexTransportUsageError(`${field} must be a non-empty bounded string`);
}

/**
 * Describes a duplicate-key frame by the direction its top-level keys suggest.
 * @param frame The duplicate-key frame.
 * @param pending The pending request it answered, if any.
 * @returns The issue.
 */
function duplicateKeyIssue(
	frame: DuplicateKeyFrame,
	pending: PendingRequest | undefined,
): TransportIssue {
	const reverseDuplicate = frame.methodPresent && frame.id !== undefined;
	return {
		kind: "duplicate-key",
		direction: pending ? "response" : reverseDuplicate ? "server-request" : "stdout",
		detail: "A JSON object contains a duplicate key",
		...(pending === undefined ? {} : { method: pending.method }),
		...(frame.id === undefined ? {} : { requestId: frame.id }),
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
	const protocolError = (rawId: WireId, code: JsonRpcErrorKind, message: string): void => {
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
			protocolError(rawId, "internalError", SHUTTING_DOWN_MESSAGE);
		} else {
			protocolError(rawId, "invalidRequest", REVERSE_ERROR_MESSAGES.invalidRequest);
		}
	};

	/**
	 * Retains a response for a settled request, or reports one nothing owns.
	 * @param key The wire key.
	 * @param rawId The frame's wire id.
	 * @param frame The response frame.
	 */
	const retainOrReportLateResponse = (key: string, rawId: WireId, frame: ResponseFrame): void => {
		const tombstone = options.tombstones.get(key);
		if (tombstone) {
			options.retainLateResponse(tombstone, frame);
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
	 * Settles a request from its decoded response, unless settling it throws.
	 * @param pending The pending request.
	 * @param frame The response frame, already known to carry one outcome.
	 * @returns False when the response did not decode or could not settle the request.
	 */
	const settleDecoded = (pending: PendingRequest, frame: ResponseFrame): boolean => {
		const body = decodeFrameBody(frame, pending.method);
		if (!body.ok) return false;
		try {
			if (body.value.outcome === "result") options.settleDelivered(pending, body.value.result);
			else options.settleRemoteError(pending, body.value.error);
			return true;
		} catch {
			return false;
		}
	};

	/**
	 * Settles a pending request from its response frame.
	 * @param pending The pending request.
	 * @param rawId The frame's wire id.
	 * @param frame The response frame, or a bare id that names the request and carries no outcome.
	 */
	const settleResponse = (
		pending: PendingRequest,
		rawId: WireId,
		frame: ResponseFrame | BareIdFrame,
	): void => {
		if (frame.kind === "bare-id" || frame.outcome === "malformed") {
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
		if (settleDecoded(pending, frame)) return;
		options.emitIssue({
			kind: "malformed-frame",
			direction: "response",
			method: pending.method,
			requestId: rawId,
			detail: "The response failed the generated Codex decoder",
		});
		options.settleFailure(pending, "malformed-response");
	};

	/**
	 * Routes a response frame to its pending request or the late-response log.
	 * @param frame The response frame.
	 */
	const handleResponse = (frame: ResponseFrame): void => {
		if (frame.id === undefined) {
			options.emitIssue({
				kind: "malformed-frame",
				direction: "response",
				detail: "A response id must be a non-empty string or safe integer",
			});
			return;
		}
		const pending = options.pendingRequests.get(frame.key);
		if (!pending) {
			retainOrReportLateResponse(frame.key, frame.id, frame);
			return;
		}
		settleResponse(pending, frame.id, frame);
	};

	/**
	 * Publishes a decoded server notification with the child epoch's correlation.
	 * @param frame The notification frame.
	 * @returns False when the notification did not decode or could not be published.
	 */
	const publishNotification = (frame: NotificationFrame): boolean => {
		const body = decodeFrameBody(frame);
		if (!body.ok) return false;
		try {
			const notification = cloneAndFreeze(body.value);
			const correlation = Object.freeze({
				child: options.identity.validator.childId,
				epoch: options.identity.validator.epoch,
				requestId: null,
			});
			options.emitServerNotification(Object.freeze({ correlation, notification }));
			return true;
		} catch {
			return false;
		}
	};

	/**
	 * Publishes a server notification, or reports one that does not decode.
	 * @param frame The notification frame.
	 */
	const handleNotification = (frame: NotificationFrame): void => {
		if (publishNotification(frame)) return;
		options.emitIssue({
			kind: "malformed-frame",
			direction: "notification",
			detail: "The server notification failed the generated Codex decoder",
		});
	};

	/**
	 * Reports a duplicate-key frame: a response fails its request, a reverse request is answered.
	 * @param frame The duplicate-key frame.
	 * @param state Whether the transport is open or closing.
	 */
	const reportDuplicateKey = (frame: DuplicateKeyFrame, state: OpenState): void => {
		const pending =
			frame.key === undefined || frame.methodPresent
				? undefined
				: options.pendingRequests.get(frame.key);
		options.emitIssue(duplicateKeyIssue(frame, pending));
		if (pending) {
			options.settleFailure(pending, "malformed-response");
			return;
		}
		if (frame.methodPresent && frame.id !== undefined) {
			refuseForState(frame.id, state);
		}
	};

	/**
	 * Reports a line that is not one JSON object.
	 * @param frame The frame.
	 * @param state Whether the transport is open or closing.
	 * @returns True when the frame was reported, false when it is an object to route.
	 */
	const reportUnusable = (
		frame: InboundFrame,
		state: OpenState,
	): frame is Exclude<InboundFrame, RoutableFrame> => {
		switch (frame.kind) {
			case "empty":
				options.emitIssue({
					kind: "malformed-frame",
					direction: "stdout",
					detail: "An empty stdout line is not JSON",
				});
				return true;
			case "malformed":
				options.emitIssue({
					kind: "malformed-frame",
					direction: "stdout",
					detail: "A complete stdout line is not valid UTF-8 JSON",
				});
				return true;
			case "duplicate-key":
				reportDuplicateKey(frame, state);
				return true;
			case "not-object":
				options.emitIssue({
					kind: "unknown-frame",
					direction: "stdout",
					detail: "A JSON frame must be an object",
				});
				return true;
			default:
				return false;
		}
	};

	/**
	 * Answers a reverse frame received while closing; responses and notifications are ignored.
	 * @param frame The frame.
	 */
	const refuseWhileClosing = (frame: RoutableFrame): void => {
		if (frame.kind !== "request") {
			return;
		}
		if (frame.id !== undefined) {
			protocolError(frame.id, "internalError", SHUTTING_DOWN_MESSAGE);
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
	 * @param frame The bare-id frame.
	 */
	const routeBareId = (frame: BareIdFrame): void => {
		const pending = options.pendingRequests.get(frame.key);
		if (pending) {
			settleResponse(pending, frame.id, frame);
			return;
		}
		if (options.reverseRequests.has(frame.key) || options.completedReverseIds.has(frame.key)) {
			issueReverse("duplicate-server-request", "A reverse request id was already used", frame.id);
			return;
		}
		protocolError(frame.id, "invalidRequest", REVERSE_ERROR_MESSAGES.invalidRequest);
	};

	/**
	 * Routes an open-state frame by its envelope class.
	 * @param frame The frame.
	 * @param frameBytes The frame's size.
	 */
	const routeFrame = (frame: RoutableFrame, frameBytes: number): void => {
		switch (frame.kind) {
			case "request":
				reverseRouter.handleServerRequest(frame, frameBytes);
				return;
			case "notification":
				handleNotification(frame);
				return;
			case "response":
				handleResponse(frame);
				return;
			case "bare-id":
				routeBareId(frame);
				return;
			case "unknown":
				options.emitIssue({
					kind: "unknown-frame",
					direction: "stdout",
					detail: "The JSON frame has no known direction",
				});
		}
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
		const frame = decodeFrame(line);
		if (reportUnusable(frame, state)) {
			return;
		}
		if (state === "closing") {
			refuseWhileClosing(frame);
			return;
		}
		routeFrame(frame, line.byteLength);
	};

	/**
	 * Registers the dispatcher that answers dynamic tool calls in a namespace.
	 * @param registration The owner, namespace and manifest hash.
	 */
	const registerDynamicDispatcher = (registration: DynamicDispatcherRegistration): void => {
		const owner: string = registration.owner;
		if (!isDynamicDispatcherOwner(owner)) {
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

export { createInboundRouter };
