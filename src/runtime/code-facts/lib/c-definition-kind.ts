// A C declarator distinguishes a function from a pointer to one. A C++
// lambda directly assigned to a name is callable too (TASK-436.15).

import type { Node } from "web-tree-sitter";
import type { Definition } from "@/runtime/code-facts/lib/facts";

/** Declarators that only wrap the one inside them. */
const WRAPPING = new Set(["parenthesized_declarator", "attributed_declarator"]);

/**
 * Whether a declared name is a function's: the first declarator around it,
 * past parentheses, is a function declarator. A pointer to one is a value.
 * @param name The declared name.
 * @returns True when it is a function.
 */
function namesFunction(name: Node): boolean {
	let around = name.parent;
	while (around !== null && WRAPPING.has(around.type)) around = around.parent;
	return around?.type === "function_declarator";
}

/**
 * Whether a declarator names a function or directly holds a C++ lambda.
 * @param name The declared name.
 * @param declarator Its declarator.
 * @returns Its kind.
 */
function declaratorKind(name: Node, declarator: Node): Definition["kind"] {
	return namesFunction(name) || declarator.childForFieldName("value")?.type === "lambda_expression"
		? "function"
		: "value";
}

export { declaratorKind, namesFunction };
