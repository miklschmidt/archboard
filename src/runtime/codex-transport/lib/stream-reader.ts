import type { Readable } from "node:stream";

import { CODEX_APP_SERVER_CAPACITY } from "@/shared/codex-app-server-capacity";

interface StreamReaderHandlers {
	readonly onLine: (line: Buffer) => void;
	readonly onIssue: (issue: {
		readonly kind: "malformed-frame" | "oversized-frame";
		readonly direction: "stdout";
		readonly detail: string;
	}) => void;
	readonly onFrameTooLarge: () => void;
	readonly onStdoutEnd: () => void;
	readonly onStdoutError: (error: unknown) => void;
	readonly onStderr: (chunk: Buffer, text: string) => void;
	readonly onStderrError: (error: unknown) => void;
}

interface StreamReaderAttachment {
	readonly dispose: () => void;
}

/**
 * Normalises whatever a stream delivers into bytes plus their UTF-8 text.
 * @param chunk The data event payload; streams may hand out strings, Buffers or byte arrays.
 * @returns The bytes and their decoded text.
 */
function toBuffer(chunk: unknown): { readonly buffer: Buffer; readonly text: string } {
	if (typeof chunk === "string") {
		const buffer = Buffer.from(chunk, "utf8");
		return { buffer, text: chunk };
	}
	if (Buffer.isBuffer(chunk)) {
		return { buffer: chunk, text: chunk.toString("utf8") };
	}
	if (chunk instanceof Uint8Array) {
		const buffer = Buffer.from(chunk);
		return { buffer, text: buffer.toString("utf8") };
	}
	const text = String(chunk);
	return { buffer: Buffer.from(text, "utf8"), text };
}

/**
 * Strips the carriage return a CRLF line leaves before its newline.
 * @param line The line bytes without the newline.
 * @returns The line without a trailing carriage return.
 */
function withoutCarriageReturn(line: Buffer): Buffer {
	return line.at(-1) === 0x0d ? line.subarray(0, line.byteLength - 1) : line;
}

/**
 * Installs bounded newline framing on stdout and an independently flowing stderr drain.
 * @param stdout The child's stdout, read as JSON lines.
 * @param stderr The child's stderr, forwarded as diagnostic text.
 * @param handlers What to do with lines, chunks, ends and faults.
 * @returns A handle that detaches every listener once.
 */
function attachCodexStreamReader(
	stdout: Readable,
	stderr: Readable,
	handlers: StreamReaderHandlers,
): StreamReaderAttachment {
	let stdoutBuffer = Buffer.alloc(0);
	let disposed = false;
	let stdoutFinished = false;
	let failed = false;

	/** Reports the first over-long line and stops reading; the transport closes on it. */
	const failOversized = (): void => {
		if (disposed || failed) {
			return;
		}
		failed = true;
		stdoutBuffer = Buffer.alloc(0);
		handlers.onIssue({
			kind: "oversized-frame",
			direction: "stdout",
			detail: `A stdout line exceeded ${CODEX_APP_SERVER_CAPACITY.partialFrameBytes} bytes`,
		});
		handlers.onFrameTooLarge();
	};

	/**
	 * Keeps a chunk's trailing partial line for the next chunk, within the partial-frame bound.
	 * @param tail The bytes after the last newline.
	 */
	const retainPartial = (tail: Buffer): void => {
		if (stdoutBuffer.byteLength + tail.byteLength > CODEX_APP_SERVER_CAPACITY.partialFrameBytes) {
			failOversized();
		} else {
			stdoutBuffer = Buffer.concat([stdoutBuffer, tail]);
		}
	};

	/**
	 * Completes a line from the retained partial plus the bytes up to a newline.
	 * @param part The bytes of the current chunk before the newline.
	 * @returns False when the completed line breached the bound and reading stopped.
	 */
	const completeLine = (part: Buffer): boolean => {
		if (stdoutBuffer.byteLength + part.byteLength > CODEX_APP_SERVER_CAPACITY.partialFrameBytes) {
			failOversized();
			return false;
		}
		handlers.onLine(withoutCarriageReturn(Buffer.concat([stdoutBuffer, part])));
		stdoutBuffer = Buffer.alloc(0);
		return true;
	};

	/**
	 * Splits a stdout chunk into complete lines, retaining any trailing partial line.
	 * @param chunk The data event payload.
	 */
	const consumeStdout = (chunk: unknown): void => {
		if (disposed || failed) {
			return;
		}
		const { buffer } = toBuffer(chunk);
		let offset = 0;
		while (offset < buffer.byteLength) {
			const newline = buffer.indexOf(0x0a, offset);
			if (newline < 0) {
				retainPartial(buffer.subarray(offset));
				return;
			}
			if (!completeLine(buffer.subarray(offset, newline))) {
				return;
			}
			offset = newline + 1;
		}
	};

	/** Reports a dangling partial frame, then tells the transport stdout is over. */
	const finishStdout = (): void => {
		if (disposed || stdoutFinished) {
			return;
		}
		stdoutFinished = true;
		if (failed) {
			return;
		}
		if (stdoutBuffer.byteLength > 0) {
			handlers.onIssue({
				kind: "malformed-frame",
				direction: "stdout",
				detail: "Codex stdout ended with a partial frame",
			});
		}
		stdoutBuffer = Buffer.alloc(0);
		handlers.onStdoutEnd();
	};

	/**
	 * Forwards a stderr chunk as bytes and text.
	 * @param chunk The data event payload.
	 */
	const onStderrData = (chunk: unknown): void => {
		if (disposed) {
			return;
		}
		const { buffer, text } = toBuffer(chunk);
		handlers.onStderr(buffer, text);
	};

	stdout.on("data", consumeStdout);
	stdout.on("error", handlers.onStdoutError);
	stdout.on("end", finishStdout);
	stdout.on("close", finishStdout);

	const onStderrError = handlers.onStderrError;
	stderr.on("data", onStderrData);
	stderr.on("error", onStderrError);

	/** Removes every listener this attachment installed; later calls do nothing. */
	const dispose = (): void => {
		if (disposed) {
			return;
		}
		disposed = true;
		stdout.removeListener("data", consumeStdout);
		stdout.removeListener("error", handlers.onStdoutError);
		stdout.removeListener("end", finishStdout);
		stdout.removeListener("close", finishStdout);
		stderr.removeListener("data", onStderrData);
		stderr.removeListener("error", onStderrError);
	};

	return Object.freeze({ dispose });
}

export { type StreamReaderHandlers, type StreamReaderAttachment, attachCodexStreamReader };
