// The parts of a file that did not parse (ADR 0046). Such a part holds no
// facts, but the names written there are kept, so a symbol found only there
// is skipped, never reported missing. Every grammar marks them with `ERROR`
// nodes, and tree-sitter recovers and parses the rest of the file.

import type { Node } from "web-tree-sitter";
import type { Unparsed } from "@/runtime/code-facts/lib/facts";

/** A whole word, as the text reading spells one. */
const WORD = /[\p{L}\p{N}_$]+/gu;

/**
 * Whether an error node lies inside another one.
 * @param node The error node.
 * @returns True when an ancestor is an error node too.
 */
function insideAnotherError(node: Node): boolean {
	for (let at = node.parent; at !== null; at = at.parent) if (at.type === "ERROR") return true;
	return false;
}

/**
 * The parts of a file that did not parse, with the names written there.
 * @param nodes The error nodes, nested or not.
 * @returns One entry per outermost error node.
 */
function unparsedOf(nodes: readonly Node[]): Unparsed[] {
	return nodes
		.filter((node) => !insideAnotherError(node))
		.map((node) => ({
			start: node.startPosition.row + 1,
			end: node.endPosition.row + 1,
			names: [...new Set(node.text.match(WORD) ?? [])],
		}));
}

export { unparsedOf };
