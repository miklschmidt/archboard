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
import type { IdentityAuthority, WireRequestCorrelation } from "@/shared/codex-workbench-identity";
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

export function createOutboundOperations(options: OutboundOperationsOptions): OutboundOperations {
	const closedError = (): CodexTransportClosedError =>
		new CodexTransportClosedError(options.state() === "closing" ? "shutdown" : "transport-closed");
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

	const request: CodexTransportRequest = <Method extends ResponseMethod>(
		method: Method,
		params: Method extends ClientRequestMethodWithoutParams ? undefined : unknown,
		requestOptions: CodexTransportRequestOptions = {},
	) => {
		if (options.state() !== "open") return Promise.reject(closedError());
		if (!isSupportedResponseMethod(method))
			return Promise.reject(
				new CodexTransportUsageError(`unsupported response method ${String(method)}`),
			);
		const noParams = isClientRequestMethodWithoutParams(method);
		if (noParams ? params !== undefined : !isRecord(params))
			return Promise.reject(
				new CodexTransportUsageError(
					noParams
						? `Codex request ${method} must omit params`
						: "Codex request params must be a JSON object",
				),
			);
		if (options.pendingRequests.size >= CODEX_APP_SERVER_CAPACITY.outbound.pendingRequests)
			return Promise.reject(
				new CodexTransportWriteError(
					"backpressure",
					`pending Codex requests are limited to ${CODEX_APP_SERVER_CAPACITY.outbound.pendingRequests}`,
				),
			);
		const identity = options.identity();
		const wireId = identity.issuer.mintJsonRpcRequestId();
		const rawId = identity.decoder.serializeJsonRpcRequestId(wireId);
		const correlation: WireRequestCorrelation = identity.decoder.createWireRequestCorrelation({
			requestId: wireId,
		});
		let frame: Buffer;
		try {
			frame = jsonLine(
				noParams ? { id: rawId, method } : { id: rawId, method, params },
				`request ${method}`,
			);
		} catch (cause) {
			if (cause instanceof CodexTransportWriteError)
				return Promise.reject(
					new CodexTransportRequestError({
						method,
						correlation,
						outcome: "not_delivered",
						reason: cause.reason,
						accepted: false,
						retryEligible: true,
					}),
				);
			return Promise.reject(cause);
		}
		const key = wireKey(rawId);
		return new Promise<CodexTransportResponse<Method>>((resolve, reject) => {
			const pending: PendingRequest = {
				key,
				wireId,
				method,
				correlation,
				retryEligible: requestOptions.retryEligible === true || requestOptions.idempotent === true,
				resolve: (value) => resolve(value as CodexTransportResponse<Method>),
				reject,
				signal: requestOptions.signal,
				job: undefined,
				accepted: false,
				settled: false,
			};
			const abortListener = (): void => {
				if (pending.settled) return;
				if (pending.job) options.removeQueuedJob(pending.job);
				options.settleFailure(pending, "cancelled");
			};
			pending.abortListener = abortListener;
			options.pendingRequests.set(key, pending);
			if (requestOptions.signal?.aborted) abortListener();
			else requestOptions.signal?.addEventListener("abort", abortListener, { once: true });
			if (pending.settled) return;
			const timeout = (): void => {
				if (pending.job) options.removeQueuedJob(pending.job);
				options.settleFailure(pending, "timeout");
			};
			pending.timer = setTimeout(timeout, CODEX_REQUEST_SETTLEMENT_MS);
			const job: RequestJob = { kind: "request", frame, pending };
			try {
				options.enqueue(job, pending);
			} catch (cause) {
				pending.job = undefined;
				options.settleFailure(
					pending,
					cause instanceof CodexTransportWriteError
						? cause.reason
						: cause instanceof CodexTransportClosedError
							? cause.reason
							: "backpressure",
					cause,
				);
			}
		});
	};

	return Object.freeze({ request, sendNotification });
}
