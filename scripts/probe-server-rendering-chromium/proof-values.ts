// Value helpers the rendering proof shares: JSON record narrowing, error
// text and the required-field checks proof results are read through.

type JsonRecord = Record<string, unknown>;

/**
 * Whether a value is a plain object usable as a string-keyed record.
 * @param value The value to test.
 * @returns Whether it is a non-null, non-array object.
 */
function isRecord(value: unknown): value is JsonRecord {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * A record member as a record, or undefined when it is anything else.
 * @param record The containing record.
 * @param key The member name.
 * @returns The member, or undefined.
 */
function recordAt(record: JsonRecord, key: string): JsonRecord | undefined {
	const value = record[key];
	return isRecord(value) ? value : undefined;
}

/**
 * The message of a thrown value, whatever it is.
 * @param error The caught value.
 * @returns The error's message, or the value as text.
 */
function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

/**
 * Text for a phase-like value in an error message.
 * @param value The value read from a proof state.
 * @returns The string or number as text, otherwise `unknown`.
 */
function describeValue(value: unknown): string {
	return typeof value === "string" || typeof value === "number" ? String(value) : "unknown";
}

/**
 * The tail of a long text, marked as truncated.
 * @param text The text to shorten.
 * @param limit The maximum number of characters to keep.
 * @returns The text, or its last `limit` characters with a marker.
 */
function snippet(text: string, limit = 4_000): string {
	return text.length <= limit ? text : `${text.slice(-limit)}\n[truncated]`;
}

/**
 * A record member that must be an object.
 * @param record The containing record.
 * @param key The member name.
 * @returns The member as a record.
 * @throws {Error} When the member is absent or not an object.
 */
function requireRecord(record: JsonRecord, key: string): JsonRecord {
	const found = recordAt(record, key);
	if (!found) {
		throw new Error(`Proof result has no ${key} object.`);
	}
	return found;
}

/**
 * Refuse anything but `true`.
 * @param value The value to test.
 * @param message The error message when it is not `true`.
 * @throws {Error} When the value is not `true`.
 */
function requireBoolean(value: unknown, message: string): void {
	if (value !== true) {
		throw new Error(message);
	}
}

/**
 * Refuse anything but a finite number.
 * @param value The value to test.
 * @param message The error message when it is not a finite number.
 * @returns The number.
 * @throws {Error} When the value is not a finite number.
 */
function requireNumber(value: unknown, message: string): number {
	if (typeof value !== "number" || !Number.isFinite(value)) {
		throw new Error(message);
	}
	return value;
}

/**
 * Refuse anything but a lowercase hex SHA-256 digest.
 * @param value The value to test.
 * @param message The error message when it is not a digest.
 * @returns The digest.
 * @throws {Error} When the value is not a 64-character hex string.
 */
function requireSha256(value: unknown, message: string): string {
	if (typeof value !== "string" || !/^[0-9a-f]{64}$/.test(value)) {
		throw new Error(message);
	}
	return value;
}

export {
	describeValue,
	errorMessage,
	isRecord,
	recordAt,
	requireBoolean,
	requireNumber,
	requireRecord,
	requireSha256,
	snippet,
	type JsonRecord,
};
