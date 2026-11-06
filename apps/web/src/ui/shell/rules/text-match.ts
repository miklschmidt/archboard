// Finding what a person typed in a name: case and accents do not matter, and
// the first place it occurs is the one the row marks. Pure.

/** Where a query was found in a text, in the text's own indices. */
interface TextRange {
	readonly start: number;
	readonly end: number;
}

/**
 * A text folded for matching: lower case, accents taken off. Each folded
 * character stays at its source index, because an accent is its own code point
 * after NFD and is dropped whole.
 * @param text The text.
 * @returns The folded characters and the source index of each.
 */
function fold(text: string): { readonly folded: string; readonly sources: readonly number[] } {
	let folded = "";
	const sources: number[] = [];
	for (let index = 0; index < text.length; index += 1) {
		const plain = (text[index] ?? "").normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
		for (const character of plain) {
			folded += character;
			sources.push(index);
		}
	}
	return { folded, sources };
}

/**
 * A query folded the way texts are.
 * @param query What the person typed.
 * @returns The folded query, trimmed.
 */
function foldQuery(query: string): string {
	return fold(query.trim()).folded;
}

/**
 * Where a folded query first occurs in a text.
 * @param text The text.
 * @param query The query, already folded; an empty one matches nothing.
 * @returns The range in the text, or null.
 */
function matchIn(text: string, query: string): TextRange | null {
	if (query.length === 0) return null;
	const { folded, sources } = fold(text);
	const at = folded.indexOf(query);
	if (at < 0) return null;
	const start = sources[at] ?? 0;
	const last = sources[at + query.length - 1] ?? start;
	return { start, end: last + 1 };
}

export { foldQuery, matchIn, type TextRange };
