// How TypeScript writes arithmetic (TASK-646.06), for the math a file writes
// around the names it imports (math-shapes.ts): `binary_expression` with
// `**` beside `+ - * / %`, a sign, parentheses, the wrappers of the type
// checker (`as`, `satisfies` and `!`), and the functions of `Math`. A chain of
// names runs through `.`, and a getter is a call that passes nothing. A local
// variable that holds a use whole is a declarator's value, `const base =
// X.restartBase`, or an entry of its object pattern, `const { restartBase } =
// X`, which takes that member of the use.

import type { Node } from "web-tree-sitter";
import type { Local } from "#runtime/code-facts/operations/math-grammar.ts";
import type { MathSyntax } from "#runtime/code-facts/operations/math-shapes.ts";

/**
 * The local variable one entry of an object pattern declares.
 * @param entry The entry.
 * @returns The variable, or none for a default, a rest or a nested pattern.
 */
function patternLocal(entry: Node): Local[] {
	if (entry.type === "shorthand_property_identifier_pattern") return [[entry, `.${entry.text}`]];
	if (entry.type !== "pair_pattern") return [];
	const key = entry.childForFieldName("key");
	const value = entry.childForFieldName("value");
	return key !== null && value?.type === "identifier" ? [[value, `.${key.text}`]] : [];
}

/**
 * The local variables a declarator's name fills: the name, or the entries of
 * its object pattern.
 * @param name The declarator's name.
 * @returns The variables.
 */
function localsOf(name: Node | null): Local[] {
	if (name?.type === "identifier") return [[name, ""]];
	return name?.type === "object_pattern" ? name.namedChildren.flatMap(patternLocal) : [];
}

/**
 * The declarator whose whole value an expression is, and the local variables it fills.
 * @param held The value.
 * @returns The declarator and its variables, or undefined.
 */
function declared(held: Node): { readonly at: Node; readonly locals: Local[] } | undefined {
	const declarator = held.parent;
	const holds =
		declarator?.type === "variable_declarator" &&
		declarator.childForFieldName("value")?.id === held.id;
	return holds
		? { at: declarator, locals: localsOf(declarator.childForFieldName("name")) }
		: undefined;
}

/** How TypeScript writes arithmetic. */
const TYPESCRIPT_MATH: MathSyntax = {
	binary: new Set(["binary_expression"]),
	unary: new Set(["unary_expression"]),
	wrappers: new Set([
		"parenthesized_expression",
		"as_expression",
		"satisfies_expression",
		"non_null_expression",
	]),
	call: { type: "call_expression", callee: "function", arguments: "arguments" },
	member: { type: "member_expression", object: "object", property: "property" },
	math: /^Math\.\w+$/u,
	sorted: new Set(["Math.min", "Math.max", "Math.hypot"]),
	numbers: new Set(["number"]),
	texts: new Set(["string", "template_string"]),
	operators: new Map([["**", 3]]),
	rightward: new Set(["**"]),
	declared,
	scopes: new Set(["statement_block", "program", "class_body"]),
};

export { TYPESCRIPT_MATH };
