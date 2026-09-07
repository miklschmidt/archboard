import {
	SEMANTIC_CONTEXT_ELLIPSIS,
	SEMANTIC_CONTEXT_LIMITS,
} from "@/runtime/codex-semantic-context/lib/limits";

/** A value that may have been shortened to fit a reviewed limit. */
interface BoundedValue<Value> {
	readonly value: Value;
	readonly truncated: boolean;
}

class SemanticContextInputError extends Error {
	readonly field: string;

	/**
	 * Names the context field that failed validation so the adapter that
	 * supplied it can be corrected.
	 * @param field - The dotted path of the offending field.
	 * @param message - What the field must satisfy.
	 */
	constructor(field: string, message: string) {
		super(`${field}: ${message}`);
		this.name = "SemanticContextInputError";
		this.field = field;
	}
}

/**
 * Throws the input error for one field.
 * @param field - The dotted path of the offending field.
 * @param message - What the field must satisfy.
 */
function fail(field: string, message: string): never {
	throw new SemanticContextInputError(field, message);
}

/**
 * UTF-8 size of a string.
 * @param value - The text.
 * @returns The byte count of its UTF-8 encoding.
 */
function byteLength(value: string): number {
	return new TextEncoder().encode(value).byteLength;
}

/** Control characters JSON spells with a two-character escape. */
const JSON_SHORT_ESCAPES: ReadonlySet<number> = new Set([0x08, 0x09, 0x0a, 0x0c, 0x0d]);

/**
 * Whether a one-code-unit character is an unpaired surrogate, which
 * JSON.stringify writes as a six-byte `\uXXXX` escape.
 * @param character - One code point as iterated from a string.
 * @returns True for a lone surrogate.
 */
function isLoneSurrogate(character: string): boolean {
	const codeUnit = character.charCodeAt(0);
	return character.length === 1 && codeUnit >= 0xd800 && codeUnit <= 0xdfff;
}

/**
 * UTF-8 bytes one code point occupies inside a JSON string token.
 * @param character - One code point as iterated from a string.
 * @returns Its encoded size, escapes included.
 */
function jsonStringPayloadBytes(character: string): number {
	const codeUnit = character.charCodeAt(0);
	if (character === '"' || character === "\\") {
		return 2;
	}
	if (codeUnit <= 0x1f) {
		return JSON_SHORT_ESCAPES.has(codeUnit) ? 2 : 6;
	}
	return isLoneSurrogate(character) ? 6 : byteLength(character);
}

/**
 * UTF-8 bytes occupied by JSON.stringify(value), including its quotes.
 * @param value - The text.
 * @returns The encoded size of the JSON string token.
 */
function jsonStringByteLength(value: string): number {
	let bytes = 2;
	for (const character of value) {
		bytes += jsonStringPayloadBytes(character);
	}
	return bytes;
}

/**
 * Whether a string's JSON token fits a byte budget, stopping the count as soon
 * as the budget is exceeded.
 * @param value - The text.
 * @param maximum - The byte budget for the JSON string token.
 * @returns True when the whole token fits.
 */
function fitsJsonUtf8(value: string, maximum: number): boolean {
	let encodedBytes = 2;
	for (const character of value) {
		encodedBytes += jsonStringPayloadBytes(character);
		if (encodedBytes > maximum) {
			return false;
		}
	}
	return true;
}

/**
 * Clips a string by its JSON-encoded UTF-8 size without splitting a code point.
 * @param value - The text.
 * @param maximum - The byte budget for the JSON string token.
 * @returns The text, clipped with an ellipsis when it did not fit.
 */
function clipJsonUtf8(value: string, maximum: number): BoundedValue<string> {
	if (fitsJsonUtf8(value, maximum)) {
		return { value, truncated: false };
	}
	const suffix = SEMANTIC_CONTEXT_ELLIPSIS;
	const suffixBytes = jsonStringByteLength(suffix);
	if (suffixBytes > maximum) {
		return { value: "", truncated: true };
	}
	const kept: string[] = [];
	let encodedBytes = suffixBytes;
	for (const character of value) {
		const characterBytes = jsonStringPayloadBytes(character);
		if (encodedBytes + characterBytes > maximum) {
			break;
		}
		kept.push(character);
		encodedBytes += characterBytes;
	}
	return { value: `${kept.join("")}${suffix}`, truncated: true };
}

/**
 * Validates a feed identity: it is never clipped, only refused, because a
 * clipped feed id would silently name a different feed.
 * @param value - The candidate feed id.
 * @param field - The dotted path used in errors.
 * @returns The feed id unchanged.
 */
function feedIdValue(value: unknown, field: string): string {
	const result = textValue(value, field, SEMANTIC_CONTEXT_LIMITS.cursorBytes);
	if (result.truncated) {
		fail(field, `must not exceed ${SEMANTIC_CONTEXT_LIMITS.cursorBytes} UTF-8 bytes`);
	}
	if (jsonStringByteLength(result.value) > SEMANTIC_CONTEXT_LIMITS.feedIdJsonBytes) {
		fail(
			field,
			`must not exceed ${SEMANTIC_CONTEXT_LIMITS.feedIdJsonBytes} UTF-8 bytes when JSON encoded`,
		);
	}
	return result.value;
}

/**
 * Clips a string to a raw UTF-8 byte budget without splitting a code point.
 * @param value - The text.
 * @param maximum - The byte budget.
 * @returns The text, clipped with an ellipsis when it did not fit.
 */
function clipUtf8(value: string, maximum: number): BoundedValue<string> {
	if (byteLength(value) <= maximum) {
		return { value, truncated: false };
	}
	if (byteLength(SEMANTIC_CONTEXT_ELLIPSIS) > maximum) {
		return { value: "", truncated: true };
	}
	let kept = "";
	for (const character of Array.from(value)) {
		const candidate = `${kept}${character}${SEMANTIC_CONTEXT_ELLIPSIS}`;
		if (byteLength(candidate) > maximum) {
			break;
		}
		kept += character;
	}
	return {
		value: `${kept}${SEMANTIC_CONTEXT_ELLIPSIS}`,
		truncated: true,
	};
}

/**
 * Validates a text field and clips it to its byte budget.
 * @param value - The candidate text.
 * @param field - The dotted path used in errors.
 * @param maximum - The byte budget.
 * @param required - Whether blank text is refused.
 * @returns The clipped text.
 */
function textValue(
	value: unknown,
	field: string,
	maximum: number,
	required = true,
): BoundedValue<string> {
	if (typeof value !== "string") {
		fail(field, "must be a string");
	}
	if (value.includes("\0")) {
		fail(field, "must not contain NUL");
	}
	if (required && value.trim() === "") {
		fail(field, "must not be empty");
	}
	return clipUtf8(value, maximum);
}

/**
 * Validates an optional text field, where null means absent.
 * @param value - The candidate text or null.
 * @param field - The dotted path used in errors.
 * @param maximum - The byte budget.
 * @returns The clipped text, or null.
 */
function nullableTextValue(
	value: unknown,
	field: string,
	maximum: number,
): BoundedValue<string | null> {
	if (value === null) {
		return { value: null, truncated: false };
	}
	const result = textValue(value, field, maximum);
	return { value: result.value, truncated: result.truncated };
}

/**
 * Refuses an identity that is empty, contains NUL, or exceeds the identity
 * byte budget; identities are never clipped because a clipped identity names
 * something else.
 * @param value - The candidate identity.
 * @param field - The dotted path used in errors.
 */
function assertIdentityText(value: string, field: string): void {
	if (value.length === 0) {
		fail(field, "must be a non-empty identity");
	}
	if (value.includes("\0")) {
		fail(field, "must not contain NUL");
	}
	if (byteLength(value) > SEMANTIC_CONTEXT_LIMITS.identityBytes) {
		fail(field, `must not exceed ${SEMANTIC_CONTEXT_LIMITS.identityBytes} UTF-8 bytes`);
	}
}

/**
 * Validates an optional identity, where null and undefined both mean absent.
 * @param value - The candidate identity.
 * @param field - The dotted path used in errors.
 * @returns The identity unchanged, or null.
 */
function identityValue<Identity extends string>(
	value: Identity | null | undefined,
	field: string,
): Identity | null {
	if (value === null || value === undefined) {
		return null;
	}
	if (typeof value !== "string") {
		fail(field, "must be a non-empty identity");
	}
	assertIdentityText(value, field);
	return value;
}

/**
 * Validates an optional non-negative safe integer.
 * @param value - The candidate number or null.
 * @param field - The dotted path used in errors.
 * @returns The number, or null.
 */
function numberValue(value: unknown, field: string): number | null {
	if (value === null) {
		return null;
	}
	if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
		fail(field, "must be a non-negative safe integer or null");
	}
	return value;
}

export {
	type BoundedValue,
	SemanticContextInputError,
	fail,
	byteLength,
	jsonStringByteLength,
	fitsJsonUtf8,
	clipJsonUtf8,
	feedIdValue,
	clipUtf8,
	textValue,
	nullableTextValue,
	assertIdentityText,
	identityValue,
	numberValue,
};
