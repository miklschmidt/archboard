export interface BoundedCodexDiagnostics {
	readonly text: string;
	readonly byteLength: number;
	readonly totalBytes: number;
	readonly truncated: boolean;
	readonly droppedBytes: number;
}

export interface CodexDiagnosticsBuffer {
	readonly append: (chunk: Uint8Array | string) => void;
	readonly snapshot: () => BoundedCodexDiagnostics;
}

export function createCodexDiagnosticsBuffer(limitBytes: number): CodexDiagnosticsBuffer {
	if (!Number.isInteger(limitBytes) || limitBytes < 1)
		throw new Error(
			`Codex stderr diagnostic limit must be a positive integer, received ${limitBytes}.`,
		);
	const chunks: Uint8Array[] = [];
	let retainedBytes = 0;
	let totalBytes = 0;

	const append = (chunk: Uint8Array | string): void => {
		const bytes = typeof chunk === "string" ? Buffer.from(chunk, "utf8") : Buffer.from(chunk);
		totalBytes += bytes.byteLength;
		if (retainedBytes >= limitBytes) return;
		const remaining = limitBytes - retainedBytes;
		const retained = Buffer.allocUnsafe(Math.min(bytes.byteLength, remaining));
		bytes.copy(retained);
		chunks.push(retained);
		retainedBytes += retained.byteLength;
	};

	const snapshot = (): BoundedCodexDiagnostics =>
		Object.freeze({
			text: Buffer.concat(chunks, retainedBytes).toString("utf8"),
			byteLength: retainedBytes,
			totalBytes,
			truncated: totalBytes > retainedBytes,
			droppedBytes: totalBytes - retainedBytes,
		});

	return Object.freeze({ append, snapshot });
}
