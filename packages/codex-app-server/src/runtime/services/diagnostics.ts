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

/**
 * Deduplicate the secrets and order them longest first, so a secret that is a
 * prefix of another never masks only part of the longer one.
 * @param secrets - Secrets supplied by the caller and the ambient environment.
 * @returns The frozen, ordered, non-empty secrets.
 */
function uniqueSecrets(secrets: readonly string[]): readonly string[] {
	return Object.freeze(
		[...new Set(secrets.filter((secret) => secret.length >= MIN_SECRET_LENGTH))].toSorted(
			(left, right) => right.length - left.length,
		),
	);
}

/**
 * Find the first secret the pending text begins with.
 * @param prefix - The unredacted text still held back.
 * @param secrets - Secrets ordered longest first.
 * @returns The matching secret, or undefined when none starts the text.
 */
function matchingSecret(prefix: string, secrets: readonly string[]): string | undefined {
	for (const candidate of secrets) {
		if (prefix.startsWith(candidate)) {
			return candidate;
		}
	}
	return undefined;
}

/**
 * Create a streaming redactor that holds back a tail as long as the longest
 * secret, so a secret split across two chunks is still caught.
 * @param secrets - The secrets to mask.
 * @returns Append, finalize, preview and whole-text redaction operations.
 */
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

	/**
	 * Mask every known secret in a complete piece of text.
	 * @param text - Text that will not be extended later.
	 * @returns The masked text.
	 */
	const redact = (text: string): string => {
		let redacted = text;
		for (const secret of knownSecrets) {
			redacted = redacted.split(secret).join(REDACTION_MARKER);
		}
		return redacted;
	};

	/**
	 * Accept more text and release the prefix that can no longer start a secret.
	 * @param text - The newly arrived text.
	 * @returns The stable, masked prefix that may be committed.
	 */
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

	/**
	 * Release the held-back tail once no more text can arrive.
	 * @returns The masked remainder.
	 */
	const finalize = (): string => {
		const stable = redact(pending);
		pending = "";
		return stable;
	};

	/**
	 * Show the held-back tail masked, without releasing it.
	 * @returns The masked pending text.
	 */
	const preview = (): string => redact(pending);

	return Object.freeze({ append, finalize, preview, redact });
}

/**
 * Copy at most `limitBytes` of UTF-8 without cutting a multi-byte character.
 * @param text - The text to bound.
 * @param limitBytes - The byte budget remaining.
 * @returns The bounded prefix as bytes.
 */
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

/**
 * Retain a bounded, redacted copy of a child's stderr. Bytes past the limit
 * are counted but dropped, so a chatty child cannot grow the owner's memory.
 * @param limitBytes - The maximum retained byte count.
 * @param secrets - Secrets to mask before retention.
 * @returns The buffer's append, finalize, redact and snapshot operations.
 */
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

	/**
	 * Retain masked text up to the byte limit.
	 * @param text - Masked text released by the redactor.
	 */
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

	/**
	 * Accept one raw stderr chunk.
	 * @param chunk - Bytes or text from the child.
	 */
	const append = (chunk: Readonly<Uint8Array> | string): void => {
		const bytes =
			typeof chunk === "string" ? Buffer.from(chunk, "utf8") : Buffer.from(new Uint8Array(chunk));
		const text = bytes.toString("utf8");
		totalBytes += bytes.byteLength;
		commit(redactor.append(text));
	};

	/**
	 * Commit the redactor's held-back tail once the child has closed.
	 */
	const finalize = (): void => {
		const stable = redactor.finalize();
		commit(stable);
	};

	/**
	 * Read the retained diagnostics together with the truncation accounting.
	 * @returns A frozen public view of the retained bytes.
	 */
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
