/** Any JSON object, which is what DevTools and the renderer page exchange. */
type JsonRecord = Record<string, unknown>;

/**
 * Whether a value is a JSON object that can be read by key.
 * @param value Anything the renderer or DevTools returned.
 * @returns True for a non-null, non-array object.
 */
function isJsonRecord(value: unknown): value is JsonRecord {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** A board render that failed, naming the phase it failed in. */
class BoardRendererError extends Error {
	readonly code = "BOARD_RENDERER_FAILED";

	/**
	 * Name a renderer failure with everything needed to act on it: what failed,
	 * where in the renderer's life it failed, and what the page said meanwhile.
	 * @param message What failed.
	 * @param phase Which phase it failed in.
	 * @param diagnostics The last console and network events, when there are any.
	 * @param cause The failure underneath, when there is one.
	 */
	constructor(
		message: string,
		readonly phase: string,
		readonly diagnostics: readonly JsonRecord[] = [],
		cause?: unknown,
	) {
		const causeMessage =
			cause instanceof Error
				? ` Cause: ${cause.message}`
				: cause === undefined
					? ""
					: ` Cause: ${String(cause)}`;
		super(
			`${message} Renderer phase: ${phase}.${
				diagnostics.length > 0 ? ` Diagnostics: ${JSON.stringify(diagnostics.slice(-12))}.` : ""
			}${causeMessage}`,
			cause === undefined ? undefined : { cause },
		);
		this.name = "BoardRendererError";
	}
}

export { BoardRendererError, isJsonRecord };
export type { JsonRecord };
