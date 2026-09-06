import { CODEX_APP_SERVER_CAPACITY } from "@/shared/codex-app-server-capacity";
import type { IdentityAuthority } from "@/shared/codex-workbench-identity";
import { CODEX_COMPOSED_SHUTDOWN_MS } from "@/shared/timing/timing";
import {
	CodexTransportClosedError,
	CodexTransportRemoteError,
	CodexTransportRequestError,
	type CodexRequestFailureReason,
} from "@/runtime/codex-transport/lib/errors";
import {
	createFrameWriter,
	type FrameWriter,
	type FrameWriterJob,
} from "@/runtime/codex-transport/lib/frame-writer";
import { createTransportEvents } from "@/runtime/codex-transport/lib/events";
import { createInboundRouter } from "@/runtime/codex-transport/lib/inbound-router";
import { createLateResponseStore } from "@/runtime/codex-transport/lib/late-responses";
import { createOutboundOperations } from "@/runtime/codex-transport/lib/request-operations";
import {
	attachCodexStreamReader,
	type StreamReaderAttachment,
} from "@/runtime/codex-transport/lib/stream-reader";
import { createTransportWriterCallbacks } from "@/runtime/codex-transport/lib/writer-callbacks";
import type {
	CodexTransport,
	CodexTransportChild,
	CodexTransportOptions,
	DynamicDispatcherRegistration,
	TransportServerRequest,
	TransportSnapshot,
} from "@/runtime/codex-transport/lib/types";
import type {
	PendingRequest,
	RequestTombstone,
	ReverseRecord,
	WriteJob,
} from "@/runtime/codex-transport/lib/internals";
import { cloneAndFreeze } from "@/runtime/codex-transport/lib/public-values";
import { jsonLine, wireKey, type WireId } from "@/runtime/codex-transport/lib/wire";

const PROTOCOL_ERROR_MESSAGE = "Codex transport is shutting down.";
const ignoreTerminalStreamError = (_error: Error): void => {};

export function createCodexTransport(options: CodexTransportOptions): CodexTransport {
	const child: CodexTransportChild = options.child;
	let identity: IdentityAuthority = options.identity;
	let state: "open" | "closing" | "closed" = "open";
	let inputEndStarted = false;
	let inputFinished = false;
	let shutdownTimer: ReturnType<typeof setTimeout> | undefined;
	let shutdownPromise: Promise<void> | undefined;
	let resolveShutdown: (() => void) | undefined;
	let shutdownSetupComplete = false;
	let exitEmitted = false;
	let writer: FrameWriter<WriteJob> | undefined;
	let streamAttachment: StreamReaderAttachment | undefined;
	let childListenersAttached = false;
	let stdinListenersAttached = false;
	let terminalErrorSinksAttached = false;
	const isClosed = (): boolean => state === "closed";
	const pendingRequests = new Map<string, PendingRequest>();
	const tombstones = new Map<string, RequestTombstone>();
	const reverseRequests = new Map<string, ReverseRecord>();
	const completedReverseIds = new Set<string>();
	const reverseHandles = new WeakMap<TransportServerRequest, ReverseRecord>();
	const dynamicDispatchers = new Map<string, DynamicDispatcherRegistration>();
	let pendingReverseBytes = 0;
	const events = createTransportEvents();
	const emitIssue = events.emitIssue;
	const lateResponseStore = createLateResponseStore(emitIssue);
	const lateResponses = lateResponseStore.values;
	const retainLateResponse = lateResponseStore.retain;
	const retainCompletedReverseId = (key: string): void => {
		if (completedReverseIds.size >= CODEX_APP_SERVER_CAPACITY.retention.completedReverseIds) {
			const oldest = completedReverseIds.values().next().value;
			if (oldest !== undefined) {
				completedReverseIds.delete(oldest);
			}
		}
		completedReverseIds.add(key);
	};
	const retainTombstone = (tombstone: RequestTombstone): void => {
		if (tombstones.size >= CODEX_APP_SERVER_CAPACITY.retention.requestTombstones) {
			const oldest = tombstones.keys().next().value;
			if (oldest !== undefined) {
				tombstones.delete(oldest);
			}
		}
		tombstones.set(tombstone.key, tombstone);
	};
	const removePending = (pending: PendingRequest): boolean => {
		if (pendingRequests.get(pending.key) !== pending) {
			return false;
		}
		pendingRequests.delete(pending.key);
		pending.settled = true;
		if (pending.timer !== undefined) {
			clearTimeout(pending.timer);
		}
		if (pending.signal && pending.abortListener) {
			pending.signal.removeEventListener("abort", pending.abortListener);
		}
		return true;
	};

	const settleFailure = (pending: PendingRequest, reason: CodexRequestFailureReason): void => {
		if (!removePending(pending)) {
			return;
		}
		const outcome = pending.accepted ? "outcome_unknown" : "not_delivered";
		const retryEligible = outcome === "not_delivered" || pending.retryEligible;
		retainTombstone({
			key: pending.key,
			wireId: pending.wireId,
			method: pending.method,
			correlation: pending.correlation,
			retryEligible,
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
				retryEligible,
			}),
		);
	};

	const settleDelivered = (pending: PendingRequest, result: unknown): void => {
		if (!removePending(pending)) {
			return;
		}
		retainTombstone({
			key: pending.key,
			wireId: pending.wireId,
			method: pending.method,
			correlation: pending.correlation,
			retryEligible: pending.retryEligible,
			accepted: pending.accepted,
			settlement: "delivered",
		});
		pending.resolve(
			Object.freeze({
				method: pending.method,
				correlation: pending.correlation,
				result: cloneAndFreeze(result),
			}),
		);
	};

	const settleRemoteError = (
		pending: PendingRequest,
		rpcError: { readonly code: number; readonly message: string; readonly data?: unknown },
	): void => {
		if (!removePending(pending)) {
			return;
		}
		retainTombstone({
			key: pending.key,
			wireId: pending.wireId,
			method: pending.method,
			correlation: pending.correlation,
			retryEligible: pending.retryEligible,
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
	const removeQueuedJob = (job: FrameWriterJob<WriteJob>): boolean => writer?.remove(job) ?? false;
	const acceptReverseResponse = (record: ReverseRecord): void => {
		if (record.responded || reverseRequests.get(record.key) !== record) {
			return;
		}
		record.responding = false;
		record.responded = true;
		reverseRequests.delete(record.key);
		reverseHandles.delete(record.request);
		pendingReverseBytes = Math.max(0, pendingReverseBytes - record.bytes);
		retainCompletedReverseId(record.key);
	};

	const releaseReverseResponse = (record: ReverseRecord): void => {
		if (record.responded || reverseRequests.get(record.key) !== record) {
			return;
		}
		record.responding = false;
	};
	const enqueue = (job: WriteJob, pending?: PendingRequest, lane?: "regular" | "response") => {
		if (!writer) {
			throw new CodexTransportClosedError("transport-closed");
		}
		const actualLane =
			lane ??
			(job.kind === "reverse-response" || job.kind === "protocol-error" ? "response" : "regular");
		if (state !== "open" && !(state === "closing" && actualLane === "response")) {
			throw new CodexTransportClosedError(state === "closing" ? "shutdown" : "transport-closed");
		}
		const queued: FrameWriterJob<WriteJob> = { frame: job.frame, value: job };
		if (pending) {
			pending.job = queued;
		}
		writer.enqueue(queued, actualLane);
		return queued;
	};

	const enqueueProtocolError = (wireId: WireId, code: number, message: string): boolean => {
		if (state === "closed" || inputEndStarted) {
			return false;
		}
		let frame: Buffer;
		try {
			frame = jsonLine(
				{ id: wireId, error: { code, message } },
				"protocol error",
				CODEX_APP_SERVER_CAPACITY.outbound.maxReverseResponseBytes,
			);
		} catch {
			emitIssue({
				kind: "write-error",
				direction: "write",
				detail: "A protocol error exceeded the response bound",
			});
			return false;
		}
		const key = wireKey(wireId);
		try {
			enqueue({ kind: "protocol-error", frame, key }, undefined, "response");
		} catch {
			emitIssue({
				kind: "write-error",
				direction: "write",
				detail: "The response reserve rejected a protocol error",
			});
			return false;
		}
		if (isClosed()) {
			return false;
		}
		retainCompletedReverseId(key);
		return true;
	};

	const detachInput = (): void => {
		streamAttachment?.dispose();
		streamAttachment = undefined;
		if (childListenersAttached) {
			child.removeListener("error", onChildError);
			child.removeListener("exit", onChildExit);
			childListenersAttached = false;
		}
		if (stdinListenersAttached) {
			child.stdin.removeListener("error", onStdinError);
			child.stdin.removeListener("finish", onStdinFinish);
			stdinListenersAttached = false;
		}
		if (!terminalErrorSinksAttached) {
			child.stdin.on("error", ignoreTerminalStreamError);
			child.stdout.on("error", ignoreTerminalStreamError);
			child.stderr.on("error", ignoreTerminalStreamError);
			child.on("error", ignoreTerminalStreamError);
			terminalErrorSinksAttached = true;
		}
	};

	const clearEpochRetention = (): void => {
		tombstones.clear();
		completedReverseIds.clear();
		dynamicDispatchers.clear();
	};

	const resolveShutdownIfWaiting = (): void => {
		if (!resolveShutdown) {
			return;
		}
		const resolve = resolveShutdown;
		resolveShutdown = undefined;
		if (shutdownTimer !== undefined) {
			clearTimeout(shutdownTimer);
		}
		shutdownTimer = undefined;
		resolve();
	};
	const emitExitOnce = (code: number | null, signal: NodeJS.Signals | null): void => {
		if (exitEmitted) {
			return;
		}
		exitEmitted = true;
		events.emitExit(
			Object.freeze({
				child: identity.validator.childId,
				epoch: identity.validator.epoch,
				code,
				signal,
			}),
		);
	};

	const closeTransport = (
		reason: Extract<
			CodexRequestFailureReason,
			"child-exit" | "stdout-error" | "write-error" | "shutdown" | "frame-too-large"
		>,
		exit?: { readonly code: number | null; readonly signal: NodeJS.Signals | null },
	): void => {
		if (state === "closed") {
			if (exit !== undefined) {
				emitExitOnce(exit.code, exit.signal);
			}
			return;
		}
		state = "closed";
		if (shutdownTimer !== undefined) {
			clearTimeout(shutdownTimer);
		}
		shutdownTimer = undefined;
		detachInput();
		if (reason === "frame-too-large") {
			try {
				child.stdout.destroy();
			} catch {
				// The child owner remains responsible for terminating the process.
			}
		}
		for (const pending of pendingRequests.values()) {
			settleFailure(pending, reason);
		}
		writer?.abort(new CodexTransportClosedError(reason));
		for (const record of reverseRequests.values()) {
			reverseHandles.delete(record.request);
		}
		reverseRequests.clear();
		pendingReverseBytes = 0;
		clearEpochRetention();
		resolveShutdownIfWaiting();
		if (reason !== "shutdown" || exit !== undefined) {
			emitExitOnce(exit?.code ?? null, exit?.signal ?? null);
		}
	};

	const finishShutdown = (): void => {
		if (state !== "closing" || !shutdownSetupComplete) {
			return;
		}
		const writerState = writer?.inspect();
		const queuedFrames =
			(writerState?.queuedFrames ?? 0) + (writerState?.responseQueuedFrames ?? 0);
		if (writerState?.writeInFlight || queuedFrames > 0) {
			return;
		}
		if (!inputEndStarted) {
			inputEndStarted = true;
			try {
				child.stdin.end(() => {
					inputFinished = true;
					finishShutdown();
				});
			} catch {
				emitIssue({ kind: "write-error", direction: "write", detail: "Closing Codex stdin threw" });
				inputFinished = true;
			}
		}
		if (!inputFinished) {
			return;
		}
		state = "closed";
		detachInput();
		writer?.dispose();
		clearEpochRetention();
		resolveShutdownIfWaiting();
	};

	const inspect = (): TransportSnapshot => {
		const writerState = writer?.inspect();
		return Object.freeze({
			state,
			pendingRequests: pendingRequests.size,
			pendingReverseRequests: reverseRequests.size,
			pendingReverseBytes,
			queuedFrames: writerState?.queuedFrames ?? 0,
			queuedBytes: writerState?.queuedBytes ?? 0,
			responseQueuedFrames: writerState?.responseQueuedFrames ?? 0,
			responseQueuedBytes: writerState?.responseQueuedBytes ?? 0,
			writeInFlight: writerState?.writeInFlight ?? false,
			maxQueuedFrames: CODEX_APP_SERVER_CAPACITY.outbound.regularQueuedFrames,
			maxQueuedBytes: CODEX_APP_SERVER_CAPACITY.outbound.regularQueuedBytes,
			maxResponseQueuedFrames: CODEX_APP_SERVER_CAPACITY.outbound.responseReservedFrames,
			maxResponseQueuedBytes: CODEX_APP_SERVER_CAPACITY.outbound.responseReservedBytes,
			maxPendingReverseRequests: CODEX_APP_SERVER_CAPACITY.outbound.pendingReverseRequests,
			maxPendingReverseBytes: CODEX_APP_SERVER_CAPACITY.outbound.pendingReverseBytes,
		});
	};

	const shutdown = (): Promise<void> => {
		if (state === "closed") {
			return Promise.resolve();
		}
		if (shutdownPromise) {
			return shutdownPromise;
		}
		state = "closing";
		shutdownPromise = new Promise<void>((resolve) => {
			resolveShutdown = resolve;
		});
		for (const pending of pendingRequests.values()) {
			settleFailure(pending, "shutdown");
		}
		writer?.drop(() => false, new CodexTransportClosedError("shutdown"));
		for (const record of Array.from(reverseRequests.values())) {
			enqueueProtocolError(record.wireId, -32603, PROTOCOL_ERROR_MESSAGE);
			reverseHandles.delete(record.request);
			reverseRequests.delete(record.key);
			pendingReverseBytes -= record.bytes;
		}
		pendingReverseBytes = 0;
		if (isClosed()) {
			shutdownSetupComplete = true;
			return shutdownPromise;
		}
		shutdownSetupComplete = true;
		shutdownTimer = setTimeout(() => {
			emitIssue({
				kind: "shutdown-timeout",
				direction: "write",
				detail: "Codex stdin did not drain before the composed shutdown bound",
			});
			writer?.abort(new CodexTransportClosedError("shutdown"));
			state = "closed";
			detachInput();
			clearEpochRetention();
			try {
				child.stdin.destroy();
			} catch {
				// The process owner remains responsible for terminating the child.
			}
			resolveShutdownIfWaiting();
		}, CODEX_COMPOSED_SHUTDOWN_MS);
		finishShutdown();
		return shutdownPromise;
	};

	const onStdinError = (): void => {
		emitIssue({ kind: "write-error", direction: "write", detail: "Codex stdin emitted an error" });
		closeTransport("write-error");
	};
	const onStdinFinish = (): void => {
		inputFinished = true;
		finishShutdown();
	};
	const onChildError = (): void => {
		emitIssue({ kind: "read-error", direction: "stdout", detail: "Codex child emitted an error" });
		closeTransport("child-exit");
	};
	const onChildExit = (code: number | null, signal: NodeJS.Signals | null): void => {
		closeTransport(state === "closing" ? "shutdown" : "child-exit", { code, signal });
	};

	writer = createFrameWriter(
		child.stdin,
		createTransportWriterCallbacks({
			emitIssue,
			settleFailure,
			acceptReverseResponse,
			releaseReverseResponse,
			closeTransport,
			finishShutdown,
		}),
	);

	const outbound = createOutboundOperations({
		identity: () => identity,
		state: () => state,
		pendingRequests,
		removeQueuedJob,
		settleFailure,
		enqueue: (job, pending) => enqueue(job, pending, "regular"),
	});
	const router = createInboundRouter({
		identity: () => identity,
		state: () => state,
		pendingRequests,
		tombstones,
		reverseRequests,
		completedReverseIds,
		reverseHandles,
		pendingReverseBytes: {
			get: () => pendingReverseBytes,
			add: (bytes) => (pendingReverseBytes += bytes),
			remove: (bytes) => (pendingReverseBytes = Math.max(0, pendingReverseBytes - bytes)),
		},
		dynamicDispatchers,
		emitIssue,
		emitServerRequest: events.emitServerRequest,
		emitServerNotification: events.emitServerNotification,
		settleFailure,
		settleDelivered,
		settleRemoteError,
		retainLateResponse,
		retainCompletedReverseId,
		enqueue: (job, lane) => enqueue(job, undefined, lane),
		enqueueProtocolError,
	});

	const registerDynamicDispatcher = (registration: DynamicDispatcherRegistration): void => {
		if (state !== "open") {
			throw new CodexTransportClosedError(state === "closing" ? "shutdown" : "transport-closed");
		}
		router.registerDynamicDispatcher(registration);
	};
	const replaceIdentity = (replacement: IdentityAuthority): void => {
		if (
			replacement.validator.childId !== identity.validator.childId ||
			replacement.validator.epoch !== identity.validator.epoch
		) {
			throw new TypeError(
				"A Codex transport identity replacement must keep the exact child epoch.",
			);
		}
		identity = replacement;
	};
	const ownsPendingReverseRequest = (
		request: TransportServerRequest,
		owner: TransportServerRequest["owner"],
	): boolean => {
		const record = reverseHandles.get(request);
		return (
			record?.request.owner === owner &&
			!record.responded &&
			!record.responding &&
			reverseRequests.get(record.key) === record
		);
	};

	child.stdin.on("error", onStdinError);
	child.stdin.on("finish", onStdinFinish);
	stdinListenersAttached = true;
	child.on("error", onChildError);
	child.on("exit", onChildExit);
	childListenersAttached = true;
	if (child.exitCode !== null || child.signalCode !== null) {
		onChildExit(child.exitCode, child.signalCode);
	}
	if (state === "open") {
		streamAttachment = attachCodexStreamReader(child.stdout, child.stderr, {
			onLine: router.handleLine,
			onIssue: events.emitIssue,
			onFrameTooLarge: () => closeTransport("frame-too-large"),
			onStdoutError: () => {
				emitIssue({
					kind: "read-error",
					direction: "stdout",
					detail: "Codex stdout emitted an error",
				});
				closeTransport("stdout-error");
			},
			onStdoutEnd: () => closeTransport(state === "closing" ? "shutdown" : "stdout-error"),
			onStderr: events.emitStderr,
			onStderrError: () =>
				emitIssue({
					kind: "stderr-error",
					direction: "stderr",
					detail: "Codex stderr emitted an error",
				}),
		});
	}

	if (state === "open") {
		for (const registration of options.dynamicDispatchers ?? []) {
			registerDynamicDispatcher(registration);
		}
	}

	return Object.freeze({
		replaceIdentity,
		request: outbound.request,
		sendNotification: outbound.sendNotification,
		registerDynamicDispatcher,
		ownsPendingReverseRequest,
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
