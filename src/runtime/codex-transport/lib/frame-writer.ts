import type { Writable } from "node:stream";

import { CODEX_APP_SERVER_CAPACITY } from "@/shared/codex-app-server-capacity";
import { CodexTransportWriteError } from "@/runtime/codex-transport/lib/errors";

type FrameWriterLane = "regular" | "response";

interface FrameWriterJob<T> {
	readonly frame: Buffer;
	readonly value: T;
}

interface FrameWriterCallbacks<T> {
	readonly onAccepted?: (job: FrameWriterJob<T>) => void;
	readonly onComplete: (job: FrameWriterJob<T>) => void;
	readonly onError: (job: FrameWriterJob<T>, error: Error, writeReturned: boolean) => void;
	readonly onDrop: (job: FrameWriterJob<T>, reason: unknown) => void;
	readonly onIdle: () => void;
}

interface FrameWriter<T> {
	readonly enqueue: (job: FrameWriterJob<T>, lane?: FrameWriterLane) => void;
	readonly remove: (job: FrameWriterJob<T>) => boolean;
	readonly drop: (keep: (job: FrameWriterJob<T>) => boolean, reason: unknown) => void;
	readonly abort: (reason: unknown) => void;
	readonly dispose: () => void;
	readonly inspect: () => {
		readonly queuedFrames: number;
		readonly queuedBytes: number;
		readonly responseQueuedFrames: number;
		readonly responseQueuedBytes: number;
		readonly writeInFlight: boolean;
	};
}

interface QueuedFrame<T> {
	readonly job: FrameWriterJob<T>;
	readonly bytes: number;
}

interface ActiveWrite<T> {
	readonly job: FrameWriterJob<T>;
	readonly lane: FrameWriterLane;
	readonly bytes: number;
	callbackCalled: boolean;
	callbackError?: Error;
	writeReturned: boolean;
	needsDrain: boolean;
	drainSeen: boolean;
}

/**
 * The bytes a frame is charged against the queue bounds: its payload without the newline.
 * @param frame The frame.
 * @returns The charged byte count.
 */
function chargedBytes(frame: Buffer): number {
	return Math.max(0, frame.byteLength - 1);
}

/**
 * Whether both halves of a write have reported: the call returned and its callback ran.
 * @param write The active write.
 * @returns True once nothing more is expected from stdin.write itself.
 */
function writeSettled<T>(write: ActiveWrite<T>): boolean {
	return write.writeReturned && write.callbackCalled;
}

/**
 * Whether the write must still wait for stdin's drain event before the next frame.
 * @param write The active write.
 * @returns True while the stream asked for backpressure and has not drained.
 */
function awaitingDrain<T>(write: ActiveWrite<T>): boolean {
	return write.needsDrain && !write.drainSeen;
}

/**
 * Normalises a thrown value to an Error.
 * @param error The thrown value.
 * @returns The value itself when it is an Error, otherwise an Error naming it.
 */
function toError(error: unknown): Error {
	return error instanceof Error ? error : new Error(String(error));
}

/**
 * Creates the one-frame-at-a-time stdin writer with a regular lane and a reserved response
 * lane so reverse responses still leave while the regular queue is full.
 * @param stdin The child's stdin.
 * @param callbacks What to tell the transport as frames are accepted, complete, fail or drop.
 * @returns The writer.
 */
function createFrameWriter<T>(stdin: Writable, callbacks: FrameWriterCallbacks<T>): FrameWriter<T> {
	const regularQueue: QueuedFrame<T>[] = [];
	const responseQueue: QueuedFrame<T>[] = [];
	let regularQueuedBytes = 0;
	let responseQueuedBytes = 0;
	let active: ActiveWrite<T> | undefined;
	let broken = false;
	let disposed = false;

	/**
	 * Frames the in-flight write occupies in the response lane.
	 * @returns One when a response is being written, otherwise zero.
	 */
	const activeResponseFrames = (): number => (active?.lane === "response" ? 1 : 0);

	/**
	 * Bytes the in-flight write occupies in the response lane.
	 * @returns The active response's charged bytes, or zero.
	 */
	const activeResponseBytes = (): number => (active?.lane === "response" ? active.bytes : 0);

	/**
	 * Drops every queued frame in a lane.
	 * @param queue The lane's queue.
	 * @param reason What to drop the frames with.
	 */
	const rejectQueue = (queue: QueuedFrame<T>[], reason: unknown): void => {
		while (queue.length > 0) {
			const queued = queue.shift();
			if (!queued) {
				continue;
			}
			callbacks.onDrop(queued.job, reason);
		}
	};

	/**
	 * Marks the writer broken by a failed write: the failed job is reported and both lanes
	 * are emptied, since stdin cannot be trusted afterwards.
	 * @param current The write that failed.
	 * @param error The stream error.
	 */
	const failWriter = (current: ActiveWrite<T>, error: Error): void => {
		active = undefined;
		broken = true;
		callbacks.onError(current.job, error, current.writeReturned);
		rejectQueue(responseQueue, error);
		rejectQueue(regularQueue, error);
		responseQueuedBytes = 0;
		regularQueuedBytes = 0;
	};

	/**
	 * Completes a write and starts the next frame.
	 * @param current The finished write.
	 */
	const finishWrite = (current: ActiveWrite<T>): void => {
		active = undefined;
		callbacks.onComplete(current.job);
		pump();
	};

	/**
	 * Takes the next frame, responses first, and charges it out of its lane.
	 * @returns The write to start, or undefined when both lanes are empty.
	 */
	const dequeue = (): ActiveWrite<T> | undefined => {
		const fromResponse = responseQueue.length > 0;
		const queued = fromResponse ? responseQueue.shift() : regularQueue.shift();
		if (!queued) {
			return undefined;
		}
		if (fromResponse) {
			responseQueuedBytes -= queued.bytes;
		} else {
			regularQueuedBytes -= queued.bytes;
		}
		return {
			job: queued.job,
			lane: fromResponse ? "response" : "regular",
			bytes: queued.bytes,
			callbackCalled: false,
			writeReturned: false,
			needsDrain: false,
			drainSeen: false,
		};
	};

	/**
	 * Hands one frame to stdin and wires its two completion signals together.
	 * @param current The write to start.
	 * @param tryComplete Re-evaluates completion after each signal.
	 * @param complete Settles the write, with an error when the write threw synchronously.
	 */
	const beginWrite = (
		current: ActiveWrite<T>,
		tryComplete: () => void,
		complete: (error?: Error) => void,
	): void => {
		try {
			const accepted = stdin.write(current.job.frame, (error?: Error | null) => {
				current.callbackCalled = true;
				if (error) {
					current.callbackError = error;
				}
				tryComplete();
			});
			current.writeReturned = true;
			callbacks.onAccepted?.(current.job);
			current.needsDrain = !accepted;
			tryComplete();
		} catch (error) {
			complete(toError(error));
		}
	};

	/** Starts the next frame when nothing is in flight and the writer is healthy. */
	const pump = (): void => {
		if (broken || active !== undefined) {
			return;
		}
		const current = dequeue();
		if (!current) {
			callbacks.onIdle();
			return;
		}
		active = current;

		/**
		 * Settles this write exactly once, as long as it is still the active one.
		 * @param error The write failure, when there was one.
		 */
		const complete = (error?: Error): void => {
			if (active !== current) {
				return;
			}
			if (error) {
				failWriter(current, error);
			} else {
				finishWrite(current);
			}
		};

		/** Completes the write once its call returned, its callback ran, and any drain arrived. */
		const tryComplete = (): void => {
			if (active !== current || !writeSettled(current)) {
				return;
			}
			if (current.callbackError) {
				complete(current.callbackError);
				return;
			}
			if (!awaitingDrain(current)) {
				complete();
			}
		};
		beginWrite(current, tryComplete, complete);
	};

	/** Releases a write that was waiting on stdin's drain event. */
	const onDrain = (): void => {
		if (!active) {
			return;
		}
		active.drainSeen = true;
		const current = active;
		if (!writeSettled(current)) {
			return;
		}
		if (current.callbackError) {
			failWriter(current, current.callbackError);
		} else {
			finishWrite(current);
		}
	};

	stdin.on("drain", onDrain);

	/**
	 * Queues a frame in the response lane within its reserved frame and byte bounds.
	 * @param job The frame.
	 * @param bytes Its charged bytes.
	 */
	const enqueueResponse = (job: FrameWriterJob<T>, bytes: number): void => {
		if (bytes > CODEX_APP_SERVER_CAPACITY.outbound.maxReverseResponseBytes) {
			throw new CodexTransportWriteError(
				"frame-too-large",
				`the reverse response exceeds ${CODEX_APP_SERVER_CAPACITY.outbound.maxReverseResponseBytes} bytes`,
			);
		}
		if (
			responseQueue.length + activeResponseFrames() >=
				CODEX_APP_SERVER_CAPACITY.outbound.responseReservedFrames ||
			responseQueuedBytes + activeResponseBytes() + bytes >
				CODEX_APP_SERVER_CAPACITY.outbound.responseReservedBytes
		) {
			throw new CodexTransportWriteError(
				"backpressure",
				`the response reserve is limited to ${CODEX_APP_SERVER_CAPACITY.outbound.responseReservedFrames} frames and ${CODEX_APP_SERVER_CAPACITY.outbound.responseReservedBytes} bytes`,
			);
		}
		responseQueue.push({ job, bytes });
		responseQueuedBytes += bytes;
	};

	/**
	 * Queues a frame in the regular lane within its frame and byte bounds.
	 * @param job The frame.
	 * @param bytes Its charged bytes.
	 */
	const enqueueRegular = (job: FrameWriterJob<T>, bytes: number): void => {
		if (
			regularQueue.length >= CODEX_APP_SERVER_CAPACITY.outbound.regularQueuedFrames ||
			regularQueuedBytes + bytes > CODEX_APP_SERVER_CAPACITY.outbound.regularQueuedBytes
		) {
			throw new CodexTransportWriteError(
				"backpressure",
				`the regular write queue is limited to ${CODEX_APP_SERVER_CAPACITY.outbound.regularQueuedFrames} frames and ${CODEX_APP_SERVER_CAPACITY.outbound.regularQueuedBytes} bytes`,
			);
		}
		regularQueue.push({ job, bytes });
		regularQueuedBytes += bytes;
	};

	/**
	 * Queues a frame and starts writing when idle.
	 * @param job The frame.
	 * @param lane Which lane's bounds and priority apply.
	 */
	const enqueue = (job: FrameWriterJob<T>, lane: FrameWriterLane = "regular"): void => {
		if (broken || disposed) {
			throw new CodexTransportWriteError("write-error", "the stdin writer is unavailable");
		}
		const bytes = chargedBytes(job.frame);
		if (lane === "response") {
			enqueueResponse(job, bytes);
		} else {
			enqueueRegular(job, bytes);
		}
		pump();
	};

	/**
	 * Removes a queued frame that has not started writing.
	 * @param job The frame.
	 * @returns True when the frame was still queued.
	 */
	const remove = (job: FrameWriterJob<T>): boolean => {
		const responseIndex = responseQueue.findIndex((queued) => queued.job === job);
		if (responseIndex >= 0) {
			const [removed] = responseQueue.splice(responseIndex, 1);
			if (removed) {
				responseQueuedBytes -= removed.bytes;
			}
			return removed !== undefined;
		}
		const regularIndex = regularQueue.findIndex((queued) => queued.job === job);
		if (regularIndex < 0) {
			return false;
		}
		const [removed] = regularQueue.splice(regularIndex, 1);
		if (removed) {
			regularQueuedBytes -= removed.bytes;
		}
		return removed !== undefined;
	};

	/**
	 * Drops the frames in one lane that a predicate does not keep.
	 * @param queue The lane's queue.
	 * @param lane Which lane, for byte accounting.
	 * @param keep Whether a frame stays queued.
	 * @param reason What to drop the others with.
	 */
	const dropQueue = (
		queue: QueuedFrame<T>[],
		lane: FrameWriterLane,
		keep: (job: FrameWriterJob<T>) => boolean,
		reason: unknown,
	): void => {
		const retained: QueuedFrame<T>[] = [];
		const dropped: QueuedFrame<T>[] = [];
		for (const queued of queue) {
			(keep(queued.job) ? retained : dropped).push(queued);
		}
		queue.length = 0;
		queue.push(...retained);
		const droppedBytes = dropped.reduce((total, queued) => total + queued.bytes, 0);
		if (lane === "response") {
			responseQueuedBytes -= droppedBytes;
		} else {
			regularQueuedBytes -= droppedBytes;
		}
		for (const queued of dropped) {
			callbacks.onDrop(queued.job, reason);
		}
	};

	/**
	 * Drops queued frames from both lanes that a predicate does not keep, then resumes.
	 * @param keep Whether a frame stays queued.
	 * @param reason What to drop the others with.
	 */
	const drop = (keep: (job: FrameWriterJob<T>) => boolean, reason: unknown): void => {
		dropQueue(responseQueue, "response", keep, reason);
		dropQueue(regularQueue, "regular", keep, reason);
		pump();
	};

	/** Stops listening to stdin; later calls do nothing. */
	const dispose = (): void => {
		if (disposed) {
			return;
		}
		disposed = true;
		stdin.removeListener("drain", onDrain);
	};

	/**
	 * Abandons the in-flight write and every queued frame, leaving the writer unusable.
	 * @param reason What to drop them with.
	 */
	const abort = (reason: unknown): void => {
		broken = true;
		dispose();
		if (active) {
			const current = active;
			active = undefined;
			callbacks.onDrop(current.job, reason);
		}
		rejectQueue(responseQueue, reason);
		rejectQueue(regularQueue, reason);
		responseQueuedBytes = 0;
		regularQueuedBytes = 0;
	};

	/**
	 * Describes both lanes, counting the in-flight response against the response lane.
	 * @returns The queue depths and whether a write is in flight.
	 */
	const inspect = (): ReturnType<FrameWriter<T>["inspect"]> =>
		Object.freeze({
			queuedFrames: regularQueue.length,
			queuedBytes: regularQueuedBytes,
			responseQueuedFrames: responseQueue.length + activeResponseFrames(),
			responseQueuedBytes: responseQueuedBytes + activeResponseBytes(),
			writeInFlight: active !== undefined,
		});

	return Object.freeze({
		enqueue,
		remove,
		drop,
		abort,
		dispose,
		inspect,
	});
}

export {
	type FrameWriterLane,
	type FrameWriterJob,
	type FrameWriterCallbacks,
	type FrameWriter,
	createFrameWriter,
};
