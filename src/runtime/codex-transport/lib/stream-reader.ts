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

/** Install bounded stdout framing and an independently flowing stderr drain. */
function attachCodexStreamReader(
	stdout: Readable,
	stderr: Readable,
	handlers: StreamReaderHandlers,
): StreamReaderAttachment {
	let stdoutBuffer = Buffer.alloc(0);
	let disposed = false;
	let stdoutFinished = false;
	let failed = false;

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

	const consumeStdout = (chunk: unknown): void => {
		if (disposed || failed) {
			return;
		}
		const { buffer } = toBuffer(chunk);
		let offset = 0;
		while (offset < buffer.byteLength) {
			const newline = buffer.indexOf(0x0a, offset);
			if (newline < 0) {
				const tail = buffer.subarray(offset);
				if (
					stdoutBuffer.byteLength + tail.byteLength >
					CODEX_APP_SERVER_CAPACITY.partialFrameBytes
				) {
					failOversized();
				} else {
					stdoutBuffer = Buffer.concat([stdoutBuffer, tail]);
				}
				return;
			}
			const part = buffer.subarray(offset, newline);
			const complete = stdoutBuffer.byteLength + part.byteLength;
			if (complete > CODEX_APP_SERVER_CAPACITY.partialFrameBytes) {
				failOversized();
				return;
			} else {
				let line = Buffer.concat([stdoutBuffer, part]);
				if (line.at(-1) === 0x0d) {
					line = line.subarray(0, line.byteLength - 1);
				}
				handlers.onLine(line);
				stdoutBuffer = Buffer.alloc(0);
			}
			offset = newline + 1;
		}
	};

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
