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

function chargedBytes(frame: Buffer): number {
	return Math.max(0, frame.byteLength - 1);
}

function createFrameWriter<T>(stdin: Writable, callbacks: FrameWriterCallbacks<T>): FrameWriter<T> {
	const regularQueue: QueuedFrame<T>[] = [];
	const responseQueue: QueuedFrame<T>[] = [];
	let regularQueuedBytes = 0;
	let responseQueuedBytes = 0;
	let active: ActiveWrite<T> | undefined;
	let broken = false;
	let disposed = false;

	const rejectQueue = (queue: QueuedFrame<T>[], reason: unknown): void => {
		while (queue.length > 0) {
			const queued = queue.shift();
			if (!queued) {
				continue;
			}
			callbacks.onDrop(queued.job, reason);
		}
	};

	const pump = (): void => {
		if (broken || active !== undefined) {
			return;
		}
		const fromResponse = responseQueue.length > 0;
		const queued = fromResponse ? responseQueue.shift() : regularQueue.shift();
		if (!queued) {
			callbacks.onIdle();
			return;
		}
		if (fromResponse) {
			responseQueuedBytes -= queued.bytes;
		} else {
			regularQueuedBytes -= queued.bytes;
		}
		const current: ActiveWrite<T> = {
			job: queued.job,
			lane: fromResponse ? "response" : "regular",
			bytes: queued.bytes,
			callbackCalled: false,
			writeReturned: false,
			needsDrain: false,
			drainSeen: false,
		};
		active = current;

		const complete = (error?: Error): void => {
			if (active !== current) {
				return;
			}
			active = undefined;
			if (error) {
				broken = true;
				callbacks.onError(current.job, error, current.writeReturned);
				rejectQueue(responseQueue, error);
				rejectQueue(regularQueue, error);
				responseQueuedBytes = 0;
				regularQueuedBytes = 0;
				return;
			}
			callbacks.onComplete(current.job);
			pump();
		};
		const tryComplete = (): void => {
			if (active !== current || !current.writeReturned || !current.callbackCalled) {
				return;
			}
			if (current.callbackError) {
				complete(current.callbackError);
				return;
			}
			if (current.needsDrain && !current.drainSeen) {
				return;
			}
			complete();
		};
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
			complete(error instanceof Error ? error : new Error(String(error)));
		}
	};

	const onDrain = (): void => {
		if (!active) {
			return;
		}
		active.drainSeen = true;
		const current = active;
		if (!current.writeReturned || !current.callbackCalled) {
			return;
		}
		if (current.callbackError) {
			active = undefined;
			broken = true;
			callbacks.onError(current.job, current.callbackError, current.writeReturned);
			rejectQueue(responseQueue, current.callbackError);
			rejectQueue(regularQueue, current.callbackError);
			responseQueuedBytes = 0;
			regularQueuedBytes = 0;
			return;
		}
		active = undefined;
		callbacks.onComplete(current.job);
		pump();
	};

	stdin.on("drain", onDrain);

	const enqueue = (job: FrameWriterJob<T>, lane: FrameWriterLane = "regular"): void => {
		if (broken || disposed) {
			throw new CodexTransportWriteError("write-error", "the stdin writer is unavailable");
		}
		const bytes = chargedBytes(job.frame);
		if (lane === "response") {
			if (bytes > CODEX_APP_SERVER_CAPACITY.outbound.maxReverseResponseBytes) {
				throw new CodexTransportWriteError(
					"frame-too-large",
					`the reverse response exceeds ${CODEX_APP_SERVER_CAPACITY.outbound.maxReverseResponseBytes} bytes`,
				);
			}
			if (
				responseQueue.length + (active?.lane === "response" ? 1 : 0) >=
					CODEX_APP_SERVER_CAPACITY.outbound.responseReservedFrames ||
				responseQueuedBytes + (active?.lane === "response" ? active.bytes : 0) + bytes >
					CODEX_APP_SERVER_CAPACITY.outbound.responseReservedBytes
			) {
				throw new CodexTransportWriteError(
					"backpressure",
					`the response reserve is limited to ${CODEX_APP_SERVER_CAPACITY.outbound.responseReservedFrames} frames and ${CODEX_APP_SERVER_CAPACITY.outbound.responseReservedBytes} bytes`,
				);
			}
			responseQueue.push({ job, bytes });
			responseQueuedBytes += bytes;
		} else {
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
		}
		pump();
	};

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

	const drop = (keep: (job: FrameWriterJob<T>) => boolean, reason: unknown): void => {
		dropQueue(responseQueue, "response", keep, reason);
		dropQueue(regularQueue, "regular", keep, reason);
		pump();
	};

	const dispose = (): void => {
		if (disposed) {
			return;
		}
		disposed = true;
		stdin.removeListener("drain", onDrain);
	};

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

	return Object.freeze({
		enqueue,
		remove,
		drop,
		abort,
		dispose,
		inspect: () =>
			Object.freeze({
				queuedFrames: regularQueue.length,
				queuedBytes: regularQueuedBytes,
				responseQueuedFrames: responseQueue.length + (active?.lane === "response" ? 1 : 0),
				responseQueuedBytes: responseQueuedBytes + (active?.lane === "response" ? active.bytes : 0),
				writeInFlight: active !== undefined,
			}),
	});
}

export {
	type FrameWriterLane,
	type FrameWriterJob,
	type FrameWriterCallbacks,
	type FrameWriter,
	createFrameWriter,
};
