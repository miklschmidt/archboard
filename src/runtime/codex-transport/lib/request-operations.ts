import {
	isSupportedClientNotificationMethod,
	isSupportedResponseMethod,
	type ClientNotificationMethod,
	type ResponseMethod,
} from "../../codex-protocol/index.js";
import { CODEX_REQUEST_SETTLEMENT_MS } from "../../../shared/timing/timing.js";
import type {
	IdentityAuthority,
	WireRequestCorrelation,
} from "../../../shared/codex-workbench-identity/index.js";
import {
	CodexTransportClosedError,
	CodexTransportUsageError,
	CodexTransportWriteError,
	type CodexRequestFailureReason,
} from "./errors.js";
import type { FrameWriterJob } from "./frame-writer.js";
import type { CodexTransportRequestOptions, CodexTransportResponse } from "./types.js";
import type { NotificationJob, PendingRequest, RequestJob, WriteJob } from "./internals.js";
import { isRecord, jsonLine, wireKey } from "./wire.js";

export interface OutboundOperationsOptions {
	readonly identity: IdentityAuthority;
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
	readonly request: <Method extends ResponseMethod>(
		method: Method,
		params: unknown,
		requestOptions?: CodexTransportRequestOptions,
	) => Promise<CodexTransportResponse<Method>>;
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

	const request = <Method extends ResponseMethod>(
		method: Method,
		params: unknown,
		requestOptions: CodexTransportRequestOptions = {},
	): Promise<CodexTransportResponse<Method>> => {
		if (options.state() !== "open") return Promise.reject(closedError());
		if (!isSupportedResponseMethod(method))
			return Promise.reject(
				new CodexTransportUsageError(`unsupported response method ${String(method)}`),
			);
		if (!isRecord(params))
			return Promise.reject(
				new CodexTransportUsageError("Codex request params must be a JSON object"),
			);
		const wireId = options.identity.issuer.mintJsonRpcRequestId();
		const rawId = options.identity.decoder.serializeCodexIdentity(wireId);
		const correlation: WireRequestCorrelation =
			options.identity.decoder.createWireRequestCorrelation({ requestId: wireId });
		let frame: Buffer;
		try {
			frame = jsonLine({ id: rawId, method, params }, `request ${method}`);
		} catch (cause) {
			return Promise.reject(cause);
		}
		const key = wireKey(rawId);
		return new Promise<CodexTransportResponse<Method>>((resolve, reject) => {
			const pending: PendingRequest = {
				key,
				wireId,
				method,
				correlation,
				idempotent: requestOptions.idempotent === true,
				resolve: (value) => resolve(value as CodexTransportResponse<Method>),
				reject,
				signal: requestOptions.signal,
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
					cause instanceof CodexTransportWriteError ? cause.reason : "backpressure",
					cause,
				);
			}
		});
	};

	return Object.freeze({ request, sendNotification });
}
