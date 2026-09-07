// The canvas's own account of shutting itself down.
//
// A failed start has to prove it left nothing running, and the only thing that
// can say what it owned is the canvas itself. It writes that account down a
// dedicated file descriptor as a line-delimited protocol; this reads it, one
// record at a time, and lets a caller wait for the next one under a deadline.

import type {
	CanvasStartupProtocolEvent,
	CanvasStartupProtocolRecord,
} from "@/shared/canvas-startup-terminal";
import { parseCanvasStartupProtocolRecord } from "@/shared/canvas-startup-terminal";
import type { Readable } from "node:stream";
import { CODEX_COMPOSED_SHUTDOWN_MS, CODEX_TERM_GRACE_MS } from "@/shared/timing/timing";
import { asError } from "@/runtime/engine/lib/thrown-error";

interface FailedCanvasCleanupTiming {
	readonly shutdownDeadlineMs: number;
	readonly applicationGraceMs: number;
	readonly pollMs: number;
}

/**
 * Production policy. Tests replace this function through a preload-only partial mock.
 * @returns The deadline, application grace and poll interval for one failed start.
 */
function failedCanvasCleanupTiming(): FailedCanvasCleanupTiming {
	return Object.freeze({
		shutdownDeadlineMs: CODEX_COMPOSED_SHUTDOWN_MS,
		applicationGraceMs: CODEX_TERM_GRACE_MS,
		pollMs: 25,
	});
}

interface FailedCanvasCleanupProtocol {
	/** Null means no protocol event arrived within this slice of the one cleanup deadline. */
	readonly next: (maxWaitMs: number) => Promise<CanvasStartupProtocolEvent | null>;
}

interface CanvasStartupProtocolReader extends FailedCanvasCleanupProtocol {
	readonly failure: () => Error | null;
	readonly terminalMessage: () => string | null;
	readonly destroy: () => void;
}

interface ProtocolWaiter {
	readonly resolve: (event: CanvasStartupProtocolEvent | null) => void;
	readonly timer: ReturnType<typeof setTimeout>;
}

/**
 * Read the canvas startup protocol off the server's fd 3: one JSON record per
 * line, queued until the cleanup state machine asks for the next event.
 * @param stream The pipe from the spawned server, or null when there is none.
 * @returns The reader the cleanup consumes, with its failure and terminal message.
 */
function createCanvasStartupProtocolReader(stream: Readable | null): CanvasStartupProtocolReader {
	const events: CanvasStartupProtocolEvent[] = [];
	let buffer = "";
	let closed = stream === null;
	let protocolFailure: Error | null = null;
	let message: string | null = null;
	let terminalSeen = false;
	let waiter: ProtocolWaiter | null = null;
	/**
	 * Hand an event to the waiting consumer, or queue it for the next ask.
	 * @param event The parsed event.
	 */
	const push = (event: CanvasStartupProtocolEvent): void => {
		if (waiter !== null) {
			const current = waiter;
			waiter = null;
			clearTimeout(current.timer);
			current.resolve(event);
			return;
		}
		events.push(event);
	};
	/**
	 * Parse one complete line into an event, recording a terminal record's message.
	 * @param line One protocol line without its newline.
	 */
	const consumeLine = (line: string): void => {
		try {
			const record: CanvasStartupProtocolRecord = parseCanvasStartupProtocolRecord(line);
			if (record.kind === "terminal") {
				terminalSeen = true;
				message = record.message;
			}
			push({ kind: "record", record });
		} catch (error) {
			protocolFailure = asError(error);
			push({ kind: "invalid", message: protocolFailure.message });
		}
	};
	/**
	 * Buffer a chunk and consume every complete line in it.
	 * @param chunk What the pipe delivered.
	 */
	const onData = (chunk: Buffer | string): void => {
		buffer += typeof chunk === "string" ? chunk : chunk.toString("utf8");
		let newline = buffer.indexOf("\n");
		while (newline >= 0) {
			const line = buffer.slice(0, newline);
			buffer = buffer.slice(newline + 1);
			consumeLine(line);
			newline = buffer.indexOf("\n");
		}
	};
	/** Mark the pipe closed; closing before a terminal record is a protocol failure. */
	const onClose = (): void => {
		closed = true;
		if (!terminalSeen) {
			protocolFailure = new Error(
				"The canvas startup cleanup protocol closed before terminal proof.",
			);
		}
		push({ kind: "closed" });
	};
	stream?.on("data", onData);
	stream?.once("close", onClose);
	if (stream === null) {
		events.push({ kind: "closed" });
	}
	/**
	 * The next event: queued, closed, or awaited within a bound.
	 * @param maxWaitMs How long to wait for one to arrive.
	 * @returns The event, or null when none arrived in time.
	 */
	const next = (maxWaitMs: number): Promise<CanvasStartupProtocolEvent | null> => {
		const ready = events.shift();
		if (ready !== undefined) {
			return Promise.resolve(ready);
		}
		if (closed) {
			return Promise.resolve({ kind: "closed" });
		}
		if (maxWaitMs <= 0) {
			return Promise.resolve(null);
		}
		if (waiter !== null) {
			return Promise.reject(new Error("The canvas startup cleanup protocol already has a waiter."));
		}
		return new Promise((resolve) => {
			const timer = setTimeout(() => {
				waiter = null;
				resolve(null);
			}, maxWaitMs);
			waiter = { resolve, timer };
		});
	};
	/** Detach from the pipe and release anybody still waiting on it. */
	const destroy = (): void => {
		stream?.off("data", onData);
		stream?.off("close", onClose);
		stream?.destroy();
		if (waiter !== null) {
			const current = waiter;
			waiter = null;
			clearTimeout(current.timer);
			current.resolve(null);
		}
	};
	return {
		/**
		 * The protocol failure seen so far.
		 * @returns The failure, or null while the protocol is intact.
		 */
		failure: () => protocolFailure,
		/**
		 * The message the terminal record carried.
		 * @returns The message, or null before a terminal record.
		 */
		terminalMessage: () => message,
		next,
		destroy,
	};
}

/**
 * Refuse timing that could make the cleanup state machine spin or never
 * finish.
 * @param timing The policy to check.
 * @throws {Error} When a duration is negative, not finite, or would make the
 * grace outlast the deadline it sits inside.
 */
function validateTiming(timing: FailedCanvasCleanupTiming): void {
	for (const [name, value] of Object.entries(timing)) {
		if (!Number.isFinite(value) || value < 0) {
			throw new Error(`Failed canvas cleanup ${name} must be a non-negative finite duration.`);
		}
	}
	if (timing.pollMs <= 0) {
		throw new Error("Failed canvas cleanup pollMs must be greater than zero.");
	}
	if (timing.applicationGraceMs > timing.shutdownDeadlineMs) {
		throw new Error("Failed canvas cleanup application grace cannot exceed its deadline.");
	}
}

export {
	type FailedCanvasCleanupTiming,
	failedCanvasCleanupTiming,
	type FailedCanvasCleanupProtocol,
	type CanvasStartupProtocolReader,
	createCanvasStartupProtocolReader,
	validateTiming,
};
