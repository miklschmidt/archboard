// What module depth reads of Rust code (TASK-646.10): the math a file writes
// around the paths other files define, through Rust's syntax table, and
// whether a function only passes its call on.
//
// Rust writes its math functions as methods of a number, `a.min(b)` and
// `2u64.pow(n)`, or through a numeric type or `cmp`, `u64::pow(2, n)` and
// `std::cmp::min(a, b)`; each is the one function `min` or `pow`. A number
// drops its type suffix, so `2u64` is `2`. A `let` that binds one name is
// the local variable the math is followed through.
//
// A function only passes its call on, as Ousterhout's pass-through method
// does, when its body is one call, returned,
// awaited, made as a statement or as the block's value, that hands every
// argument straight from its own parameters or `self`, borrowed or not.
// Module depth judges it.
//
// The call has at least one argument, so a function that fixes what it calls
// with, or calls with nothing, decides something for its callers. A `?`
// after the call converts its error, so it is no pass-through. The callee is a
// path, or a chain of fields from a name or `self`, and its root is what the
// fact names: `store` for `store::save(amount)`, `self` for
// `self.target.send(id)`.

import type { Node } from "web-tree-sitter";
import { declaredBy, type MathSyntax } from "#runtime/code-facts/operations/math-shapes.ts";

/** The numeric functions of the math. */
const FUNCTIONS = [
	"min",
	"max",
	"clamp",
	"pow",
	"powi",
	"powf",
	"abs",
	"abs_diff",
	"signum",
	"sqrt",
	"hypot",
	"exp",
	"ln",
	"log",
	"log2",
	"log10",
	"floor",
	"ceil",
	"round",
	"trunc",
	"mul_add",
	"div_euclid",
	"rem_euclid",
	"saturating_add",
	"saturating_sub",
	"saturating_mul",
	"saturating_div",
	"saturating_pow",
	"wrapping_add",
	"wrapping_sub",
	"wrapping_mul",
	"wrapping_div",
	"wrapping_pow",
];

/** The numeric types, by the suffix a number writes or the path a function is called through. */
const NUMERIC = "[iu](?:8|16|32|64|128|size)|f32|f64";

/** Rust's syntax, as the math is read through it. */
const RUST_MATH: MathSyntax = {
	binary: new Set(["binary_expression"]),
	unary: new Set(["unary_expression"]),
	wrappers: new Set(["parenthesized_expression", "type_cast_expression"]),
	call: { type: "call_expression", callee: "function", arguments: "arguments" },
	member: { type: "field_expression", object: "value", property: "field" },
	math: new RegExp(`^(?:(?:(?:std|core)::)?cmp|${NUMERIC})::(?<name>${FUNCTIONS.join("|")})$`, "u"),
	methods: new Set(FUNCTIONS),
	sorted: new Set([
		"min",
		"max",
		"hypot",
		"abs_diff",
		"saturating_add",
		"saturating_mul",
		"wrapping_add",
		"wrapping_mul",
	]),
	numbers: new Set(["integer_literal", "float_literal"]),
	// The `f32` that ends a hexadecimal number is its digits.
	suffix: /(?:[iu](?:8|16|32|64|128|size)|(?<!^0x\w*)f(?:32|64))$/u,
	texts: new Set(["string_literal", "raw_string_literal"]),
	/**
	 * The `let` that binds one name to the whole of a value.
	 * @param held The value.
	 * @returns The declaration and its variable, or undefined.
	 */
	declared: (held) =>
		declaredBy(held, { type: "let_declaration", value: "value", name: "pattern" }),
	scopes: new Set(["block"]),
};

/** Syntax that is no code. */
const COMMENTS = new Set(["line_comment", "block_comment"]);

/** Wrappers that hand on the value of the expression inside. */
const UNWRAPPED = new Set([
	"expression_statement",
	"return_expression",
	"await_expression",
	"parenthesized_expression",
]);

/** The names a callee's path or chain can start from. */
const ROOTS = new Set(["identifier", "self"]);

/** The nodes a callee's path or chain is made of, and the field that leads to its root. */
const TOWARD_ROOT: Readonly<Record<string, string>> = {
	scoped_identifier: "path",
	generic_function: "function",
	field_expression: "value",
};

/**
 * The named children of a node that are no comment.
 * @param node The node.
 * @returns The children.
 */
function codeOf(node: Node): Node[] {
	return node.namedChildren.filter((child) => !COMMENTS.has(child.type));
}

/**
 * The names of a function's parameters that are plain names, and `self`.
 * @param fn The function.
 * @returns The names.
 */
function parametersOf(fn: Node): Set<string> {
	const list = fn.childForFieldName("parameters");
	const names = (list === null ? [] : codeOf(list)).flatMap((parameter) => {
		if (parameter.type === "self_parameter") return ["self"];
		const pattern = parameter.childForFieldName("pattern");
		return pattern?.type === "identifier" ? [pattern.text] : [];
	});
	return new Set(names);
}

/**
 * The one expression a function's body evaluates, without `return`, `.await`
 * or parentheses.
 * @param fn The function.
 * @returns The expression, or undefined when the body holds more.
 */
function bodyExpression(fn: Node): Node | undefined {
	const body = fn.childForFieldName("body");
	const statements = body === null ? [] : codeOf(body);
	let expression = statements.length === 1 ? statements[0] : undefined;
	while (expression !== undefined && UNWRAPPED.has(expression.type)) {
		expression = codeOf(expression)[0];
	}
	return expression;
}

/**
 * The root of a callee that is a path, or a chain of fields from a name or `self`.
 * @param callee The callee.
 * @returns The root, or undefined for any other callee.
 */
function calleeRoot(callee: Node | null): string | undefined {
	if (callee === null) return undefined;
	if (ROOTS.has(callee.type)) return callee.text;
	const toward = TOWARD_ROOT[callee.type];
	return toward === undefined ? undefined : calleeRoot(callee.childForFieldName(toward));
}

/**
 * Whether an argument comes straight from a parameter or `self`, borrowed or not.
 * @param argument The argument.
 * @param parameters The parameters.
 * @returns True when it does.
 */
function passed(argument: Node, parameters: ReadonlySet<string>): boolean {
	const name =
		argument.type === "reference_expression" ? argument.childForFieldName("value") : argument;
	return name !== null && ROOTS.has(name.type) && parameters.has(name.text);
}

/**
 * Whether a call hands on every argument straight from a parameter, and one at least.
 * @param call The call.
 * @param parameters The parameters.
 * @returns True when it does.
 */
function passesParameters(call: Node, parameters: ReadonlySet<string>): boolean {
	const list = call.childForFieldName("arguments");
	const args = list === null ? [] : codeOf(list);
	return args.length > 0 && args.every((each) => passed(each, parameters));
}

/**
 * The root of the callee a function only passes its call on to.
 * @param fn The function item.
 * @returns The callee's root, such as `save` or `self`, or undefined when it
 * is no function that only passes its call on.
 */
function passesTo(fn: Node): string | undefined {
	if (fn.type !== "function_item") return undefined;
	const call = bodyExpression(fn);
	if (call?.type !== "call_expression" || !passesParameters(call, parametersOf(fn))) {
		return undefined;
	}
	return calleeRoot(call.childForFieldName("function"));
}

export { passesTo, RUST_MATH };
