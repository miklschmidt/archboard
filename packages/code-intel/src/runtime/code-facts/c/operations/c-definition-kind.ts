// A C declarator distinguishes a function from a pointer to one. A C++
// lambda directly assigned to a name is callable too (TASK-436.15). A
// constructor, a destructor and an operator are functions C++ calls itself,
// and a type with no function among its members declares nothing a caller
// runs (TASK-646.12).

import type { Node } from "web-tree-sitter";
import type { Definition } from "#runtime/code-facts/operations/facts.ts";

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

/**
 * Whether C++ calls a function itself, and no caller names it: a
 * constructor, `Store::Store`, a destructor, `Store::~Store`, and an
 * operator, `Store::operator==`.
 * @param symbol The function's qualified symbol.
 * @returns True when it does.
 */
function calledByLanguage(symbol: string): boolean {
	const [holder, own = ""] = symbol.split("::").slice(-2);
	return own === holder || own.startsWith("~") || /^operator\W/u.test(own);
}

/**
 * Mark a type definition that declares nothing a caller runs: an enum, and a
 * struct, union or class with no function among its members. Such a type is
 * no class whose methods count, so module depth counts it as a type and
 * never judges it (TASK-646.12).
 * @param definitions The definitions so far, the type's and its members' among them.
 * @param symbol The type's symbol.
 * @param from Where in the definitions the type's own starts.
 */
function markType(definitions: Definition[], symbol: string, from: number): void {
	const added = definitions.slice(from);
	const methods = added.some(
		(each) => each.kind === "function" && each.symbol.startsWith(`${symbol}::`),
	);
	if (methods) return;
	for (const [index, each] of added.entries()) {
		if (each.symbol === symbol) definitions[from + index] = { ...each, type: true };
	}
}

export { calledByLanguage, declaratorKind, markType, namesFunction };
