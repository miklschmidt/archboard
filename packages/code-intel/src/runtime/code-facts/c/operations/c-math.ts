// How C, C++ and Objective-C write arithmetic (TASK-646.12), for the math a
// file writes around its uses (math-shapes.ts): `binary_expression`, a sign,
// parentheses, the functions of `<math.h>`, `<algorithm>` and Foundation's
// `MIN` and `MAX`. A chain of names runs through `.` and `->`, as the
// references spell it (`config.retry`), and a getter is a call that passes
// nothing. A
// local variable that holds a use whole is a declaration's one value:
// `const int base = restart_base;`.

import type { Node } from "web-tree-sitter";
import { spell } from "#runtime/code-facts/c/operations/c-spelling.ts";
import {
	type Local,
	type MathCall,
	type MathSyntax,
	type Operation,
} from "#runtime/code-facts/operations/math-shapes.ts";

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
 * Whether a node holds another in one of its fields.
 * @param node The node.
 * @param name The field.
 * @param child The other node.
 * @returns True when it does.
 */
function holds(node: Node, name: string, child: Node): boolean {
	return node.childForFieldName(name)?.id === child.id;
}

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
 * The scope a declaration's variables live in: its block, or the file.
 * @param declaration The declaration.
 * @returns The scope, or undefined.
 */
function scopeOf(declaration: Node): Node | undefined {
	let scope = declaration.parent;
	while (scope !== null && !SCOPES.has(scope.type)) scope = scope.parent;
	return scope ?? undefined;
}

/**
 * The declarator whose value an expression is whole, through parentheses.
 * @param operand The expression.
 * @returns The declarator, or undefined.
 */
function declaratorOf(operand: Node): Node | undefined {
	let held = operand;
	while (held.parent?.type === "parenthesized_expression") held = held.parent;
	const declarator = held.parent;
	return declarator?.type === "init_declarator" && holds(declarator, "value", held)
		? declarator
		: undefined;
}

/**
 * The local variable a declarator fills.
 * @param declarator The declarator.
 * @returns The variable, or undefined for a pattern or a declaration outside a scope.
 */
function declaredLocal(declarator: Node): Local | undefined {
	const name = declarator.childForFieldName("declarator");
	const declaration = declarator.parent;
	if (name?.type !== "identifier" || declaration === null) return undefined;
	const scope = scopeOf(declaration);
	return scope === undefined ? undefined : { name: name.text, scope, after: declaration.endIndex };
}

/**
 * The local variable a declaration fills with an expression whole.
 * @param operand The expression.
 * @returns The variable, or undefined.
 */
function local(operand: Node): Local | undefined {
	const declarator = declaratorOf(operand);
	return declarator === undefined ? undefined : declaredLocal(declarator);
}

/**
 * The operation a binary or unary expression is.
 * @param node The expression.
 * @returns Its operator and operands, or undefined for another expression.
 */
function operation(node: Node): Operation | undefined {
	if (node.type !== "binary_expression" && node.type !== "unary_expression") return undefined;
	const operator = node.childForFieldName("operator")?.type ?? "";
	const operands = ["left", "right", "argument"].flatMap(
		(field) => node.childForFieldName(field) ?? [],
	);
	return { operator, operands };
}

/**
 * The call of a function of math an expression is.
 * @param node The expression.
 * @returns The call, or undefined.
 */
function mathCall(node: Node): MathCall | undefined {
	const callee = node.type === "call_expression" ? node.childForFieldName("function") : null;
	const name = callee === null ? "" : spell(callee);
	return MATH.has(name) ? { name, arguments: argumentsOf(node) } : undefined;
}

/**
 * A number's value: `30'000` and `30000L` are one.
 * @param node The expression.
 * @returns The value, or undefined for anything but a number.
 */
function number(node: Node): string | undefined {
	if (node.type !== "number_literal") return undefined;
	const digits = node.text.replaceAll("'", "");
	const suffix = /^0x/iu.test(digits) ? /[uUlL]+$/u : /[uUlLfF]+$/u;
	const value = Number(digits.replace(suffix, ""));
	return Number.isNaN(value) ? node.text : String(value);
}

/**
 * Whether an expression is a call that passes nothing to another, as a getter's is.
 * @param parent The expression.
 * @param operand The other.
 * @returns True when it is.
 */
function getterCall(parent: Node, operand: Node): boolean {
	const call = parent.type === "call_expression" && holds(parent, "function", operand);
	return call && argumentsOf(parent).length === 0;
}

/**
 * The expression that reads on from another: a field of it, or the call of
 * it that passes nothing, as a getter's is.
 * @param operand The expression.
 * @returns The reading expression, or undefined.
 */
function readOn(operand: Node): Node | undefined {
	const parent = operand.parent;
	if (parent === null) return undefined;
	const field = parent.type === "field_expression" && holds(parent, "argument", operand);
	return field || getterCall(parent, operand) ? parent : undefined;
}

/** How C, C++ and Objective-C write arithmetic. */
const C_MATH: MathSyntax = {
	operation,
	/**
	 * The expression parentheses hold.
	 * @param node The expression.
	 * @returns What they hold, or undefined for anything else.
	 */
	inner: (node) =>
		node.type === "parenthesized_expression" ? (node.namedChildren[0] ?? undefined) : undefined,
	mathCall,
	/**
	 * The call an expression is an argument of.
	 * @param argument The expression.
	 * @returns The call, or undefined.
	 */
	callOf: (argument) => {
		const list = argument.parent;
		return list?.type === "argument_list" ? (list.parent ?? undefined) : undefined;
	},
	sorted: SORTED,
	number,
	/**
	 * Whether an expression is text.
	 * @param node The expression.
	 * @returns True for a string.
	 */
	text: (node) => TEXT.has(node.type),
	readOn,
	/**
	 * Whether an expression reads a field.
	 * @param expression The expression.
	 * @returns True for a field expression.
	 */
	member: (expression) => expression.type === "field_expression",
	spelled,
	local,
	/**
	 * The later uses of a local variable.
	 * @param variable The variable.
	 * @returns Its names after its declaration.
	 */
	uses: (variable) =>
		variable.scope
			.descendantsOfType("identifier")
			.filter((each) => each.text === variable.name && each.startIndex > variable.after),
};

export { C_MATH };
