// How C, C++ and Objective-C write arithmetic (TASK-646.12), for the math a
// file writes around its uses (math-shapes.ts): `binary_expression`, a sign,
// parentheses, the functions of `<math.h>`, `<algorithm>` and Foundation's
// `MIN` and `MAX`. A chain of names runs through `.` and `->`, as the
// references spell it (`config.retry`), and a getter is a call that passes
// nothing. A
// local variable that holds a use whole is a declaration's one value:
// `const int base = restart_base;`.

import type { Node } from "web-tree-sitter";
import { spell } from "#runtime/code-facts/c/operations/c-definitions.ts";
import { type Local, type MathSyntax } from "#runtime/code-facts/operations/math-shapes.ts";

/** The functions of math whose arguments can change places. */
const SORTED = new Set([
	"min",
	"max",
	"fmin",
	"fmax",
	"fminf",
	"fmaxf",
	"hypot",
	"MIN",
	"MAX",
	"std::min",
	"std::max",
	"std::fmin",
	"std::fmax",
	"std::hypot",
]);

/** The other functions of math, which keep math going around their arguments. */
const MATH = new Set([
	...SORTED,
	"abs",
	"labs",
	"fabs",
	"pow",
	"sqrt",
	"ceil",
	"floor",
	"round",
	"exp",
	"log",
	"ABS",
	"std::abs",
	"std::pow",
	"std::sqrt",
	"std::ceil",
	"std::floor",
	"std::round",
	"std::clamp",
]);

/** The scopes a local variable is searched in. */
const SCOPES = new Set(["compound_statement", "translation_unit"]);

/** The expressions that only hold text. */
const TEXT = new Set(["string_literal", "concatenated_string", "raw_string_literal"]);

/**
 * How code spells a chain of fields through `.` or `->`, from a name.
 * @param node A field expression or a name.
 * @returns The spelling through `.`.
 */
function spelled(node: Node): string {
	if (node.type !== "field_expression") return spell(node);
	const argument = node.childForFieldName("argument");
	const field = node.childForFieldName("field");
	return argument === null || field === null ? node.text : `${spelled(argument)}.${spell(field)}`;
}

/**
 * The arguments of a call, its comments aside.
 * @param call The call.
 * @returns The arguments.
 */
function argumentsOf(call: Node): Node[] {
	const list = call.childForFieldName("arguments");
	return (list?.namedChildren ?? []).filter((each) => each.type !== "comment");
}

/**
 * The local variable a declaration fills with an expression whole.
 * @param operand The expression.
 * @returns The variable, or undefined.
 */
function local(operand: Node): Local | undefined {
	let held = operand;
	while (held.parent?.type === "parenthesized_expression") held = held.parent;
	const declarator = held.parent;
	if (declarator?.type !== "init_declarator") return undefined;
	if (declarator.childForFieldName("value")?.id !== held.id) return undefined;
	const name = declarator.childForFieldName("declarator");
	const declaration = declarator.parent;
	let scope = declaration?.parent ?? null;
	while (scope !== null && !SCOPES.has(scope.type)) scope = scope.parent;
	if (name?.type !== "identifier" || declaration === null || scope === null) return undefined;
	return { name: name.text, scope, after: declaration.endIndex };
}

/** How C, C++ and Objective-C write arithmetic. */
const C_MATH: MathSyntax = {
	operation: (node) => {
		if (node.type !== "binary_expression" && node.type !== "unary_expression") return undefined;
		const operator = node.childForFieldName("operator")?.type ?? "";
		const operands = ["left", "right", "argument"].flatMap(
			(field) => node.childForFieldName(field) ?? [],
		);
		return { operator, operands };
	},
	inner: (node) =>
		node.type === "parenthesized_expression" ? (node.namedChildren[0] ?? undefined) : undefined,
	mathCall: (node) => {
		const callee = node.type === "call_expression" ? node.childForFieldName("function") : null;
		const name = callee === null ? "" : spell(callee);
		return MATH.has(name) ? { name, arguments: argumentsOf(node) } : undefined;
	},
	callOf: (argument) => {
		const list = argument.parent;
		return list?.type === "argument_list" ? (list.parent ?? undefined) : undefined;
	},
	sorted: SORTED,
	number: (node) => {
		if (node.type !== "number_literal") return undefined;
		const digits = node.text.replaceAll("'", "");
		const suffix = /^0x/iu.test(digits) ? /[uUlL]+$/u : /[uUlLfF]+$/u;
		const value = Number(digits.replace(suffix, ""));
		return Number.isNaN(value) ? node.text : String(value);
	},
	text: (node) => TEXT.has(node.type),
	readOn: (operand) => {
		const parent = operand.parent;
		if (parent === null) return undefined;
		if (parent.type === "field_expression") {
			return parent.childForFieldName("argument")?.id === operand.id ? parent : undefined;
		}
		if (parent.type === "call_expression") {
			const getter = parent.childForFieldName("function")?.id === operand.id;
			return getter && argumentsOf(parent).length === 0 ? parent : undefined;
		}
		return undefined;
	},
	member: (expression) => expression.type === "field_expression",
	spelled,
	local,
	uses: ({ name, scope, after }) =>
		scope
			.descendantsOfType("identifier")
			.filter((each) => each.text === name && each.startIndex > after),
};

export { C_MATH };
