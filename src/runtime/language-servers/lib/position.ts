// Where on its line a use stands, so a server can be asked about it.
//
// Code facts give a use as its spelling and its line, never a column, because
// a fact quotes names and lines only. The column is found again in the line:
// the spelling as the code writes it, through `.`, `?.` or `!.` with any
// space between, and the position of its last name, which is the name the
// server resolves. A chain that breaks across lines holds only its last name
// on the line of the use, so the last name alone, as a whole word, is the
// fallback. A use on a line that holds neither is not asked about.

import type { Position } from "@/runtime/language-servers/lib/server";

/** A character that can continue a name in the languages the servers read. */
const NAME_CHARACTER = String.raw`[\p{L}\p{N}_$]`;

/** What stands between two names of a chain. */
const BETWEEN = String.raw`\s*[?!]?\.\s*`;

/**
 * A pattern that matches names as whole words.
 * @param names The names, in order.
 * @returns The pattern.
 */
function wholeWords(names: readonly string[]): RegExp {
	const escaped = names.map((name) => name.replaceAll(/[.*+?^${}()|[\]\\]/gu, String.raw`\$&`));
	return new RegExp(`(?<!${NAME_CHARACTER})${escaped.join(BETWEEN)}(?!${NAME_CHARACTER})`, "u");
}

/**
 * The position of the last name of a spelling on its line.
 * @param text The file's text.
 * @param line The line of the use, from 1.
 * @param symbol The spelling, its names joined by `.`.
 * @returns The position, as the protocol counts, or undefined when the line holds neither.
 */
function positionOf(text: string, line: number, symbol: string): Position | undefined {
	const written = text.split("\n")[line - 1];
	const names = symbol.split(".");
	const last = names.at(-1) ?? symbol;
	if (written === undefined || last === "") return undefined;
	const match = wholeWords(names).exec(written) ?? wholeWords([last]).exec(written);
	if (match === null) return undefined;
	return { line: line - 1, character: match.index + match[0].length - last.length };
}

export { positionOf };
