import {
	isSupportedClientNotificationMethod,
	isClientRequestMethodWithoutParams,
	isSupportedResponseMethod,
	type ClientNotificationMethod,
	type ClientRequestMethodWithoutParams,
	type ResponseMethod,
} from "@/runtime/codex-protocol";
import { CODEX_APP_SERVER_CAPACITY } from "@/shared/codex-app-server-capacity";
import { CODEX_REQUEST_SETTLEMENT_MS } from "@/shared/timing/timing";
import type {
	IdentityAuthority,
	JsonRpcRequestId,
	WireRequestCorrelation,
} from "@/shared/codex-workbench-identity";
import {
	CodexTransportClosedError,
	CodexTransportRequestError,
	CodexTransportUsageError,
	CodexTransportWriteError,
	type CodexRequestFailureReason,
} from "@/runtime/codex-transport/lib/errors";
import type { FrameWriterJob } from "@/runtime/codex-transport/lib/frame-writer";
import type {
	CodexTransportRequest,
	CodexTransportRequestOptions,
	CodexTransportResponse,
} from "@/runtime/codex-transport/lib/types";
import type {
	NotificationJob,
	PendingRequest,
	RequestJob,
	WriteJob,
} from "@/runtime/codex-transport/lib/internals";
import { isRecord, jsonLine, wireKey } from "@/runtime/codex-transport/lib/wire";

export interface OutboundOperationsOptions {
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

export interface OutboundOperations {
	readonly request: CodexTransportRequest;
	readonly sendNotification: (method: ClientNotificationMethod) => Promise<void>;
}

/** What a tracked request needs before its frame is queued. */
interface TrackedRequestInput<Method extends ResponseMethod> {
	readonly method: Method;
	readonly wireId: JsonRpcRequestId;
	readonly correlation: WireRequestCorrelation;
	readonly frame: Buffer;
	readonly requestOptions: CodexTransportRequestOptions;
	readonly resolve: (value: CodexTransportResponse<Method>) => void;
	readonly reject: (reason: unknown) => void;
}

/**
 * The usage error for params that do not fit the method, if any.
 * @param method The request method.
 * @param params The caller's params.
 * @returns The refusal, or undefined when the params are acceptable.
 */
function paramsRefusal(
	method: ResponseMethod,
	params: unknown,
): CodexTransportUsageError | undefined {
	if (isClientRequestMethodWithoutParams(method)) {
		return params === undefined
			? undefined
			: new CodexTransportUsageError(`Codex request ${method} must omit params`);
	}
	return isRecord(params)
		? undefined
		: new CodexTransportUsageError("Codex request params must be a JSON object");
}

/**
 * Encodes a request frame, omitting params for methods that take none.
 * @param method The request method.
 * @param rawId The serialised JSON-RPC id.
 * @param params The caller's params.
 * @returns The frame bytes.
 */
function requestFrame(method: ResponseMethod, rawId: string | number, params: unknown): Buffer {
	return jsonLine(
		isClientRequestMethodWithoutParams(method)
			? { id: rawId, method }
			: { id: rawId, method, params },
		`request ${method}`,
	);
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
		if (!isSupportedClientNotificationMethod(method))
			return Promise.reject(
				new CodexTransportUsageError(`unsupported client notification ${String(method)}`),
			);
		let frame: Buffer;
		try {
			frame = jsonLine({ method }, "client notification");
		} catch (cause) {
			return Promise.reject(cause);
		}
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
	 * Why a request cannot be sent right now, if anything.
	 * @param method The request method.
	 * @param params The caller's params.
	 * @returns The refusal, or undefined when the request may proceed.
	 */
	const requestRefusal = (method: ResponseMethod, params: unknown): Error | undefined => {
		if (options.state() !== "open") return closedError();
		if (!isSupportedResponseMethod(method))
			return new CodexTransportUsageError(`unsupported response method ${String(method)}`);
		const refusal = paramsRefusal(method, params);
		if (refusal) return refusal;
		if (options.pendingRequests.size >= CODEX_APP_SERVER_CAPACITY.outbound.pendingRequests)
			return new CodexTransportWriteError(
				"backpressure",
				`pending Codex requests are limited to ${CODEX_APP_SERVER_CAPACITY.outbound.pendingRequests}`,
			);
		return undefined;
	};

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
			key: wireKey(options.identity().decoder.serializeJsonRpcRequestId(input.wireId)),
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
		pending.timer = setTimeout(timeout, CODEX_REQUEST_SETTLEMENT_MS);
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
		const refusal = requestRefusal(method, params);
		if (refusal) return Promise.reject(refusal);
		const identity = options.identity();
		const wireId = identity.issuer.mintJsonRpcRequestId();
		const correlation: WireRequestCorrelation = identity.decoder.createWireRequestCorrelation({
			requestId: wireId,
		});
		let frame: Buffer;
		try {
			frame = requestFrame(method, identity.decoder.serializeJsonRpcRequestId(wireId), params);
		} catch (cause) {
			return Promise.reject(undeliverableRequest(method, correlation, cause));
		}
		return new Promise<CodexTransportResponse<Method>>((resolve, reject) => {
			trackRequest({ method, wireId, correlation, frame, requestOptions, resolve, reject });
		});
	};

	return Object.freeze({ request, sendNotification });
}
