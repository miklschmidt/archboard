// The excerpt of a piece of code evidence: the lines round its line in the whole file that the
// file route quotes (ADR 0080). The route sends the whole text, so this rule picks the lines the
// card shows and cuts a long one.

/** How many lines the excerpt shows on each side of the evidence line. */
const CONTEXT_LINES = 3;
/** The characters of a line the excerpt shows; a longer line is cut and ends with `…`. */
const MAX_LINE_CHARACTERS = 240;
/** One line terminator: CRLF, LF or CR. */
const LINE_END = /\r\n|\n|\r/u;

/** The lines of an excerpt and the number of the first of them. */
interface SourceExcerpt {
	readonly first: number;
	readonly lines: readonly string[];
}

/**
 * A line as the excerpt shows it.
 * @param text The line.
 * @returns It, or its first characters and `…` when it is longer than the limit.
 */
function shown(text: string): string {
	const characters = Array.from(text);
	return characters.length > MAX_LINE_CHARACTERS
		? `${characters.slice(0, MAX_LINE_CHARACTERS).join("")}…`
		: text;
}

/**
 * The lines round one line of a text.
 * @param text The whole text of the file.
 * @param line The evidence line, from 1.
 * @returns The excerpt, or null when the text is shorter than the line.
 */
function excerptOf(text: string, line: number): SourceExcerpt | null {
	const all = text.split(LINE_END);
	// A terminator ends the last line and starts no other.
	if (all.at(-1) === "") all.pop();
	if (line > all.length) return null;
	const first = Math.max(1, line - CONTEXT_LINES);
	const last = Math.min(all.length, line + CONTEXT_LINES);
	return { first, lines: all.slice(first - 1, last).map(shown) };
}

export { excerptOf, type SourceExcerpt };
