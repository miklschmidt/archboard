// Split a line of extra command-line arguments, as a workflow input gives it, into words.
// It reads single quotes, double quotes and backslashes, and runs no shell.

/** A word: plain characters, backslash escapes and quoted runs, in any mix. */
const WORD = /(?:[^\s"'\\]|\\.|"(?:\\.|[^"\\])*"|'[^']*')+/gu;

/** One piece of a word that quoting or escaping changes. */
const QUOTED = /"((?:\\.|[^"\\])*)"|'([^']*)'|\\(.)/gu;

/**
 * Split a line into words the way a shell would, without expanding anything.
 * @param line The input, such as `--state "Queued fulfilment" --every-draft`.
 * @returns The words.
 * @throws {Error} When a quote is not closed.
 */
function splitArguments(line: string): string[] {
	const words = line.match(WORD) ?? [];
	if (line.replaceAll(WORD, "").trim() !== "") {
		throw new Error(`The arguments have an unclosed quote: ${line}`);
	}
	return words.map((word) =>
		word.replaceAll(QUOTED, (_whole, double?: string, single?: string, escaped?: string) => {
			if (single !== undefined) return single;
			if (double !== undefined) return double.replaceAll(/\\(["\\$`])/gu, "$1");
			return escaped ?? "";
		}),
	);
}

/**
 * The non-empty trimmed lines of a multi-line input.
 * @param value The input.
 * @returns Its lines.
 */
function inputLines(value: string): string[] {
	return value
		.split("\n")
		.map((line) => line.trim())
		.filter((line) => line !== "");
}

export { inputLines, splitArguments };
