/** The documented UTF-8 byte bound for every human-readable dynamic response text. */
const RESPONSE_TEXT_MAX_UTF8_BYTES = 512 as const;

interface TruncatedText {
	readonly value: string;
	readonly truncated: boolean;
}

/**
 * Truncate a string to a UTF-8 byte budget on a character boundary, ending a
 * shortened value with an ellipsis, and report whether anything was cut.
 * @param value Text to bound.
 * @param maximum Largest allowed UTF-8 byte length of the result.
 * @returns The bounded text and whether truncation happened.
 */
function truncateUtf8Marked(value: string, maximum: number): TruncatedText {
	if (Buffer.byteLength(value, "utf8") <= maximum) {
		return { value, truncated: false };
	}
	const ellipsis = "…";
	const budget = maximum - Buffer.byteLength(ellipsis, "utf8");
	let result = "";
	for (const character of value) {
		if (Buffer.byteLength(result + character, "utf8") > budget) {
			break;
		}
		result += character;
	}
	return { value: `${result}${ellipsis}`, truncated: true };
}

/**
 * Truncate a string to a UTF-8 byte budget on a character boundary.
 * @param value Text to bound.
 * @param maximum Largest allowed UTF-8 byte length of the result.
 * @returns The bounded text.
 */
function truncateUtf8(value: string, maximum: number): string {
	return truncateUtf8Marked(value, maximum).value;
}

/**
 * Normalize a message for a dynamic response: trim it, substitute a fallback
 * when nothing is left, and bound it to the response text budget.
 * @param value Raw message text.
 * @param fallback Message used when the raw text is blank.
 * @returns The bounded message.
 */
function boundedMessage(value: string, fallback: string): string {
	const normalized = value.trim();
	return truncateUtf8(normalized.length === 0 ? fallback : normalized, RESPONSE_TEXT_MAX_UTF8_BYTES);
}

/**
 * Encode a value as JSON text. Unlike the library signature this admits the
 * `undefined` result that `JSON.stringify` returns for unencodable values, so
 * callers can refuse instead of writing the literal text "undefined".
 * @param value Value to encode.
 * @returns The JSON text, or undefined when the value has no JSON form.
 */
function encodeJsonText(value: unknown): string | undefined {
	return JSON.stringify(value);
}

export {
	RESPONSE_TEXT_MAX_UTF8_BYTES,
	boundedMessage,
	encodeJsonText,
	truncateUtf8,
	truncateUtf8Marked,
	type TruncatedText,
};
