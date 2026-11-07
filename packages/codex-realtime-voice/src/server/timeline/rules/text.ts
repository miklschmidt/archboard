// Bounding text for the browser timeline: every value the timeline carries
// is cut to a UTF-8 byte bound here, never refused for being too long.

/** How many parts of one item (message inputs, reasoning parts) are read. */
const TIMELINE_PART_LIMIT = 32;

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

/**
 * As much of a value as fits a byte bound, with an ellipsis where it was cut.
 * Null characters are dropped rather than counted: a value that is nothing but
 * those is empty, and answers with the caller's fallback.
 * @param value The text.
 * @param maximum How many bytes it may take.
 * @param fallback What to say when it carries nothing visible.
 * @returns The bounded text, and whether anything was cut.
 */
function boundedText(
	value: string,
	maximum: number,
	fallback: string,
): { readonly value: string; readonly truncated: boolean } {
	const suffix = "…";
	const characters: { readonly value: string; readonly bytes: number }[] = [];
	let bytes = 0;
	let sawVisible = false;
	let truncated = false;
	for (const character of value) {
		if (character === "\0") {
			continue;
		}
		sawVisible = true;
		const characterBytes = textEncoder.encode(character).byteLength;
		if (bytes + characterBytes > maximum) {
			truncated = true;
			break;
		}
		characters.push({ value: character, bytes: characterBytes });
		bytes += characterBytes;
	}
	if (!sawVisible) {
		return { value: fallback, truncated: false };
	}
	const text = characters.map(({ value: character }) => character).join("");
	if (!truncated) {
		return { value: text, truncated: false };
	}
	return { value: `${trimmedForSuffix(characters, bytes, maximum)}${suffix}`, truncated: true };
}

/**
 * As much of what was kept as leaves room for the ellipsis, dropped one
 * character at a time so a multi-byte one is never cut in half.
 * @param characters What was kept, with each one's byte length.
 * @param keptBytes How many bytes they take.
 * @param maximum The byte bound, ellipsis included.
 * @returns The text that fits.
 */
function trimmedForSuffix(
	characters: { readonly value: string; readonly bytes: number }[],
	keptBytes: number,
	maximum: number,
): string {
	const suffixBytes = textEncoder.encode("…").byteLength;
	let bytes = keptBytes;
	while (characters.length > 0 && bytes + suffixBytes > maximum) {
		bytes -= characters.pop()?.bytes ?? 0;
	}
	return characters.map(({ value: character }) => character).join("");
}

/**
 * One line of text, with every run of whitespace reduced to a single space.
 * @param value The text.
 * @returns The single line.
 */
function normalizedText(value: string): string {
	return value.replace(/\s+/gu, " ").trim();
}

/**
 * One bounded line of text, for a summary the browser shows on one row.
 * @param value The text.
 * @param maximum How many bytes it may take.
 * @returns The bounded line.
 */
function boundedNormalizedText(value: string, maximum: number): string {
	return normalizedText(boundedText(value, maximum, "").value);
}

/**
 * Bounded text that keeps its line breaks, so a heading and a list still read
 * as one: line endings become one kind, and a run of blank lines one.
 * @param value The text.
 * @param maximum How many bytes it may take.
 * @returns The bounded text, trimmed.
 */
function boundedLayoutText(value: string, maximum: number): string {
	return boundedText(value, maximum, "")
		.value.replaceAll(/\r\n?/gu, "\n")
		.replaceAll(/\n{3,}/gu, "\n\n")
		.trim();
}

/**
 * Bounded text, or null when there is nothing visible to carry.
 * @param value The text, when there is any.
 * @param maximum How many bytes it may take.
 * @returns The bounded text, or null.
 */
function optionalBoundedText(value: string | null | undefined, maximum: number): string | null {
	if (value === null || value === undefined) {
		return null;
	}
	const bounded = boundedText(value, maximum, "").value;
	return bounded.length === 0 ? null : bounded;
}

/**
 * Where the character that a byte offset falls in starts, moving forward past
 * UTF-8 continuation bytes so no character is cut in half.
 * @param bytes The encoded text.
 * @param offset The byte offset.
 * @returns The offset of the next whole character.
 */
function characterStart(bytes: Uint8Array, offset: number): number {
	let start = offset;
	while (start < bytes.byteLength && ((bytes[start] ?? 0) & 0xc0) === 0x80) {
		start += 1;
	}
	return start;
}

/**
 * The text without a trailing half of a surrogate pair at its start, which a
 * cut through the middle of the pair leaves behind.
 * @param value The text.
 * @returns The text, starting on a whole character.
 */
function withoutLeadingLowSurrogate(value: string): string {
	const first = value.charCodeAt(0);
	return first >= 0xdc00 && first <= 0xdfff ? value.slice(1) : value;
}

/**
 * As much of the end of a value as fits a byte bound, without null characters.
 * @param value The text.
 * @param maximum How many bytes it may take.
 * @returns The tail, and whether anything before it was cut.
 */
function byteBoundedTail(
	value: string,
	maximum: number,
): { readonly tail: string; readonly truncated: boolean } {
	const cut = value.length > maximum;
	const characters = cut ? withoutLeadingLowSurrogate(value.slice(-maximum)) : value;
	const visible = characters.replaceAll("\0", "");
	const bytes = textEncoder.encode(visible);
	if (bytes.byteLength <= maximum) {
		return { tail: visible, truncated: cut };
	}
	const start = characterStart(bytes, bytes.byteLength - maximum);
	return { tail: textDecoder.decode(bytes.subarray(start)), truncated: true };
}

/**
 * The text from its first whole line on, when a later line starts inside it.
 * @param tail The end of a longer text.
 * @returns The text from a line boundary, or the whole of it.
 */
function fromLineStart(tail: string): string {
	const lineStart = tail.indexOf("\n");
	return lineStart !== -1 && lineStart < tail.length - 1 ? tail.slice(lineStart + 1) : tail;
}

/**
 * The end of a command's output, as much as fits the byte bound, starting at
 * a line boundary when anything before it was cut. Null characters are
 * dropped.
 * @param value The aggregated output, when Codex reported any.
 * @param maximum How many bytes the tail may take.
 * @returns The tail, or null when there is none, and whether anything was cut.
 */
function outputTail(
	value: string | null,
	maximum: number,
): { readonly tail: string | null; readonly truncated: boolean } {
	if (value === null) {
		return { tail: null, truncated: false };
	}
	const bounded = byteBoundedTail(value, maximum);
	const tail = bounded.truncated ? fromLineStart(bounded.tail) : bounded.tail;
	return { tail: tail.length === 0 ? null : tail, truncated: bounded.truncated };
}

export {
	boundedLayoutText,
	boundedNormalizedText,
	boundedText,
	normalizedText,
	optionalBoundedText,
	outputTail,
	textEncoder,
	TIMELINE_PART_LIMIT,
};
