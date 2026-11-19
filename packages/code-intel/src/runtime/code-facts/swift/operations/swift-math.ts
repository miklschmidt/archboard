// How Swift writes arithmetic (TASK-646.12), for the math a file writes
// around its uses (math-shapes.ts): `additive_expression`,
// `multiplicative_expression`, a sign, parentheses, which the grammar reads
// as a tuple of one value, and the functions of math, such as `min` and
// `max`. A chain of names runs through `.`, as the references spell it
// (`Timing.restartBase`), and a getter is a call that passes nothing. A local
// variable that holds a use whole is a property's value: `let base =
// restartBase`.

import type { Node } from "web-tree-sitter";
import { type Local, type MathSyntax } from "#runtime/code-facts/operations/math-shapes.ts";

/** The functions of math whose arguments can change places. */
const SORTED = new Set(["min", "max", "hypot", "Swift.min", "Swift.max"]);

/** The other functions of math, which keep math going around their arguments. */
const MATH = new Set([...SORTED, "abs", "pow", "sqrt", "ceil", "floor", "round", "exp", "log"]);

/** The expressions that only hold text. */
const TEXT = new Set(["line_string_literal", "multi_line_string_literal", "raw_string_literal"]);

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
 * The arguments a call passes, or undefined for a subscript, `table["k"]`,
 * or a call with a trailing closure.
 * @param call The call.
 * @returns The values of its arguments.
 */
function argumentsOf(call: Node): Node[] | undefined {
	const suffix = call.namedChildren.find((child) => child.type === "call_suffix");
	const list = suffix?.namedChildren[0];
	if (list?.type !== "value_arguments" || list.firstChild?.type !== "(") return undefined;
	if (suffix !== undefined && suffix.namedChildren.length > 1) return undefined;
	return list.namedChildren
		.filter((each) => each.type === "value_argument")
		.flatMap((each) => each.childForFieldName("value") ?? []);
}

/**
 * The local variable a property declaration fills with an expression whole.
 * @param operand The expression.
 * @returns The variable, or undefined.
 */
function local(operand: Node): Local | undefined {
	const declaration = operand.parent;
	if (declaration?.type !== "property_declaration") return undefined;
	if (declaration.childForFieldName("value")?.id !== operand.id) return undefined;
	const name = declaration.childForFieldName("name")?.childForFieldName("bound_identifier");
	const scope = declaration.parent;
	if (name === null || name === undefined || scope === null || !SCOPES.has(scope.type)) {
		return undefined;
	}
	return { name: name.text, scope, after: declaration.endIndex };
}

/**
 * Whether tree-sitter-swift reads the call after a math that ends with an
 * expression as a call of the whole math: `1 + n * jitter()` parses as `(1 +
 * n * jitter)()`. The call that passes nothing is the expression's own.
 * @param operand The expression.
 * @returns True when the grammar moved its call out.
 */
function calledAfter(operand: Node): boolean {
	let math = operand;
	for (let parent = math.parent; parent !== null; parent = math.parent) {
		const last = parent.childForFieldName(parent.type === "prefix_expression" ? "target" : "rhs");
		if (last?.id !== math.id || SWIFT_MATH.operation(parent) === undefined) break;
		math = parent;
	}
	const call = math.parent;
	if (math.id === operand.id || call?.type !== "call_expression") return false;
	return call.namedChildren[0]?.id === math.id && argumentsOf(call)?.length === 0;
}

/** How Swift writes arithmetic. */
const SWIFT_MATH: MathSyntax = {
	operation: (node) => {
		if (node.type === "additive_expression" || node.type === "multiplicative_expression") {
			const operator = node.childForFieldName("op")?.type ?? "";
			const operands = ["lhs", "rhs"].flatMap((field) => node.childForFieldName(field) ?? []);
			return { operator, operands };
		}
		if (node.type !== "prefix_expression") return undefined;
		const target = node.childForFieldName("target");
		const operator = node.childForFieldName("operation")?.type ?? "";
		return target === null ? undefined : { operator, operands: [target] };
	},
	inner: (node) => {
		if (node.type !== "tuple_expression" || node.namedChildren.length !== 1) return undefined;
		return node.childForFieldName("value") ?? undefined;
	},
	mathCall: (node) => {
		const callee = node.type === "call_expression" ? node.namedChildren[0] : undefined;
		const name = callee === undefined ? undefined : chain(callee);
		const passed = name !== undefined && MATH.has(name) ? argumentsOf(node) : undefined;
		return name === undefined || passed === undefined ? undefined : { name, arguments: passed };
	},
	callOf: (argument) => {
		const value = argument.parent;
		if (value?.type !== "value_argument") return undefined;
		if (value.childForFieldName("value")?.id !== argument.id) return undefined;
		const call = value.parent?.parent?.parent;
		return call?.type === "call_expression" ? call : undefined;
	},
	sorted: SORTED,
	number: (node) => {
		if (node.type !== "integer_literal" && node.type !== "real_literal") return undefined;
		const value = Number(node.text.replaceAll("_", ""));
		return Number.isNaN(value) ? node.text : String(value);
	},
	text: (node) => TEXT.has(node.type),
	readOn: (operand) => {
		const parent = operand.parent;
		if (parent?.type === "navigation_expression") {
			return parent.childForFieldName("target")?.id === operand.id ? parent : undefined;
		}
		if (parent?.type !== "call_expression" || parent.namedChildren[0]?.id !== operand.id) {
			return undefined;
		}
		return argumentsOf(parent)?.length === 0 ? parent : undefined;
	},
	member: (expression) => expression.type === "navigation_expression",
	spelled: (node) => chain(node) ?? node.text,
	local,
	uses: ({ name, scope, after }) =>
		scope
			.descendantsOfType("simple_identifier")
			.filter(
				(each) =>
					each.text === name && each.startIndex > after && !NO_USE.has(each.parent?.type ?? ""),
			),
	calledAfter,
};

export { SWIFT_MATH, chain, memberName };
