// The branches of C#'s conditional compilation that the check reads (ADR
// 0046). Tree-sitter reads every branch of an `#if` as code, so two branches
// that each hold half a statement, such as two `if (...)` lines before one
// block, put the whole file in a part that did not parse: one `#else` in
// System.CommandLine's `Argument{T}.cs` hid all of its 133 lines. The check
// reads the first branch of each `#if`, one configuration the compiler builds,
// as straight code: it blanks every `#elif` and `#else` branch and the
// directives themselves to spaces, so every line keeps its place. The check
// evaluates no condition.

/** A directive of conditional compilation, by its word. */
const DIRECTIVE = /^\s*#\s*(if|elif|else|endif)\b/u;

/** One `#if` the scan is inside: whether it has passed its first branch. */
interface Conditional {
	past: boolean;
}

/**
 * Whether the scan is in a branch it blanks: a later branch of any `#if` it is inside.
 * @param open The `#if`s the scan is inside, outermost first.
 * @returns True when one of them has passed its first branch.
 */
function blanking(open: readonly Conditional[]): boolean {
	return open.some((conditional) => conditional.past);
}

/**
 * Follow one directive.
 * @param word The directive's word.
 * @param open The `#if`s the scan is inside, which this changes.
 */
function follow(word: string, open: Conditional[]): void {
	if (word === "if") open.push({ past: false });
	else if (word === "endif") open.pop();
	else {
		const innermost = open.at(-1);
		if (innermost !== undefined) innermost.past = true;
	}
}

/**
 * A line of spaces as long as a line.
 * @param line The line.
 * @returns The blank line, keeping a carriage return.
 */
function blank(line: string): string {
	return line.replace(/[^\r]/gu, " ");
}

/**
 * A C# file's text with only the first branch of each `#if` left, as code.
 * @param text The text.
 * @returns The text, with the directives and every other branch blanked line by line.
 */
function firstBranches(text: string): string {
	if (!text.includes("#")) return text;
	const open: Conditional[] = [];
	return text
		.split("\n")
		.map((line) => {
			const word = DIRECTIVE.exec(line)?.[1];
			if (word !== undefined) follow(word, open);
			return word !== undefined || blanking(open) ? blank(line) : line;
		})
		.join("\n");
}

export { firstBranches };
