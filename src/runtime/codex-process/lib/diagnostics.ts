const REDACTION_MARKER = "[REDACTED]";
const MIN_SECRET_LENGTH = 1;

export interface BoundedCodexDiagnostics {
	/** Public diagnostics are redacted before they cross the process boundary. */
	readonly redacted: true;
	readonly text: string;
	readonly byteLength: number;
	readonly totalBytes: number;
	readonly truncated: boolean;
	readonly droppedBytes: number;
}

export interface CodexDiagnosticsBuffer {
	/** Append raw bytes and return only their redacted form for classification. */
	readonly append: (chunk: Uint8Array | string) => string;
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

function createRedactor(secrets: readonly string[]): {
	readonly append: (text: string) => { readonly stable: string; readonly visible: string };
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
		for (const secret of knownSecrets) redacted = redacted.split(secret).join(REDACTION_MARKER);
		return redacted;
	};

	const append = (text: string): { readonly stable: string; readonly visible: string } => {
		const previousPending = pending;
		pending += text;
		let stable = "";
		if (maxSecretLength === 0) {
			stable = pending;
			pending = "";
			return { stable, visible: redact(previousPending + text) };
		}
		while (pending.length > 0) {
			const secret = knownSecrets.find((candidate) => pending.startsWith(candidate));
			if (secret !== undefined) {
				stable += REDACTION_MARKER;
				pending = pending.slice(secret.length);
				continue;
			}
			if (pending.length < maxSecretLength) break;
			stable += pending[0];
			pending = pending.slice(1);
		}
		return { stable, visible: redact(previousPending + text) };
	};

	return Object.freeze({
		append,
		preview: () => redact(pending),
		redact,
	});
}

function copyPrefix(text: string, limitBytes: number): Buffer {
	const bytes = Buffer.from(text, "utf8");
	const retained = Buffer.allocUnsafe(Math.min(bytes.byteLength, limitBytes));
	bytes.copy(retained);
	return retained;
}

export function createCodexDiagnosticsBuffer(
	limitBytes: number,
	secrets: readonly string[] = [],
): CodexDiagnosticsBuffer {
	if (!Number.isInteger(limitBytes) || limitBytes < 1)
		throw new Error(
			`Codex stderr diagnostic limit must be a positive integer, received ${limitBytes}.`,
		);
	const redactor = createRedactor(secrets);
	const chunks: Buffer[] = [];
	let retainedBytes = 0;
	let totalBytes = 0;
	let redactedBytes = 0;

	const append = (chunk: Uint8Array | string): string => {
		const bytes = typeof chunk === "string" ? Buffer.from(chunk, "utf8") : Buffer.from(chunk);
		const text = bytes.toString("utf8");
		totalBytes += bytes.byteLength;
		const redacted = redactor.append(text);
		redactedBytes += Buffer.byteLength(redacted.stable, "utf8");
		if (retainedBytes < limitBytes) {
			const retained = copyPrefix(redacted.stable, limitBytes - retainedBytes);
			chunks.push(retained);
			retainedBytes += retained.byteLength;
		}
		return redacted.visible;
	};

	const snapshot = (): BoundedCodexDiagnostics => {
		const carry = Buffer.from(redactor.preview(), "utf8");
		const visible = Buffer.allocUnsafe(Math.min(limitBytes, retainedBytes + carry.byteLength));
		const completeRedactedBytes = redactedBytes + carry.byteLength;
		let offset = 0;
		for (const chunk of chunks) {
			if (offset >= visible.byteLength) break;
			const amount = Math.min(chunk.byteLength, visible.byteLength - offset);
			chunk.copy(visible, offset, 0, amount);
			offset += amount;
		}
		if (offset < visible.byteLength) {
			const amount = Math.min(carry.byteLength, visible.byteLength - offset);
			carry.copy(visible, offset, 0, amount);
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

	return Object.freeze({ append, redact: redactor.redact, snapshot });
}
