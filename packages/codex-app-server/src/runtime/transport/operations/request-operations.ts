import { encodeFrame, type EncodingRefusal, type FrameRefusal } from "#runtime/protocol/frames.ts";
import type {
	ClientNotificationMethod,
	ClientRequestMethodWithoutParams,
	ResponseMethod,
} from "#runtime/protocol/protocol-methods.ts";
import { CODEX_APP_SERVER_CAPACITY } from "#shared/constants/app-server-capacity.ts";
import { durationMs } from "@archboard/timing";
import type {
	IdentityAuthority,
	JsonRpcRequestId,
	WireRequestCorrelation,
} from "#shared/rules/workbench-identity.ts";
import {
	CodexTransportClosedError,
	CodexTransportRequestError,
	CodexTransportUsageError,
	CodexTransportWriteError,
	type CodexRequestFailureReason,
} from "#runtime/transport/clients/transport-errors.ts";
import type { FrameWriterJob } from "#runtime/transport/clients/frame-writer.ts";
import type {
	CodexTransportRequest,
	CodexTransportRequestOptions,
	CodexTransportResponse,
} from "#runtime/transport/clients/transport-types.ts";
import type {
	NotificationJob,
	PendingRequest,
	RequestJob,
	WriteJob,
} from "#runtime/transport/clients/transport-internals.ts";
import { encodingError } from "#runtime/transport/operations/frame-lines.ts";

interface OutboundOperationsOptions {
	readonly identity: () => IdentityAuthority;
	readonly state: () => "open" | "closing" | "closed";
	readonly pendingRequests: Map<string, PendingRequest>;
	readonly removeQueuedJob: (job: FrameWriterJob<WriteJob>) => boolean;
	readonly settleFailure: (
		pending: PendingRequest,
		reason: CodexRequestFailureReason,
		cause?: unknown,
	) => void;
	readonly enqueue: (job: WriteJob, pending?: PendingRequest) => FrameWriterJob<WriteJob>;
}

interface OutboundOperations {
	readonly request: CodexTransportRequest;
	readonly sendNotification: (method: ClientNotificationMethod) => Promise<void>;
}

/** What a tracked request needs before its frame is queued. */
interface TrackedRequestInput<Method extends ResponseMethod> {
	readonly method: Method;
	readonly wireId: JsonRpcRequestId;
	readonly key: string;
	readonly correlation: WireRequestCorrelation;
	readonly frame: Buffer;
	readonly requestOptions: CodexTransportRequestOptions;
	readonly resolve: (value: CodexTransportResponse<Method>) => void;
	readonly reject: (reason: unknown) => void;
}

/**
 * Whether the encoder refused a frame for having no JSON line within its bound.
 * @param refusal Why the encoder refused the frame.
 * @returns True for an encoding refusal, false for a refused method or params.
 */
function isEncodingRefusal(refusal: FrameRefusal): refusal is EncodingRefusal {
	return refusal === "unencodable" || refusal === "too-large";
}

/**
 * The usage error for a request whose method or params the protocol refuses.
 * @param method The request method.
 * @param refusal Why the encoder refused the frame.
 * @returns The usage error.
 */
function usageRefusal(
	method: string,
	refusal: Exclude<FrameRefusal, EncodingRefusal>,
): CodexTransportUsageError {
	if (refusal === "unsupported-method")
		return new CodexTransportUsageError(`unsupported response method ${method}`);
	if (refusal === "params-present")
		return new CodexTransportUsageError(`Codex request ${method} must omit params`);
	return new CodexTransportUsageError("Codex request params must be a JSON object");
}

/**
 * The failure reason an enqueue refusal is charged to.
 * @param cause What enqueue threw.
 * @returns The writer's or closed transport's own reason, otherwise backpressure.
 */
function enqueueFailureReason(cause: unknown): CodexRequestFailureReason {
	if (cause instanceof CodexTransportWriteError || cause instanceof CodexTransportClosedError) {
		return cause.reason;
	}
	return "backpressure";
}

/**
 * Turns a frame-encoding failure into the request error the caller sees: an undelivered,
 * retry-eligible settlement when the writer refused the frame, otherwise the cause itself.
 * @param method The request method.
 * @param correlation The request's correlation.
 * @param cause What encoding threw.
 * @returns The rejection reason.
 */
function undeliverableRequest(
	method: ResponseMethod,
	correlation: WireRequestCorrelation,
	cause: unknown,
): unknown {
	if (!(cause instanceof CodexTransportWriteError)) {
		return cause;
	}
	return new CodexTransportRequestError({
		method,
		correlation,
		outcome: "not_delivered",
		reason: cause.reason,
		accepted: false,
		retryEligible: true,
	});
}

/**
 * Creates the client-to-server operations: requests with settlement tracking, and
 * notifications.
 * @param options The transport's identity, state, pending table and write queue.
 * @returns The operations.
 */
export function createOutboundOperations(options: OutboundOperationsOptions): OutboundOperations {
	/**
	 * The closed error for the current state.
	 * @returns A shutdown error while closing, otherwise a transport-closed error.
	 */
	const closedError = (): CodexTransportClosedError =>
		new CodexTransportClosedError(options.state() === "closing" ? "shutdown" : "transport-closed");

	/**
	 * Sends a client notification, which has no response to track.
	 * @param method The notification method.
	 * @returns A promise settled once the frame is written.
	 */
	const sendNotification = (method: ClientNotificationMethod): Promise<void> => {
		if (options.state() !== "open") return Promise.reject(closedError());
		const encoded = encodeFrame(
			{ kind: "notification", method },
			CODEX_APP_SERVER_CAPACITY.frameBytes,
		);
		if (!encoded.ok)
			return Promise.reject(
				encoded.reason === "unsupported-method"
					? new CodexTransportUsageError(`unsupported client notification ${method}`)
					: encodingError(
							encoded.reason,
							"client notification",
							CODEX_APP_SERVER_CAPACITY.frameBytes,
						),
			);
		const frame = encoded.line;
		return new Promise<void>((resolve, reject) => {
			const job: NotificationJob = { kind: "notification", frame, resolve, reject, settled: false };
			try {
				options.enqueue(job);
			} catch (cause) {
				job.settled = true;
				reject(cause);
			}
		});
	};

	/**
	 * Whether another request would exceed the pending-request bound.
	 * @returns The backpressure refusal, or undefined when the request may be queued.
	 */
	const capacityRefusal = (): CodexTransportWriteError | undefined =>
		options.pendingRequests.size >= CODEX_APP_SERVER_CAPACITY.outbound.pendingRequests
			? new CodexTransportWriteError(
					"backpressure",
					`pending Codex requests are limited to ${CODEX_APP_SERVER_CAPACITY.outbound.pendingRequests}`,
				)
			: undefined;

	/**
	 * Cancels a pending request through its abort signal, now or when it fires.
	 * @param pending The tracked request, already in the pending table.
	 */
	const armAbort = (pending: PendingRequest): void => {
		/** Settles the request as cancelled, pulling its frame back if it has not been written. */
		const abortListener = (): void => {
			if (pending.settled) return;
			if (pending.job) options.removeQueuedJob(pending.job);
			options.settleFailure(pending, "cancelled");
		};
		pending.abortListener = abortListener;
		if (pending.signal?.aborted) abortListener();
		else pending.signal?.addEventListener("abort", abortListener, { once: true });
	};

	/**
	 * Registers a request as pending, arms its abort and settlement timer, and queues its frame.
	 * @param input The request's identity, frame and promise callbacks.
	 */
	const trackRequest = <Method extends ResponseMethod>(
		input: TrackedRequestInput<Method>,
	): void => {
		/**
		 * Resolves the caller's promise with the settled response.
		 * @param value The response the transport settled the request with.
		 */
		const resolveResponse = (value: unknown): void => {
			// The transport settles a pending request only with the response decoded for that
			// request's own method, so the value is the response type this method promised.
			// oxlint-disable-next-line typescript/no-unsafe-type-assertion -- settled with this method's own decoded response
			input.resolve(value as CodexTransportResponse<Method>);
		};
		const pending: PendingRequest = {
			key: input.key,
			wireId: input.wireId,
			method: input.method,
			correlation: input.correlation,
			retryEligible:
				input.requestOptions.retryEligible === true || input.requestOptions.idempotent === true,
			resolve: resolveResponse,
			reject: input.reject,
			signal: input.requestOptions.signal,
			job: undefined,
			accepted: false,
			settled: false,
		};
		options.pendingRequests.set(pending.key, pending);
		armAbort(pending);
		if (pending.settled) return;
		/** Settles the request as timed out, pulling its frame back if it has not been written. */
		const timeout = (): void => {
			if (pending.job) options.removeQueuedJob(pending.job);
			options.settleFailure(pending, "timeout");
		};
		pending.timer = setTimeout(timeout, durationMs("codexSession.requestSettlement"));
		const job: RequestJob = { kind: "request", frame: input.frame, pending };
		try {
			options.enqueue(job, pending);
		} catch (cause) {
			pending.job = undefined;
			options.settleFailure(pending, enqueueFailureReason(cause), cause);
		}
	};

	/**
	 * Sends a request and resolves with its decoded response.
	 * @param method The request method.
	 * @param params The params, or undefined for methods that take none.
	 * @param requestOptions Cancellation and retry metadata.
	 * @returns The response, or a rejection naming the settlement.
	 */
	const request: CodexTransportRequest = <Method extends ResponseMethod>(
		method: Method,
		params: Method extends ClientRequestMethodWithoutParams ? undefined : unknown,
		requestOptions: CodexTransportRequestOptions = {},
	) => {
		if (options.state() !== "open") return Promise.reject(closedError());
		const backpressure = capacityRefusal();
		if (backpressure) return Promise.reject(backpressure);
		const identity = options.identity();
		const wireId = identity.issuer.mintJsonRpcRequestId();
		const encoded = encodeFrame(
			{
				kind: "request",
				id: identity.decoder.serializeJsonRpcRequestId(wireId),
				method,
				params,
			},
			CODEX_APP_SERVER_CAPACITY.frameBytes,
		);
		const correlation: WireRequestCorrelation = identity.decoder.createWireRequestCorrelation({
			requestId: wireId,
		});
		if (!encoded.ok) {
			const reason = encoded.reason;
			if (!isEncodingRefusal(reason)) return Promise.reject(usageRefusal(method, reason));
			const cause = encodingError(
				reason,
				`request ${method}`,
				CODEX_APP_SERVER_CAPACITY.frameBytes,
			);
			return Promise.reject(undeliverableRequest(method, correlation, cause));
		}
		const { line: frame, key } = encoded;
		return new Promise<CodexTransportResponse<Method>>((resolve, reject) => {
			trackRequest({ method, wireId, key, correlation, frame, requestOptions, resolve, reject });
		});
	};

	return Object.freeze({ request, sendNotification });
}
