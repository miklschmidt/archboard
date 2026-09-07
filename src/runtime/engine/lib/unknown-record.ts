// Narrowing for values that arrive as `unknown` (a parsed note, a scene from
// the wire) so callers can read fields without asserting a shape they have
// not checked.

/**
 * Whether a value is a non-null object, so its properties can be read by
 * name. Arrays count as records here, as they do for `typeof`; callers that
 * need a plain object test `Array.isArray` first.
 * @param value Anything.
 * @returns True when the value can be indexed by string keys.
 */
function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

/**
 * The string at one key of a record, when it is a string.
 * @param record The record to read.
 * @param key The property to read.
 * @returns The string value, or undefined when absent or not a string.
 */
function stringAt(record: Record<string, unknown>, key: string): string | undefined {
	const value = record[key];
	return typeof value === "string" ? value : undefined;
}

export { isRecord, stringAt };
