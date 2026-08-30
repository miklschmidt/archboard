import type { Writable } from "node:stream";

import { CodexTransportWriteError } from "./errors.js";
import { CODEX_TRANSPORT_MAX_QUEUED_BYTES, CODEX_TRANSPORT_MAX_QUEUED_FRAMES } from "./limits.js";

export interface FrameWriterJob<T> {
	readonly frame: Buffer;
	readonly value: T;
}

export interface FrameWriterCallbacks<T> {
	readonly onAccepted?: (job: FrameWriterJob<T>) => void;
	readonly onComplete: (job: FrameWriterJob<T>) => void;
	readonly onError: (job: FrameWriterJob<T>, error: Error, writeReturned: boolean) => void;
	readonly onDrop: (job: FrameWriterJob<T>, reason: unknown) => void;
	readonly onIdle: () => void;
}

export interface FrameWriter<T> {
	readonly enqueue: (job: FrameWriterJob<T>) => void;
	readonly remove: (job: FrameWriterJob<T>) => boolean;
	readonly drop: (keep: (job: FrameWriterJob<T>) => boolean, reason: unknown) => void;
	readonly abort: (reason: unknown) => void;
	readonly inspect: () => {
		readonly queuedFrames: number;
		readonly queuedBytes: number;
		readonly writeInFlight: boolean;
	};
}

interface ActiveWrite<T> {
	readonly job: FrameWriterJob<T>;
	callbackCalled: boolean;
	callbackError?: Error;
	writeReturned: boolean;
	needsDrain: boolean;
	drainSeen: boolean;
}

export function createFrameWriter<T>(
	stdin: Writable,
	callbacks: FrameWriterCallbacks<T>,
): FrameWriter<T> {
	const queue: FrameWriterJob<T>[] = [];
	let queuedBytes = 0;
	let active: ActiveWrite<T> | undefined;
	let broken = false;

	const rejectQueued = (reason: unknown): void => {
		while (queue.length > 0) {
			const job = queue.shift();
			if (!job) continue;
			queuedBytes -= job.frame.byteLength;
			callbacks.onDrop(job, reason);
		}
	};

	const pump = (): void => {
		if (broken || active !== undefined) return;
		const job = queue.shift();
		if (!job) {
			callbacks.onIdle();
			return;
		}
		queuedBytes -= job.frame.byteLength;
		const current: ActiveWrite<T> = {
			job,
			callbackCalled: false,
			writeReturned: false,
			needsDrain: false,
			drainSeen: false,
		};
		active = current;

		const complete = (error?: Error): void => {
			if (active !== current) return;
			active = undefined;
			if (error) {
				broken = true;
				callbacks.onError(job, error, current.writeReturned);
				rejectQueued(error);
				return;
			}
			callbacks.onComplete(job);
			pump();
		};
		const tryComplete = (): void => {
			if (active !== current || !current.writeReturned || !current.callbackCalled) return;
			if (current.callbackError) {
				complete(current.callbackError);
				return;
			}
			if (current.needsDrain && !current.drainSeen) return;
			complete();
		};
		try {
			const accepted = stdin.write(job.frame, (error?: Error | null) => {
				current.callbackCalled = true;
				if (error) current.callbackError = error;
				tryComplete();
			});
			current.writeReturned = true;
			callbacks.onAccepted?.(job);
			current.needsDrain = !accepted;
			tryComplete();
		} catch (error) {
			current.writeReturned = false;
			complete(error instanceof Error ? error : new Error(String(error)));
		}
	};

	stdin.on("drain", () => {
		if (!active) return;
		active.drainSeen = true;
		const current = active;
		if (current.writeReturned && current.callbackCalled) {
			if (current.callbackError) {
				active = undefined;
				broken = true;
				callbacks.onError(current.job, current.callbackError, current.writeReturned);
				rejectQueued(current.callbackError);
			} else {
				active = undefined;
				callbacks.onComplete(current.job);
				pump();
			}
		}
	});

	const enqueue = (job: FrameWriterJob<T>): void => {
		if (broken) throw new CodexTransportWriteError("write-error", "the stdin writer is broken");
		if (
			queue.length >= CODEX_TRANSPORT_MAX_QUEUED_FRAMES ||
			queuedBytes + job.frame.byteLength > CODEX_TRANSPORT_MAX_QUEUED_BYTES
		)
			throw new CodexTransportWriteError(
				"backpressure",
				`the write queue is limited to ${CODEX_TRANSPORT_MAX_QUEUED_FRAMES} frames and ${CODEX_TRANSPORT_MAX_QUEUED_BYTES} bytes`,
			);
		queue.push(job);
		queuedBytes += job.frame.byteLength;
		pump();
	};

	const remove = (job: FrameWriterJob<T>): boolean => {
		const index = queue.indexOf(job);
		if (index < 0) return false;
		queue.splice(index, 1);
		queuedBytes -= job.frame.byteLength;
		return true;
	};

	const drop = (keep: (job: FrameWriterJob<T>) => boolean, reason: unknown): void => {
		const retained: FrameWriterJob<T>[] = [];
		for (const job of queue) {
			if (keep(job)) retained.push(job);
			else {
				queuedBytes -= job.frame.byteLength;
				callbacks.onDrop(job, reason);
			}
		}
		queue.length = 0;
		queue.push(...retained);
		pump();
	};

	const abort = (reason: unknown): void => {
		broken = true;
		if (active) {
			const current = active;
			active = undefined;
			callbacks.onDrop(current.job, reason);
		}
		rejectQueued(reason);
	};

	return Object.freeze({
		enqueue,
		remove,
		drop,
		abort,
		inspect: () =>
			Object.freeze({
				queuedFrames: queue.length,
				queuedBytes,
				writeInFlight: active !== undefined,
			}),
	});
}
