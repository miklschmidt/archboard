// How Swift writes arithmetic (TASK-646.12), for the math a file writes
// around its uses (math-shapes.ts): `additive_expression`,
// `multiplicative_expression`, a sign, parentheses, which the grammar reads
// as a tuple of one value, and the functions of math, such as `min` and
// `max`. A chain of names runs through `.`, as the references spell it
// (`Timing.restartBase`), and a getter is a call that passes nothing. A local
// variable that holds a use whole is a property's value: `let base =
// restartBase`.

import type { Node } from "web-tree-sitter";
import {
	type Local,
	type MathCall,
	type MathGrammar,
	type Operation,
} from "#runtime/code-facts/operations/math-grammar.ts";

/** The functions of math whose arguments can change places. */
const SORTED = new Set(["min", "max", "hypot", "Swift.min", "Swift.max"]);

/** The other functions of math, which keep math going around their arguments. */
const MATH = new Set([...SORTED, "abs", "pow", "sqrt", "ceil", "floor", "round", "exp", "log"]);

/** The expressions that only hold text. */
const TEXT = new Set(["line_string_literal", "multi_line_string_literal", "raw_string_literal"]);

/** The binary expressions of arithmetic. */
const BINARY = new Set(["additive_expression", "multiplicative_expression"]);

/** The scopes a local variable is searched in. */
const SCOPES = new Set(["statements", "source_file"]);

/** The parents of a name that is no use of a variable: a member after `.`, a label, a binding. */
const NO_USE = new Set(["navigation_suffix", "value_argument_label", "pattern"]);

/**
 * The member a navigation names after its `.`.
 * @param navigation The navigation.
 * @returns The member's name, or undefined for anything else, such as a tuple's `.0`.
 */
function memberName(navigation: Node): string | undefined {
	const suffix = navigation.childForFieldName("suffix")?.childForFieldName("suffix");
	return suffix?.type === "simple_identifier" ? suffix.text : undefined;
}

/**
 * How code spells a chain of names through `.`, from a name.
 * @param node A navigation or a name.
 * @returns The spelling, or undefined when the chain starts at something else, such as a call.
 */
function chain(node: Node): string | undefined {
	if (node.type === "simple_identifier") return node.text;
	const target = node.type === "navigation_expression" ? node.childForFieldName("target") : null;
	const base = target === null ? undefined : chain(target);
	const member = base === undefined ? undefined : memberName(node);
	return member === undefined ? undefined : `${base}.${member}`;
}

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
 * Whether a node is a list of arguments in parentheses.
 * @param list The node.
 * @returns True when it is: no subscript, `table["k"]`.
 */
function parenthesized(list: Node | undefined): list is Node {
	return list?.type === "value_arguments" && list.firstChild?.type === "(";
}

/**
 * The list of arguments a call passes in parentheses, with no trailing
 * closure: none for a subscript, `table["k"]`.
 * @param call The call.
 * @returns The list, or undefined.
 */
function argumentList(call: Node): Node | undefined {
	const suffix = call.namedChildren.find((child) => child.type === "call_suffix");
	const [list, ...more] = suffix?.namedChildren ?? [];
	return more.length === 0 && parenthesized(list) ? list : undefined;
}

/**
 * The arguments a call passes, or undefined for a subscript or a call with a
 * trailing closure.
 * @param call The call.
 * @returns The values of its arguments.
 */
function argumentsOf(call: Node): Node[] | undefined {
	return argumentList(call)
		?.namedChildren.filter((each) => each.type === "value_argument")
		.flatMap((each) => each.childForFieldName("value") ?? []);
}

/**
 * Whether a call passes nothing, as a getter's does.
 * @param call The call.
 * @returns True when it does.
 */
function passesNothing(call: Node): boolean {
	return argumentsOf(call)?.length === 0;
}

/**
 * The block or file a property declaration binds its variable in.
 * @param declaration The declaration.
 * @returns The scope, or undefined for a member.
 */
function scopeOf(declaration: Node): Node | undefined {
	const scope = declaration.parent;
	return scope !== null && SCOPES.has(scope.type) ? scope : undefined;
}

/**
 * The later uses of the variable a property declaration binds: its name
 * after the declaration, in the block or the file that holds it, but a member
 * after `.`, a label or a binding of that name.
 * @param declaration The declaration.
 * @returns The uses, none for a pattern or a member.
 */
function laterUses(declaration: Node): Local[] {
	const name = declaration.childForFieldName("name")?.childForFieldName("bound_identifier");
	const scope = scopeOf(declaration);
	if (name === null || name === undefined || scope === undefined) return [];
	return scope
		.descendantsOfType("simple_identifier")
		.filter((each) => each.text === name.text && each.startIndex > declaration.endIndex)
		.filter((each) => !NO_USE.has(each.parent?.type ?? ""))
		.map((each) => [each, ""] as const);
}

/**
 * The later uses of a local variable that a property declaration fills with an expression whole.
 * @param operand The expression.
 * @returns The uses.
 */
function later(operand: Node): Local[] {
	const declaration = operand.parent;
	const held = declaration?.type === "property_declaration" && holds(declaration, "value", operand);
	return held ? laterUses(declaration) : [];
}

/**
 * The operation of a binary expression of arithmetic.
 * @param node The expression.
 * @returns Its operator and its two operands.
 */
function binary(node: Node): Operation {
	const operator = node.childForFieldName("op")?.type ?? "";
	return {
		operator,
		operands: ["lhs", "rhs"].flatMap((each) => node.childForFieldName(each) ?? []),
	};
}

/**
 * The operation of a prefix expression.
 * @param node The expression.
 * @returns Its operator and its operand, or undefined when it has none.
 */
function prefix(node: Node): Operation | undefined {
	const target = node.childForFieldName("target");
	const operator = node.childForFieldName("operation")?.type ?? "";
	return target === null ? undefined : { operator, operands: [target] };
}

/**
 * The operation an additive, a multiplicative or a prefix expression is.
 * @param node The expression.
 * @returns Its operator and operands, or undefined for another expression.
 */
function operation(node: Node): Operation | undefined {
	if (BINARY.has(node.type)) return binary(node);
	return node.type === "prefix_expression" ? prefix(node) : undefined;
}

/**
 * Whether an expression is the last operand of an operation, which holds it on its right.
 * @param parent The operation.
 * @param operand The expression.
 * @returns True when it is.
 */
function lastOperand(parent: Node, operand: Node): boolean {
	const field = parent.type === "prefix_expression" ? "target" : "rhs";
	return holds(parent, field, operand) && operation(parent) !== undefined;
}

/**
 * The largest math an expression ends.
 * @param operand The expression.
 * @returns The math, or the expression when no math ends with it.
 */
function endedMath(operand: Node): Node {
	let math = operand;
	while (math.parent !== null && lastOperand(math.parent, math)) math = math.parent;
	return math;
}

/**
 * Whether tree-sitter-swift reads the call after a math that ends with an
 * expression as a call of the whole math: `1 + n * jitter()` parses as `(1 +
 * n * jitter)()`. The call that passes nothing is the expression's own.
 * @param operand The expression.
 * @returns True when the grammar moved its call out.
 */
function calledAfter(operand: Node): boolean {
	const math = endedMath(operand);
	const call = math.parent;
	if (math.id === operand.id || call === null) return false;
	return calls(call, math) && passesNothing(call);
}

/**
 * The call of a function of math an expression is.
 * @param node The expression.
 * @returns The call, or undefined.
 */
function mathCall(node: Node): MathCall | undefined {
	const callee = node.type === "call_expression" ? node.namedChildren[0] : undefined;
	const name = callee === undefined ? "" : (chain(callee) ?? "");
	const passed = MATH.has(name) ? argumentsOf(node) : undefined;
	return passed === undefined ? undefined : { name, arguments: passed };
}

/**
 * The call whose suffix holds an argument.
 * @param value The argument.
 * @returns The call, or undefined.
 */
function callAround(value: Node): Node | undefined {
	const call = value.parent?.parent?.parent;
	return call?.type === "call_expression" ? call : undefined;
}

/**
 * The call an expression is an argument of: the value of an argument, in the
 * arguments of the suffix of a call.
 * @param argument The expression.
 * @returns The call, or undefined.
 */
function callOf(argument: Node): Node | undefined {
	const value = argument.parent;
	if (value?.type !== "value_argument" || !holds(value, "value", argument)) return undefined;
	return callAround(value);
}

/**
 * Whether a call calls an expression, its first child.
 * @param call The call.
 * @param callee The expression.
 * @returns True when it does.
 */
function calls(call: Node, callee: Node): boolean {
	return call.type === "call_expression" && call.namedChildren[0]?.id === callee.id;
}

/**
 * The expression that reads on from another: a member of it, or the call of
 * it that passes nothing, as a getter's is.
 * @param operand The expression.
 * @returns The reading expression, or undefined.
 */
function readOn(operand: Node): Node | undefined {
	const parent = operand.parent;
	if (parent === null) return undefined;
	const member = parent.type === "navigation_expression" && holds(parent, "target", operand);
	return member || (calls(parent, operand) && passesNothing(parent)) ? parent : undefined;
}

/**
 * A number's value: `30_000` and `30000` are one.
 * @param node The expression.
 * @returns The value, or undefined for anything but a number.
 */
function number(node: Node): string | undefined {
	if (node.type !== "integer_literal" && node.type !== "real_literal") return undefined;
	const value = Number(node.text.replaceAll("_", ""));
	return Number.isNaN(value) ? node.text : String(value);
}

/** How Swift writes arithmetic. */
const SWIFT_MATH: MathGrammar = {
	operation,
	/**
	 * The expression parentheses hold: a tuple of one value.
	 * @param node The expression.
	 * @returns What they hold, or undefined for anything else.
	 */
	inner: (node) =>
		node.type === "tuple_expression" && node.namedChildren.length === 1
			? (node.childForFieldName("value") ?? undefined)
			: undefined,
	mathCall,
	callOf,
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
	 * Whether an expression reads a member.
	 * @param expression The expression.
	 * @returns True for a navigation.
	 */
	member: (expression) => expression.type === "navigation_expression",
	/**
	 * How a chain of names is spelled.
	 * @param node The chain.
	 * @returns Its spelling through `.`.
	 */
	spelled: (node) => chain(node) ?? node.text,
	later,
	calledAfter,
};

export { SWIFT_MATH, argumentsOf, chain, memberName };
