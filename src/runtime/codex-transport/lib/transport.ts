import { CODEX_COMPOSED_SHUTDOWN_MS } from "../../../shared/timing/timing.js";
import type { IdentityAuthority } from "../../../shared/codex-workbench-identity/index.js";
import {
	CodexTransportClosedError,
	CodexTransportRemoteError,
	CodexTransportRequestError,
	CodexTransportWriteError,
	type CodexRequestFailureReason,
} from "./errors.js";
import {
	CODEX_TRANSPORT_MAX_QUEUED_BYTES,
	CODEX_TRANSPORT_MAX_QUEUED_FRAMES,
	CODEX_TRANSPORT_MAX_RETAINED_LATE_RESPONSES,
} from "./limits.js";
import { createFrameWriter, type FrameWriter, type FrameWriterJob } from "./frame-writer.js";
import { createTransportEvents } from "./events.js";
import { createInboundRouter } from "./inbound-router.js";
import { createOutboundOperations } from "./request-operations.js";
import { attachCodexStreamReader } from "./stream-reader.js";
import type {
	CodexTransport,
	CodexTransportChild,
	CodexTransportOptions,
	DynamicDispatcherRegistration,
	TransportLateResponse,
	TransportServerRequest,
} from "./types.js";
import type { PendingRequest, RequestTombstone, ReverseRecord, WriteJob } from "./internals.js";

export function createCodexTransport(options: CodexTransportOptions): CodexTransport {
	const child: CodexTransportChild = options.child;
	const identity: IdentityAuthority = options.identity;
	let state: "open" | "closing" | "closed" = "open";
	let inputEndStarted = false;
	let inputFinished = false;
	let shutdownTimer: ReturnType<typeof setTimeout> | undefined;
	let shutdownPromise: Promise<void> | undefined;
	let resolveShutdown: (() => void) | undefined;
	let exitEmitted = false;
	let writer: FrameWriter<WriteJob> | undefined;

	const pendingRequests = new Map<string, PendingRequest>();
	const tombstones = new Map<string, RequestTombstone>();
	const reverseRequests = new Map<string, ReverseRecord>();
	const completedReverseIds = new Set<string>();
	const reverseHandles = new WeakMap<TransportServerRequest, ReverseRecord>();
	const dynamicDispatchers = new Map<string, DynamicDispatcherRegistration>();
	const lateResponses: TransportLateResponse[] = [];
	const events = createTransportEvents();
	const emitIssue = events.emitIssue;
	const emitRequest = events.emitServerRequest;
	const emitNotification = events.emitServerNotification;
	const emitExit = events.emitExit;

	const retainCompletedReverseId = (key: string): void => {
		if (completedReverseIds.size >= CODEX_TRANSPORT_MAX_RETAINED_LATE_RESPONSES) {
			const oldest = completedReverseIds.values().next().value;
			if (oldest !== undefined) completedReverseIds.delete(oldest);
		}
		completedReverseIds.add(key);
	};

	const retainTombstone = (tombstone: RequestTombstone): void => {
		if (tombstones.size >= CODEX_TRANSPORT_MAX_RETAINED_LATE_RESPONSES) {
			const oldest = tombstones.keys().next().value;
			if (oldest !== undefined) tombstones.delete(oldest);
		}
		tombstones.set(tombstone.key, tombstone);
	};

	const removePending = (pending: PendingRequest): boolean => {
		if (pendingRequests.get(pending.key) !== pending) return false;
		pendingRequests.delete(pending.key);
		pending.settled = true;
		if (pending.timer !== undefined) clearTimeout(pending.timer);
		if (pending.signal && pending.abortListener)
			pending.signal.removeEventListener("abort", pending.abortListener);
		return true;
	};

	const settleFailure = (
		pending: PendingRequest,
		reason: CodexRequestFailureReason,
		cause?: unknown,
	): void => {
		if (!removePending(pending)) return;
		const outcome = pending.accepted && !pending.idempotent ? "outcome_unknown" : "not_delivered";
		retainTombstone({
			key: pending.key,
			wireId: pending.wireId,
			method: pending.method,
			correlation: pending.correlation,
			idempotent: pending.idempotent,
			accepted: pending.accepted,
			settlement: outcome,
			reason,
		});
		pending.reject(
			new CodexTransportRequestError({
				method: pending.method,
				correlation: pending.correlation,
				outcome,
				reason,
				accepted: pending.accepted,
				cause,
			}),
		);
	};

	const settleDelivered = (pending: PendingRequest, result: unknown): void => {
		if (!removePending(pending)) return;
		retainTombstone({
			key: pending.key,
			wireId: pending.wireId,
			method: pending.method,
			correlation: pending.correlation,
			idempotent: pending.idempotent,
			accepted: pending.accepted,
			settlement: "delivered",
		});
		pending.resolve({ method: pending.method, correlation: pending.correlation, result });
	};

	const settleRemoteError = (
		pending: PendingRequest,
		rpcError: { readonly code: number; readonly message: string; readonly data?: unknown },
	): void => {
		if (!removePending(pending)) return;
		retainTombstone({
			key: pending.key,
			wireId: pending.wireId,
			method: pending.method,
			correlation: pending.correlation,
			idempotent: pending.idempotent,
			accepted: pending.accepted,
			settlement: "delivered",
		});
		pending.reject(
			new CodexTransportRemoteError({
				method: pending.method,
				correlation: pending.correlation,
				rpcError,
			}),
		);
	};

	const retainLateResponse = (
		tombstone: RequestTombstone,
		value: Record<string, unknown>,
	): void => {
		const hasResult = Object.prototype.hasOwnProperty.call(value, "result");
		const hasError = Object.prototype.hasOwnProperty.call(value, "error");
		const kind = hasResult && !hasError ? "result" : hasError && !hasResult ? "error" : "malformed";
		const late: TransportLateResponse = Object.freeze({
			kind,
			outcome: tombstone.settlement === "delivered" ? "duplicate" : "outcome_unknown",
			method: tombstone.method,
			correlation: tombstone.correlation,
			requestId: tombstone.wireId,
			payload: kind === "result" ? value.result : kind === "error" ? value.error : value,
			settlement: tombstone.settlement,
			reason: tombstone.reason,
		});
		if (lateResponses.length >= CODEX_TRANSPORT_MAX_RETAINED_LATE_RESPONSES) lateResponses.shift();
		lateResponses.push(late);
		emitIssue({
			kind: "duplicate-response",
			direction: "response",
			method: tombstone.method,
			requestId: tombstone.wireId,
			detail: "A response arrived after its request had already settled",
		});
	};

	const removeQueuedJob = (job: FrameWriterJob<WriteJob>): boolean => writer?.remove(job) ?? false;

	const enqueue = (job: WriteJob, pending?: PendingRequest): FrameWriterJob<WriteJob> => {
		if (!writer) throw new CodexTransportClosedError("transport-closed");
		if (state !== "open" && !(state === "closing" && job.kind === "reverse-response"))
			throw new CodexTransportClosedError(state === "closing" ? "shutdown" : "transport-closed");
		const queued: FrameWriterJob<WriteJob> = { frame: job.frame, value: job };
		if (pending) pending.job = queued;
		writer.enqueue(queued);
		return queued;
	};

	const dropQueuedJobs = (reason: unknown, keepReverseResponses: boolean): void => {
		writer?.drop((job) => keepReverseResponses && job.value.kind === "reverse-response", reason);
	};

	const closeTransport = (
		reason: Extract<
			CodexRequestFailureReason,
			"child-exit" | "stdout-error" | "write-error" | "shutdown"
		>,
		cause?: unknown,
	): void => {
		if (state === "closed") return;
		state = "closed";
		if (shutdownTimer !== undefined) clearTimeout(shutdownTimer);
		shutdownTimer = undefined;
		for (const pending of pendingRequests.values()) settleFailure(pending, reason, cause);
		writer?.abort(new CodexTransportClosedError(reason));
		dropQueuedJobs(new CodexTransportClosedError(reason), false);
		for (const record of reverseRequests.values()) reverseHandles.delete(record.request);
		reverseRequests.clear();
		if (resolveShutdown) {
			const resolve = resolveShutdown;
			resolveShutdown = undefined;
			resolve();
		}
	};

	const finishShutdown = (): void => {
		const writerState = writer?.inspect();
		if (state !== "closing" || writerState?.writeInFlight || writerState?.queuedFrames) return;
		if (!inputEndStarted) {
			inputEndStarted = true;
			try {
				child.stdin.end(() => {
					inputFinished = true;
					finishShutdown();
				});
			} catch (cause) {
				emitIssue({
					kind: "write-error",
					direction: "write",
					detail: "Closing Codex stdin threw",
					cause,
				});
				inputFinished = true;
			}
		}
		if (inputFinished && resolveShutdown) {
			const resolve = resolveShutdown;
			resolveShutdown = undefined;
			if (shutdownTimer !== undefined) clearTimeout(shutdownTimer);
			shutdownTimer = undefined;
			state = "closed";
			resolve();
		}
	};

	const inspect = () => {
		const writerState = writer?.inspect();
		return Object.freeze({
			state,
			pendingRequests: pendingRequests.size,
			pendingReverseRequests: reverseRequests.size,
			queuedFrames: writerState?.queuedFrames ?? 0,
			queuedBytes: writerState?.queuedBytes ?? 0,
			writeInFlight: writerState?.writeInFlight ?? false,
			maxQueuedFrames: CODEX_TRANSPORT_MAX_QUEUED_FRAMES,
			maxQueuedBytes: CODEX_TRANSPORT_MAX_QUEUED_BYTES,
		});
	};

	const shutdown = (): Promise<void> => {
		if (state === "closed") return Promise.resolve();
		if (shutdownPromise) return shutdownPromise;
		state = "closing";
		shutdownPromise = new Promise<void>((resolve) => {
			resolveShutdown = resolve;
		});
		for (const pending of pendingRequests.values()) settleFailure(pending, "shutdown");
		for (const record of reverseRequests.values()) {
			reverseHandles.delete(record.request);
			retainCompletedReverseId(record.key);
		}
		reverseRequests.clear();
		dropQueuedJobs(new CodexTransportClosedError("shutdown"), true);
		shutdownTimer = setTimeout(() => {
			emitIssue({
				kind: "shutdown-timeout",
				direction: "write",
				detail: "Codex stdin did not drain before the composed shutdown bound",
			});
			writer?.abort(new CodexTransportClosedError("shutdown"));
			dropQueuedJobs(new CodexTransportClosedError("shutdown"), false);
			state = "closed";
			if (resolveShutdown) {
				const resolve = resolveShutdown;
				resolveShutdown = undefined;
				resolve();
			}
			try {
				child.stdin.destroy();
			} catch {
				// The process owner remains responsible for terminating the child.
			}
		}, CODEX_COMPOSED_SHUTDOWN_MS);
		finishShutdown();
		return shutdownPromise;
	};

	writer = createFrameWriter<WriteJob>(child.stdin, {
		onAccepted: (queued) => {
			if (queued.value.kind === "request") queued.value.pending.accepted = true;
		},
		onComplete: (queued) => {
			const job = queued.value;
			if (job.kind === "request") {
				job.pending.accepted = true;
				job.pending.job = undefined;
			} else if (!job.settled) {
				job.settled = true;
				job.resolve();
			}
			finishShutdown();
		},
		onError: (queued, error, writeReturned) => {
			const job = queued.value;
			emitIssue({
				kind: "write-error",
				direction: "write",
				method: job.kind === "request" ? job.pending.method : undefined,
				detail: "Codex stdin rejected a frame",
				cause: error,
			});
			if (job.kind === "request") {
				job.pending.accepted = writeReturned;
				settleFailure(job.pending, "write-error", error);
			} else if (!job.settled) {
				job.settled = true;
				job.reject(new CodexTransportWriteError("write-error", error.message));
			}
			closeTransport("write-error", error);
		},
		onDrop: (queued, reason) => {
			const job = queued.value;
			if (job.kind === "request") {
				const failureReason =
					reason instanceof CodexTransportWriteError
						? reason.reason
						: reason instanceof CodexTransportClosedError
							? reason.reason
							: "shutdown";
				settleFailure(job.pending, failureReason, reason);
			} else if (!job.settled) {
				job.settled = true;
				job.reject(reason);
			}
		},
		onIdle: finishShutdown,
	});
	const outbound = createOutboundOperations({
		identity,
		state: () => state,
		pendingRequests,
		removeQueuedJob,
		settleFailure,
		enqueue,
	});

	const router = createInboundRouter({
		identity,
		pendingRequests,
		tombstones,
		reverseRequests,
		completedReverseIds,
		reverseHandles,
		dynamicDispatchers,
		emitIssue,
		emitServerRequest: emitRequest,
		emitServerNotification: emitNotification,
		settleFailure,
		settleDelivered,
		settleRemoteError,
		retainLateResponse,
		retainCompletedReverseId,
		enqueue: (job) => enqueue(job),
	});

	const registerDynamicDispatcher = (registration: DynamicDispatcherRegistration): void => {
		if (state !== "open")
			throw new CodexTransportClosedError(state === "closing" ? "shutdown" : "transport-closed");
		router.registerDynamicDispatcher(registration);
	};

	child.stdin.on("error", (cause) => closeTransport("write-error", cause));
	child.stdin.on("finish", () => {
		inputFinished = true;
		finishShutdown();
	});
	attachCodexStreamReader(child.stdout, child.stderr, {
		onLine: router.handleLine,
		onIssue: emitIssue,
		onStdoutError: (cause) => {
			emitIssue({
				kind: "read-error",
				direction: "stdout",
				detail: "Codex stdout emitted an error",
				cause,
			});
			closeTransport("stdout-error", cause);
		},
		onStdoutEnd: () =>
			closeTransport(
				state === "closing" ? "shutdown" : "stdout-error",
				new Error("Codex stdout ended"),
			),
		onStderr: events.emitStderr,
		onStderrError: (cause) =>
			emitIssue({
				kind: "stderr-error",
				direction: "stderr",
				detail: "Codex stderr emitted an error",
				cause,
			}),
	});
	child.on("error", (cause) => {
		emitIssue({
			kind: "read-error",
			direction: "stdout",
			detail: "Codex child emitted an error",
			cause,
		});
		closeTransport("child-exit", cause);
	});
	child.on("exit", (code, signal) => {
		closeTransport("child-exit", new Error(`Codex child exited with code ${String(code)}`));
		if (exitEmitted) return;
		exitEmitted = true;
		emitExit(
			Object.freeze({
				child: identity.validator.childId,
				epoch: identity.validator.epoch,
				code,
				signal,
			}),
		);
	});

	for (const registration of options.dynamicDispatchers ?? [])
		registerDynamicDispatcher(registration);

	return Object.freeze({
		request: outbound.request,
		sendNotification: outbound.sendNotification,
		notify: outbound.sendNotification,
		registerDynamicDispatcher,
		respond: router.respond,
		onServerRequest: events.onServerRequest,
		onServerNotification: events.onServerNotification,
		onIssue: events.onIssue,
		onStderr: events.onStderr,
		onExit: events.onExit,
		inspect,
		inspectLateResponses: () => Object.freeze([...lateResponses]),
		inspectIssues: events.inspectIssues,
		inspectStderr: events.inspectStderr,
		shutdown,
	});
}
