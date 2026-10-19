// The branches of C#'s conditional compilation that the check reads (ADR
// 0046). Tree-sitter reads every branch of an `#if` as code, so two branches
// that each hold half a statement, such as two `if (...)` lines before one
// block, put the whole file in a part that did not parse: one `#else` in
// System.CommandLine's `Argument{T}.cs` hid all of its 133 lines. The check
// reads the first branch of each `#if`, one configuration the compiler builds,
// as straight code: it blanks every `#elif` and `#else` branch and the
// directives themselves to spaces, so every line keeps its place. The check
// evaluates no condition.
//
// A blanked branch is code the check did not read, as a part that did not
// parse is: it holds no facts, but the names written there are kept, so a
// symbol that only a later branch holds is skipped, never reported missing.

import type { Unparsed } from "#runtime/operations/code-facts/facts.ts";

/** A directive of conditional compilation, by its word. */
const DIRECTIVE = /^\s*#\s*(if|elif|else|endif)\b/u;

/** A whole word, as the text reading spells one. */
const WORD = /[\p{L}\p{N}_$]+/gu;

/** One `#if` the scan is inside: whether it has passed its first branch. */
interface Conditional {
	past: boolean;
}

/** A C# file's text as the check reads it, and the branches it blanked. */
interface FirstBranches {
	readonly text: string;
	readonly blanked: readonly Unparsed[];
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
	return line.replace(/[^\r]/gu, (character) => " ".repeat(character.length));
}

/**
 * The runs of blanked code lines, each with the names written there.
 * @param lines Each line, and whether it is code the scan blanked.
 * @returns The runs; a directive ends a run and is in none.
 */
function blankedRuns(
	lines: readonly { readonly text: string; readonly code: boolean }[],
): Unparsed[] {
	const runs: Unparsed[] = [];
	let run: { start: number; names: Set<string> } | undefined;
	lines.forEach(({ text, code }, index) => {
		if (!code) {
			if (run !== undefined) runs.push({ start: run.start, end: index, names: [...run.names] });
			run = undefined;
			return;
		}
		run ??= { start: index + 1, names: new Set() };
		for (const name of text.match(WORD) ?? []) run.names.add(name);
	});
	if (run !== undefined) runs.push({ start: run.start, end: lines.length, names: [...run.names] });
	return runs.filter((each) => each.names.length > 0);
}

/**
 * A C# file's text with only the first branch of each `#if` left, as code.
 * @param text The text.
 * @returns The text, with the directives and every other branch blanked line
 * by line, and the blanked branches with the names written there.
 */
function firstBranches(text: string): FirstBranches {
	if (!text.includes("#")) return { text, blanked: [] };
	const open: Conditional[] = [];
	const lines = text.split("\n").map((line) => {
		const word = DIRECTIVE.exec(line)?.[1];
		if (word !== undefined) follow(word, open);
		return { text: line, directive: word !== undefined, blanked: blanking(open) };
	});
	return {
		text: lines
			.map((line) => (line.directive || line.blanked ? blank(line.text) : line.text))
			.join("\n"),
		blanked: blankedRuns(
			lines.map((line) => ({ text: line.text, code: line.blanked && !line.directive })),
		),
	};
}

export { firstBranches };
