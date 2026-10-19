// The parts of a C or C++ file that did not parse (ADR 0046, TASK-367.09).
//
// A preprocessor condition the grammar cannot close, such as `#ifndef` around
// a whole file whose `#if` branches each open a brace, makes tree-sitter wrap
// everything after it in one error node, while the declarations inside it
// parse whole: SQLite's `analyze.c` has 1,871 of its 2,013 lines in one. So a
// part that did not parse is a run of pieces of an error node that are not a
// whole construct parsed without an error: a stray name or token, or an error
// node with nothing whole in it. A whole function or declaration inside an
// error node keeps its facts, and the definitions walk into it.

import type { Node } from "web-tree-sitter";
import type { Unparsed } from "#runtime/operations/code-facts/facts.ts";
import type { Span } from "#runtime/operations/code-facts/spans.ts";

/** A whole word, as the text reading spells one. */
const WORD = /[\p{L}\p{N}_$]+/gu;

/** A part that did not parse: its lines and names, and its bytes for testing a name's place. */
type Broken = Unparsed & Span;

/**
 * Whether a piece of an error node parsed whole: a construct with parts and
 * no error inside, or a comment.
 * @param node The piece.
 * @returns True when it did.
 */
function whole(node: Node): boolean {
	return node.type === "comment" || (node.isNamed && node.childCount > 0 && !node.hasError);
}

/**
 * One part that did not parse, from a run of pieces.
 * @param run The pieces, in order.
 * @returns The part.
 */
function brokenOf(run: readonly [Node, ...Node[]]): Broken {
	const first = run[0];
	const last = run.at(-1) ?? first;
	return {
		start: first.startPosition.row + 1,
		end: last.endPosition.row + 1,
		startIndex: first.startIndex,
		endIndex: last.endIndex,
		names: [...new Set(run.flatMap((node) => node.text.match(WORD) ?? []))],
	};
}

/**
 * The parts of one error node that did not parse: each run of its pieces that
 * are neither whole nor hold an error of their own, which is read as its own
 * error node.
 * @param error The error node.
 * @returns The parts.
 */
function brokenIn(error: Node): Broken[] {
	if (error.childCount === 0) return [brokenOf([error])];
	const runs: Node[][] = [[]];
	for (const child of error.children) {
		if (whole(child) || child.hasError) runs.push([]);
		else runs.at(-1)?.push(child);
	}
	return runs.flatMap(([first, ...rest]) =>
		first === undefined ? [] : [brokenOf([first, ...rest])],
	);
}

/**
 * The parts of a file that did not parse.
 * @param errors Every error node of the file, nested or not.
 * @returns The parts, each with the names written there.
 */
function cUnparsedOf(errors: readonly Node[]): Broken[] {
	return errors.flatMap(brokenIn);
}

export { cUnparsedOf };
