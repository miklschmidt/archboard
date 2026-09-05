const REDACTION_MARKER = "[REDACTED]";
const MIN_SECRET_LENGTH = 1;

interface BoundedCodexDiagnostics {
	/** Public diagnostics are redacted before they cross the process boundary. */
	readonly redacted: true;
	readonly text: string;
	readonly byteLength: number;
	readonly totalBytes: number;
	readonly truncated: boolean;
	readonly droppedBytes: number;
}

interface CodexDiagnosticsBuffer {
	/** Append raw bytes; only bounded committed redacted bytes become observable via snapshot. */
	readonly append: (chunk: Readonly<Uint8Array> | string) => void;
	/** Commit the bounded redacted carry when the owning child reaches a terminal boundary. */
	readonly finalize: () => void;
	readonly redact: (text: string) => string;
	readonly snapshot: () => BoundedCodexDiagnostics;
}

function uniqueSecrets(secrets: readonly string[]): readonly string[] {
	return Object.freeze(
		[...new Set(secrets.filter((secret) => secret.length >= MIN_SECRET_LENGTH))].toSorted(
			(left, right) => right.length - left.length,
		),
	);
}

function matchingSecret(prefix: string, secrets: readonly string[]): string | undefined {
	for (const candidate of secrets) {
		if (prefix.startsWith(candidate)) {
			return candidate;
		}
	}
	return undefined;
}

function createRedactor(secrets: readonly string[]): {
	readonly append: (text: string) => string;
	readonly finalize: () => string;
	readonly preview: () => string;
	readonly redact: (text: string) => string;
} {
	const knownSecrets = uniqueSecrets(secrets);
	const maxSecretLength = knownSecrets.reduce(
		(longest, secret) => Math.max(longest, secret.length),
		0,
	);
	let pending = "";

	const redact = (text: string): string => {
		let redacted = text;
		for (const secret of knownSecrets) {
			redacted = redacted.split(secret).join(REDACTION_MARKER);
		}
		return redacted;
	};

	const append = (text: string): string => {
		pending += text;
		let stable = "";
		if (maxSecretLength === 0) {
			stable = pending;
			pending = "";
			return stable;
		}
		while (pending.length > 0) {
			const secret = matchingSecret(pending, knownSecrets);
			if (secret !== undefined) {
				stable += REDACTION_MARKER;
				pending = pending.slice(secret.length);
				continue;
			}
			if (pending.length < maxSecretLength) {
				break;
			}
			stable += pending[0];
			pending = pending.slice(1);
		}
		return stable;
	};
	const finalize = (): string => {
		const stable = redact(pending);
		pending = "";
		return stable;
	};

	return Object.freeze({
		append,
		finalize,
		preview: () => redact(pending),
		redact,
	});
}

function copyPrefix(text: string, limitBytes: number): Buffer {
	const bytes = Buffer.from(text, "utf8");
	let end = Math.min(bytes.byteLength, limitBytes);
	while (end > 0 && end < bytes.byteLength) {
		const byte = bytes[end];
		if (byte === undefined || (byte & 0xc0) !== 0x80) {
			break;
		}
		end -= 1;
	}
	return Buffer.from(bytes.subarray(0, end));
}

function createCodexDiagnosticsBuffer(
	limitBytes: number,
	secrets: readonly string[] = [],
): CodexDiagnosticsBuffer {
	if (!Number.isInteger(limitBytes) || limitBytes < 1) {
		throw new Error(
			`Codex stderr diagnostic limit must be a positive integer, received ${limitBytes}.`,
		);
	}
	const redactor = createRedactor(secrets);
	const chunks: Buffer[] = [];
	let retainedBytes = 0;
	let totalBytes = 0;
	let redactedBytes = 0;

	const commit = (text: string): void => {
		const bytes = Buffer.byteLength(text, "utf8");
		redactedBytes += bytes;
		if (retainedBytes >= limitBytes || bytes === 0) {
			return;
		}
		const retained = copyPrefix(text, limitBytes - retainedBytes);
		if (retained.byteLength === 0) {
			return;
		}
		chunks.push(retained);
		retainedBytes += retained.byteLength;
	};

	const append = (chunk: Readonly<Uint8Array> | string): void => {
		const bytes =
			typeof chunk === "string" ? Buffer.from(chunk, "utf8") : Buffer.from(new Uint8Array(chunk));
		const text = bytes.toString("utf8");
		totalBytes += bytes.byteLength;
		commit(redactor.append(text));
	};

	const finalize = (): void => {
		const stable = redactor.finalize();
		commit(stable);
	};

	const snapshot = (): BoundedCodexDiagnostics => {
		const pending = Buffer.from(redactor.preview(), "utf8");
		const visible = Buffer.allocUnsafe(retainedBytes);
		const completeRedactedBytes = redactedBytes + pending.byteLength;
		let offset = 0;
		for (const chunk of chunks) {
			if (offset >= visible.byteLength) {
				break;
			}
			const amount = Math.min(chunk.byteLength, visible.byteLength - offset);
			chunk.copy(visible, offset, 0, amount);
			offset += amount;
		}
		return Object.freeze({
			redacted: true,
			text: visible.toString("utf8"),
			byteLength: offset,
			totalBytes,
			truncated: totalBytes > offset || completeRedactedBytes > offset,
			droppedBytes: Math.max(0, totalBytes - offset),
		});
	};

	return Object.freeze({ append, finalize, redact: redactor.redact, snapshot });
}

export { createCodexDiagnosticsBuffer };
export type { BoundedCodexDiagnostics, CodexDiagnosticsBuffer };
