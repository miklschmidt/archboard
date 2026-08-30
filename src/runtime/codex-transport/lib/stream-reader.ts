import type { Readable } from "node:stream";

import { CODEX_TRANSPORT_MAX_STDOUT_BUFFER_BYTES } from "./limits.js";

export interface StreamReaderHandlers {
	readonly onLine: (line: Buffer) => void;
	readonly onIssue: (issue: {
		readonly kind: "malformed-frame" | "oversized-frame";
		readonly direction: "stdout";
		readonly detail: string;
	}) => void;
	readonly onStdoutEnd: () => void;
	readonly onStdoutError: (error: unknown) => void;
	readonly onStderr: (chunk: Buffer, text: string) => void;
	readonly onStderrError: (error: unknown) => void;
}

function toBuffer(chunk: unknown): { readonly buffer: Buffer; readonly text: string } {
	if (typeof chunk === "string") {
		const buffer = Buffer.from(chunk, "utf8");
		return { buffer, text: chunk };
	}
	if (Buffer.isBuffer(chunk)) return { buffer: chunk, text: chunk.toString("utf8") };
	if (chunk instanceof Uint8Array) {
		const buffer = Buffer.from(chunk);
		return { buffer, text: buffer.toString("utf8") };
	}
	const text = String(chunk);
	return { buffer: Buffer.from(text, "utf8"), text };
}

/** Install bounded stdout framing and an independently flowing stderr drain. */
export function attachCodexStreamReader(
	stdout: Readable,
	stderr: Readable,
	handlers: StreamReaderHandlers,
): void {
	let stdoutBuffer = Buffer.alloc(0);
	let discardUntilNewline = false;

	const consumeStdout = (chunk: unknown): void => {
		const { buffer } = toBuffer(chunk);
		let offset = 0;
		while (offset < buffer.byteLength) {
			if (discardUntilNewline) {
				const newline = buffer.indexOf(0x0a, offset);
				if (newline < 0) return;
				discardUntilNewline = false;
				offset = newline + 1;
				continue;
			}
			const newline = buffer.indexOf(0x0a, offset);
			if (newline < 0) {
				const tail = buffer.subarray(offset);
				if (stdoutBuffer.byteLength + tail.byteLength > CODEX_TRANSPORT_MAX_STDOUT_BUFFER_BYTES) {
					stdoutBuffer = Buffer.alloc(0);
					discardUntilNewline = true;
					handlers.onIssue({
						kind: "oversized-frame",
						direction: "stdout",
						detail: `A stdout line exceeded ${CODEX_TRANSPORT_MAX_STDOUT_BUFFER_BYTES} bytes`,
					});
				} else stdoutBuffer = Buffer.concat([stdoutBuffer, tail]);
				return;
			}
			const part = buffer.subarray(offset, newline);
			const complete = stdoutBuffer.byteLength + part.byteLength;
			if (complete > CODEX_TRANSPORT_MAX_STDOUT_BUFFER_BYTES) {
				stdoutBuffer = Buffer.alloc(0);
				handlers.onIssue({
					kind: "oversized-frame",
					direction: "stdout",
					detail: `A stdout line exceeded ${CODEX_TRANSPORT_MAX_STDOUT_BUFFER_BYTES} bytes`,
				});
			} else {
				let line = Buffer.concat([stdoutBuffer, part]);
				if (line.at(-1) === 0x0d) line = line.subarray(0, line.byteLength - 1);
				handlers.onLine(line);
				stdoutBuffer = Buffer.alloc(0);
			}
			offset = newline + 1;
		}
	};

	stdout.on("data", consumeStdout);
	stdout.on("error", handlers.onStdoutError);
	stdout.on("end", () => {
		if (stdoutBuffer.byteLength > 0 || discardUntilNewline)
			handlers.onIssue({
				kind: "malformed-frame",
				direction: "stdout",
				detail: "Codex stdout ended with a partial frame",
			});
		stdoutBuffer = Buffer.alloc(0);
		discardUntilNewline = false;
		handlers.onStdoutEnd();
	});

	stderr.on("data", (chunk: unknown) => {
		const { buffer, text } = toBuffer(chunk);
		handlers.onStderr(buffer, text);
	});
	stderr.on("error", handlers.onStderrError);
}
