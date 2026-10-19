// Where on its line a use stands, so a server can be asked about it.
//
// Code facts give a use as its spelling and its line, never a column, because
// a fact quotes names and lines only. The column is found again in the line:
// the spelling as the code writes it, its names joined by `.` or by C++'s
// `::`, and written through `.`, `?.`, `!.`, `::` or `->` with any space
// between, and the position of its last name, which is the name the server
// resolves. A chain that breaks across lines holds only its last name on the
// line of the use, so the last name alone, as a whole word, is the fallback.
// An Objective-C selector such as `post:by:` is never written as one word:
// a send writes `post:1 by:2`, so a selector stands where its first part
// does, followed by its colon. A use on a line that holds neither is not
// asked about.

import type { Position } from "#runtime/processes/language-servers/server.ts";

/** A character that can continue a name in the languages the servers read. */
const NAME_CHARACTER = String.raw`[\p{L}\p{N}_$]`;

/** What stands between two names of a chain. */
const BETWEEN = String.raw`\s*(?:[?!]?\.|::|->)\s*`;

/**
 * A name as a pattern: a selector as its first part and its colon, any other
 * name as itself.
 * @param name The name.
 * @returns The pattern's source.
 */
function written(name: string): string {
	const [first = name] = name.includes(":") ? name.split(":") : [name];
	const escaped = first.replaceAll(/[.*+?^${}()|[\]\\]/gu, String.raw`\$&`);
	return name.includes(":") ? `${escaped}(?=\\s*:)` : `${escaped}(?!${NAME_CHARACTER})`;
}

/**
 * A pattern that matches names as whole words.
 * @param names The names, in order.
 * @returns The pattern.
 */
function wholeWords(names: readonly string[]): RegExp {
	return new RegExp(`(?<!${NAME_CHARACTER})${names.map(written).join(BETWEEN)}`, "u");
}

/**
 * The length of the last name as it stands on the line.
 * @param name The name.
 * @returns Its length: a selector's first part only.
 */
function writtenLength(name: string): number {
	return name.includes(":") ? (name.split(":")[0] ?? "").length : name.length;
}

/**
 * The position of the last name of a spelling on its line.
 * @param text The file's text.
 * @param line The line of the use, from 1.
 * @param symbol The spelling, its names joined by `.` or `::`.
 * @returns The position, as the protocol counts, or undefined when the line holds neither.
 */
function positionOf(text: string, line: number, symbol: string): Position | undefined {
	const writtenLine = text.split("\n")[line - 1];
	const names = symbol.split(/\.|::/u);
	const last = names.at(-1) ?? symbol;
	if (writtenLine === undefined || writtenLength(last) === 0) return undefined;
	const match = wholeWords(names).exec(writtenLine) ?? wholeWords([last]).exec(writtenLine);
	if (match === null) return undefined;
	return { line: line - 1, character: match.index + match[0].length - writtenLength(last) };
}

export { positionOf };
