// What module depth reads of Go code (TASK-646.11): the math a file writes
// around the names other packages define, through Go's syntax table, and
// whether a function or a method only passes its call on.
//
// A function passes its call on when its body is one call, returned or made
// as a statement, that hands every argument straight from its own
// parameters: a name, or `name...`. The call has one argument at least, and
// its callee is a name or a chain of names from one, whose first name the
// fact keeps (`c` for `c.advance(step)`, `c` being the receiver).

import type { Node } from "web-tree-sitter";
import type { Local, MathSyntax } from "#runtime/code-facts/operations/math-shapes.ts";

/**
 * The names a declaration of variables writes, in the order of their values.
 * @param declaration The declaration.
 * @returns The names; none for another node.
 */
function declaredNames(declaration: Node): Node[] {
	if (declaration.type === "var_spec") return declaration.childrenForFieldName("name");
	const left =
		declaration.type === "short_var_declaration" ? declaration.childForFieldName("left") : null;
	return left === null ? [] : left.namedChildren;
}

/**
 * The variable a declaration of several names gives the value at one place
 * of its list: `base := timing.RestartBase`, `var m = timing.RestartMax`.
 * @param held The value.
 * @returns The declaration and its variable, or undefined.
 */
function declared(held: Node): { readonly at: Node; readonly locals: Local[] } | undefined {
	const values = held.parent;
	if (values?.type !== "expression_list" || values.parent === null) return undefined;
	const index = values.namedChildren.findIndex((each) => each.id === held.id);
	const name = declaredNames(values.parent)[index];
	return name?.type === "identifier" ? { at: values.parent, locals: [[name, ""]] } : undefined;
}

/** Go's syntax, as the math is read through it. */
const GO_MATH: MathSyntax = {
	binary: new Set(["binary_expression"]),
	unary: new Set(["unary_expression"]),
	wrappers: new Set(["parenthesized_expression"]),
	call: { type: "call_expression", callee: "function", arguments: "arguments" },
	member: { type: "selector_expression", object: "operand", property: "field" },
	math: /^(?:min|max|math\.\w+)$/u,
	sorted: new Set(["min", "max", "math.Min", "math.Max", "math.Hypot"]),
	numbers: new Set(["int_literal", "float_literal"]),
	texts: new Set(["interpreted_string_literal", "raw_string_literal"]),
	declared,
	scopes: new Set(["block", "source_file"]),
};

/** The methods Go and its `fmt` call themselves, through `error` and `fmt.Stringer`. */
const CALLED_BY_LANGUAGE = new Set(["Error", "String", "GoString", "Format"]);

/**
 * Whether Go calls a method itself.
 * @param name The method's name.
 * @returns True for `Error`, `String`, `GoString` and `Format`.
 */
function calledByGo(name: string): boolean {
	return CALLED_BY_LANGUAGE.has(name);
}

/**
 * The named children of a node that are no comment.
 * @param node The node.
 * @returns The children.
 */
function codeOf(node: Node): Node[] {
	return node.namedChildren.filter((child) => child.type !== "comment");
}

/**
 * The one statement of a function's body.
 * @param declaration The function or method.
 * @returns The statement, or undefined when the body holds another number.
 */
function onlyStatement(declaration: Node): Node | undefined {
	const list = codeOf(declaration.childForFieldName("body") ?? declaration)[0];
	const statements = list?.type === "statement_list" ? codeOf(list) : [];
	return statements.length === 1 ? statements[0] : undefined;
}

/**
 * The values a statement returns or makes.
 * @param statement The statement.
 * @returns The values.
 */
function madeValues(statement: Node): Node[] {
	const made = statement.type === "return_statement" ? codeOf(statement)[0] : statement;
	if (made === undefined) return [];
	return made.type === "expression_list" ? codeOf(made) : [made];
}

/**
 * The one call a function's body returns or makes.
 * @param declaration The function or method.
 * @returns The call, or undefined.
 */
function onlyCall(declaration: Node): Node | undefined {
	const only = onlyStatement(declaration);
	const values = only === undefined ? [] : madeValues(only);
	const call = values.length === 1 ? values[0] : undefined;
	return call?.type === "call_expression" ? call : undefined;
}

/**
 * The names of a function's parameters.
 * @param declaration The function or method.
 * @returns The names.
 */
function parametersOf(declaration: Node): Set<string> {
	const list = declaration.childForFieldName("parameters");
	return new Set(
		(list === null ? [] : codeOf(list)).flatMap((parameter) =>
			parameter.childrenForFieldName("name").map((name) => name.text),
		),
	);
}

/**
 * Whether an argument comes straight from a parameter.
 * @param argument The argument.
 * @param parameters The parameters.
 * @returns True for `name` and `name...` of a parameter.
 */
function passed(argument: Node, parameters: ReadonlySet<string>): boolean {
	const value = argument.type === "variadic_argument" ? codeOf(argument)[0] : argument;
	return value?.type === "identifier" && parameters.has(value.text);
}

/**
 * The root of a callee that is a name or a chain of names from one.
 * @param callee The callee.
 * @returns The root, or undefined for any other callee.
 */
function calleeRoot(callee: Node | null): string | undefined {
	if (callee === null) return undefined;
	if (callee.type === "identifier") return callee.text;
	const chained = callee.type === "selector_expression";
	return chained ? calleeRoot(callee.childForFieldName("operand")) : undefined;
}

/**
 * The root of the callee a function or a method only passes its call on to.
 * @param declaration The declaration.
 * @returns The root, or undefined when it decides something.
 */
function goPassesTo(declaration: Node): string | undefined {
	const call = onlyCall(declaration);
	const list = call?.childForFieldName("arguments");
	const args = list == null ? [] : codeOf(list);
	const parameters = parametersOf(declaration);
	if (call === undefined || args.length === 0) return undefined;
	if (!args.every((each) => passed(each, parameters))) return undefined;
	return calleeRoot(call.childForFieldName("function"));
}

export { calledByGo, GO_MATH, goPassesTo };
