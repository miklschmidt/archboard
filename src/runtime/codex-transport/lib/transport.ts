import type { IdentityAuthority } from "@/shared/codex-workbench-identity";
import { CODEX_COMPOSED_SHUTDOWN_MS } from "@/shared/timing/timing";
import {
	attachChildListeners,
	destroyQuietly,
	type ChildAttachment,
} from "@/runtime/codex-transport/lib/child-attachment";
import {
	CodexTransportClosedError,
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
import { createRequestSettlement } from "@/runtime/codex-transport/lib/request-settlement";
import { createReverseLedger } from "@/runtime/codex-transport/lib/reverse-ledger";
import { transportSnapshot } from "@/runtime/codex-transport/lib/snapshot";
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
	TransportLateResponse,
	TransportServerRequest,
	TransportSnapshot,
} from "@/runtime/codex-transport/lib/types";
import type {
	PendingRequest,
	RequestTombstone,
	ReverseRecord,
	WriteJob,
} from "@/runtime/codex-transport/lib/internals";
import { protocolErrorFrame, wireKey, type WireId } from "@/runtime/codex-transport/lib/wire";

const PROTOCOL_ERROR_MESSAGE = "Codex transport is shutting down.";
const INTERNAL_ERROR_CODE = -32603;

type TransportState = "open" | "closing" | "closed";
type CloseReason = Extract<
	CodexRequestFailureReason,
	"child-exit" | "stdout-error" | "write-error" | "shutdown" | "frame-too-large"
>;
type ChildExit = { readonly code: number | null; readonly signal: NodeJS.Signals | null };
type WriteLane = "regular" | "response";

/**
 * The lane a job is written on when the caller did not choose one.
 * @param job The job.
 * @returns The response lane for reverse responses and protocol errors, otherwise regular.
 */
function defaultLane(job: WriteJob): WriteLane {
	return job.kind === "reverse-response" || job.kind === "protocol-error" ? "response" : "regular";
}

/**
 * Creates the transport over one Codex app-server child: framed stdio, request settlement,
 * reverse-request ownership, and a composed shutdown.
 * @param options The child, its identity authority, and any dispatchers to register.
 * @returns The transport.
 */
export function createCodexTransport(options: CodexTransportOptions): CodexTransport {
	const child: CodexTransportChild = options.child;
	let identity: IdentityAuthority = options.identity;
	let state: TransportState = "open";
	let inputEndStarted = false;
	let inputFinished = false;
	let shutdownTimer: ReturnType<typeof setTimeout> | undefined;
	let shutdownPromise: Promise<void> | undefined;
	let resolveShutdown: (() => void) | undefined;
	let shutdownSetupComplete = false;
	let exitEmitted = false;
	let streamAttachment: StreamReaderAttachment | undefined;
	let childAttachment: ChildAttachment | undefined;
	const pendingRequests = new Map<string, PendingRequest>();
	const tombstones = new Map<string, RequestTombstone>();
	const reverseRequests = new Map<string, ReverseRecord>();
	const completedReverseIds = new Set<string>();
	const reverseHandles = new WeakMap<TransportServerRequest, ReverseRecord>();
	const dynamicDispatchers = new Map<string, DynamicDispatcherRegistration>();
	const events = createTransportEvents();
	const emitIssue = events.emitIssue;
	const lateResponseStore = createLateResponseStore(emitIssue);
	const settlement = createRequestSettlement({ pendingRequests, tombstones });
	const ledger = createReverseLedger({ reverseRequests, reverseHandles, completedReverseIds });

	/**
	 * The current state, read through a call so closures see the live value rather than the
	 * narrowing TypeScript applies at the assignment site.
	 * @returns The state.
	 */
	const currentState = (): TransportState => state;

	/**
	 * Whether the transport has closed.
	 * @returns True once closed.
	 */
	const isClosed = (): boolean => currentState() === "closed";

	/**
	 * The current identity authority.
	 * @returns The authority.
	 */
	const currentIdentity = (): IdentityAuthority => identity;

	/**
	 * The closed error for the current state.
	 * @returns A shutdown error while closing, otherwise a transport-closed error.
	 */
	const closedError = (): CodexTransportClosedError =>
		new CodexTransportClosedError(currentState() === "closing" ? "shutdown" : "transport-closed");

	/**
	 * Whether a lane accepts frames in the current state: both while open, only the response
	 * lane while closing.
	 * @param lane The lane.
	 * @returns True when a frame may be queued on it.
	 */
	const laneOpen = (lane: WriteLane): boolean =>
		currentState() === "open" || (currentState() === "closing" && lane === "response");

	/**
	 * Queues a frame on the writer.
	 * @param job The job.
	 * @param pending The pending request the job carries, so it can be pulled back.
	 * @param lane The lane, when the caller chooses one.
	 * @returns The queued frame.
	 */
	const enqueue = (
		job: WriteJob,
		pending?: PendingRequest,
		lane?: WriteLane,
	): FrameWriterJob<WriteJob> => {
		const actualLane = lane ?? defaultLane(job);
		if (!laneOpen(actualLane)) {
			throw closedError();
		}
		const queued: FrameWriterJob<WriteJob> = { frame: job.frame, value: job };
		if (pending) {
			pending.job = queued;
		}
		writer.enqueue(queued, actualLane);
		return queued;
	};

	/**
	 * Queues a job on the regular lane for an outbound request or notification.
	 * @param job The job.
	 * @param pending The pending request the job carries.
	 * @returns The queued frame.
	 */
	const enqueueRegular = (job: WriteJob, pending?: PendingRequest): FrameWriterJob<WriteJob> =>
		enqueue(job, pending, "regular");

	/**
	 * Queues a job for the inbound router, which chooses the lane itself.
	 * @param job The job.
	 * @param lane The lane.
	 */
	const enqueueRouted = (job: WriteJob, lane?: WriteLane): void => {
		enqueue(job, undefined, lane);
	};

	/**
	 * Answers a reverse frame with a JSON-RPC error on the response lane.
	 * @param wireId The frame's wire id.
	 * @param code The error code.
	 * @param message The error message.
	 * @returns True when the error was queued and the id retained as answered.
	 */
	const enqueueProtocolError = (wireId: WireId, code: number, message: string): boolean => {
		if (isClosed() || inputEndStarted) {
			return false;
		}
		let frame: Buffer;
		try {
			frame = protocolErrorFrame(wireId, code, message);
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
		ledger.retainCompletedId(key);
		return true;
	};

	/** Stops reading the child and listening to its lifecycle. */
	const detachInput = (): void => {
		streamAttachment?.dispose();
		streamAttachment = undefined;
		childAttachment?.detach();
	};

	/** Forgets everything scoped to the child epoch that ended. */
	const clearEpochRetention = (): void => {
		tombstones.clear();
		completedReverseIds.clear();
		dynamicDispatchers.clear();
	};

	/** Cancels the composed shutdown bound, if armed. */
	const cancelShutdownTimer = (): void => {
		if (shutdownTimer !== undefined) {
			clearTimeout(shutdownTimer);
		}
		shutdownTimer = undefined;
	};

	/** Resolves a waiting shutdown promise and cancels its bound timer. */
	const resolveShutdownIfWaiting = (): void => {
		if (!resolveShutdown) {
			return;
		}
		const resolve = resolveShutdown;
		resolveShutdown = undefined;
		cancelShutdownTimer();
		resolve();
	};

	/**
	 * Publishes the child's exit once.
	 * @param exit The exit, or undefined when the transport closed before the child exited.
	 */
	const emitExitOnce = (exit: ChildExit | undefined): void => {
		if (exitEmitted) {
			return;
		}
		exitEmitted = true;
		events.emitExit(
			Object.freeze({
				child: identity.validator.childId,
				epoch: identity.validator.epoch,
				code: exit?.code ?? null,
				signal: exit?.signal ?? null,
			}),
		);
	};

	/**
	 * Fails every pending request and abandons every queued frame and reverse request.
	 * @param reason What the requests are charged to.
	 */
	const abandonWork = (reason: CloseReason): void => {
		for (const pending of pendingRequests.values()) {
			settlement.settleFailure(pending, reason);
		}
		writer.abort(new CodexTransportClosedError(reason));
		ledger.forgetAll();
	};

	/**
	 * Closes the transport abruptly: the child died, a stream failed, or a frame overran.
	 * @param reason Why it closed.
	 * @param exit The child's exit, when the close was caused by it.
	 */
	const closeTransport = (reason: CloseReason, exit?: ChildExit): void => {
		if (isClosed()) {
			if (exit !== undefined) {
				emitExitOnce(exit);
			}
			return;
		}
		state = "closed";
		cancelShutdownTimer();
		detachInput();
		if (reason === "frame-too-large") {
			destroyQuietly(child.stdout);
		}
		abandonWork(reason);
		clearEpochRetention();
		resolveShutdownIfWaiting();
		if (reason !== "shutdown" || exit !== undefined) {
			emitExitOnce(exit);
		}
	};

	/**
	 * Whether the writer still has frames to hand to stdin.
	 * @returns True while a write is in flight or queued.
	 */
	const writerBusy = (): boolean => {
		const writerState = writer.inspect();
		return (
			writerState.writeInFlight || writerState.queuedFrames + writerState.responseQueuedFrames > 0
		);
	};

	/** Ends stdin once, finishing the shutdown when the stream confirms. */
	const endInput = (): void => {
		if (inputEndStarted) {
			return;
		}
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
	};

	/** Advances a composed shutdown: drain the writer, end stdin, then close. */
	const finishShutdown = (): void => {
		if (currentState() !== "closing" || !shutdownSetupComplete || writerBusy()) {
			return;
		}
		endInput();
		if (!inputFinished) {
			return;
		}
		state = "closed";
		detachInput();
		writer.dispose();
		clearEpochRetention();
		resolveShutdownIfWaiting();
	};

	/**
	 * Describes the transport's queues against their bounds.
	 * @returns The snapshot.
	 */
	const inspect = (): TransportSnapshot =>
		transportSnapshot(
			{
				state: currentState(),
				pendingRequests: pendingRequests.size,
				pendingReverseRequests: reverseRequests.size,
				pendingReverseBytes: ledger.pendingBytes(),
			},
			writer.inspect(),
		);

	/**
	 * Answers one unanswered reverse request with the shutdown error.
	 * @param record The reverse record.
	 */
	const refuseForShutdown = (record: ReverseRecord): void => {
		enqueueProtocolError(record.wireId, INTERNAL_ERROR_CODE, PROTOCOL_ERROR_MESSAGE);
	};

	/** Gives up on a shutdown whose stdin did not drain within the composed bound. */
	const abortShutdown = (): void => {
		emitIssue({
			kind: "shutdown-timeout",
			direction: "write",
			detail: "Codex stdin did not drain before the composed shutdown bound",
		});
		writer.abort(new CodexTransportClosedError("shutdown"));
		state = "closed";
		detachInput();
		clearEpochRetention();
		destroyQuietly(child.stdin);
		resolveShutdownIfWaiting();
	};

	/**
	 * Shuts the transport down: fails pending requests, refuses reverse requests, drains the
	 * response lane, and ends stdin within the composed bound.
	 * @returns A promise resolved once the transport has closed.
	 */
	const shutdown = (): Promise<void> => {
		if (isClosed()) {
			return Promise.resolve();
		}
		if (shutdownPromise) {
			return shutdownPromise;
		}
		state = "closing";
		const promise = new Promise<void>((resolve) => {
			resolveShutdown = resolve;
		});
		shutdownPromise = promise;
		for (const pending of pendingRequests.values()) {
			settlement.settleFailure(pending, "shutdown");
		}
		writer.drop(() => false, new CodexTransportClosedError("shutdown"));
		ledger.drain(refuseForShutdown);
		shutdownSetupComplete = true;
		if (isClosed()) {
			return promise;
		}
		shutdownTimer = setTimeout(abortShutdown, CODEX_COMPOSED_SHUTDOWN_MS);
		finishShutdown();
		return promise;
	};

	/** Closes on a stdin stream error. */
	const onStdinError = (): void => {
		emitIssue({ kind: "write-error", direction: "write", detail: "Codex stdin emitted an error" });
		closeTransport("write-error");
	};

	/** Records that stdin finished so a shutdown can complete. */
	const onStdinFinish = (): void => {
		inputFinished = true;
		finishShutdown();
	};

	/** Closes on a child process error. */
	const onChildError = (): void => {
		emitIssue({ kind: "read-error", direction: "stdout", detail: "Codex child emitted an error" });
		closeTransport("child-exit");
	};

	/**
	 * Closes on the child's exit, as a shutdown when one was in progress.
	 * @param code The exit code.
	 * @param signal The terminating signal.
	 */
	const onChildExit = (code: number | null, signal: NodeJS.Signals | null): void => {
		closeTransport(currentState() === "closing" ? "shutdown" : "child-exit", { code, signal });
	};

	/** Closes on a stdout stream error. */
	const onStdoutError = (): void => {
		emitIssue({ kind: "read-error", direction: "stdout", detail: "Codex stdout emitted an error" });
		closeTransport("stdout-error");
	};

	/** Closes when stdout ends, as a shutdown when one was in progress. */
	const onStdoutEnd = (): void => {
		closeTransport(currentState() === "closing" ? "shutdown" : "stdout-error");
	};

	/** Closes when a stdout line overran the frame bound. */
	const onFrameTooLarge = (): void => {
		closeTransport("frame-too-large");
	};

	/** Reports a stderr stream error without closing; stderr is diagnostic only. */
	const onStderrError = (): void => {
		emitIssue({
			kind: "stderr-error",
			direction: "stderr",
			detail: "Codex stderr emitted an error",
		});
	};

	const writer: FrameWriter<WriteJob> = createFrameWriter(
		child.stdin,
		createTransportWriterCallbacks({
			emitIssue,
			settleFailure: settlement.settleFailure,
			acceptReverseResponse: ledger.accept,
			releaseReverseResponse: ledger.release,
			closeTransport,
			finishShutdown,
		}),
	);

	const outbound = createOutboundOperations({
		identity: currentIdentity,
		state: currentState,
		pendingRequests,
		removeQueuedJob: writer.remove,
		settleFailure: settlement.settleFailure,
		enqueue: enqueueRegular,
	});
	const router = createInboundRouter({
		identity: currentIdentity,
		state: currentState,
		pendingRequests,
		tombstones,
		reverseRequests,
		completedReverseIds,
		reverseHandles,
		reverseBytes: ledger,
		dynamicDispatchers,
		emitIssue,
		emitServerRequest: events.emitServerRequest,
		emitServerNotification: events.emitServerNotification,
		settleFailure: settlement.settleFailure,
		settleDelivered: settlement.settleDelivered,
		settleRemoteError: settlement.settleRemoteError,
		retainLateResponse: lateResponseStore.retain,
		retainCompletedReverseId: ledger.retainCompletedId,
		enqueue: enqueueRouted,
		enqueueProtocolError,
	});

	/**
	 * Registers a dynamic dispatcher while the transport is open.
	 * @param registration The owner, namespace and manifest hash.
	 */
	const registerDynamicDispatcher = (registration: DynamicDispatcherRegistration): void => {
		if (currentState() !== "open") {
			throw closedError();
		}
		router.registerDynamicDispatcher(registration);
	};

	/**
	 * Replaces the identity authority over the same child epoch.
	 * @param replacement The new authority; it must keep the exact child and epoch.
	 */
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

	/**
	 * Copies the late-response log.
	 * @returns The retained late responses, oldest first.
	 */
	const inspectLateResponses = (): readonly TransportLateResponse[] =>
		Object.freeze([...lateResponseStore.values]);

	/** Attaches to the child's streams and exit, then registers the initial dispatchers. */
	const start = (): void => {
		childAttachment = attachChildListeners(child, {
			onStdinError,
			onStdinFinish,
			onChildError,
			onChildExit,
		});
		if (child.exitCode !== null || child.signalCode !== null) {
			onChildExit(child.exitCode, child.signalCode);
		}
		if (isClosed()) {
			return;
		}
		streamAttachment = attachCodexStreamReader(child.stdout, child.stderr, {
			onLine: router.handleLine,
			onIssue: events.emitIssue,
			onFrameTooLarge,
			onStdoutError,
			onStdoutEnd,
			onStderr: events.emitStderr,
			onStderrError,
		});
		for (const registration of options.dynamicDispatchers ?? []) {
			registerDynamicDispatcher(registration);
		}
	};

	start();

	return Object.freeze({
		replaceIdentity,
		request: outbound.request,
		sendNotification: outbound.sendNotification,
		registerDynamicDispatcher,
		ownsPendingReverseRequest: ledger.ownedBy,
		respond: router.respond,
		onServerRequest: events.onServerRequest,
		onServerNotification: events.onServerNotification,
		onIssue: events.onIssue,
		onStderr: events.onStderr,
		onExit: events.onExit,
		inspect,
		inspectLateResponses,
		inspectIssues: events.inspectIssues,
		inspectStderr: events.inspectStderr,
		shutdown,
	});
}
