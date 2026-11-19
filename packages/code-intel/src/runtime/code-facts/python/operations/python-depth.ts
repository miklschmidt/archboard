// What module depth reads of Python code (TASK-646.11): the math a file
// writes around the names it imports, through Python's syntax table, and
// whether a function only passes its call on.
//
// A function passes its call on when its body, a docstring aside, is one call,
// returned, awaited or made as a statement, that hands every argument straight
// from its own parameters: a name, `*name`, `**name` or `key=name`. The call
// has one argument at least, and its callee is a name or a chain of names from
// one, whose first name the fact keeps (`self` for `self._advance(step)`).

import type { Node } from "web-tree-sitter";
import { declaredBy, type MathSyntax } from "#runtime/code-facts/operations/math-shapes.ts";

/** Python's syntax, as the math is read through it. */
const PYTHON_MATH: MathSyntax = {
	binary: new Set(["binary_operator"]),
	unary: new Set(["unary_operator"]),
	wrappers: new Set(["parenthesized_expression"]),
	call: { type: "call", callee: "function", arguments: "arguments" },
	member: { type: "attribute", object: "object", property: "attribute" },
	math: /^(?:min|max|abs|round|pow|math\.\w+)$/u,
	sorted: new Set(["min", "max", "math.hypot"]),
	numbers: new Set(["integer", "float"]),
	texts: new Set(["string", "concatenated_string"]),
	operators: new Map([
		["//", 2],
		["**", 3],
	]),
	rightward: new Set(["**"]),
	/**
	 * The assignment of a whole value to one name.
	 * @param held The value.
	 * @returns The assignment and its name, or undefined.
	 */
	declared: (held) => declaredBy(held, { type: "assignment", value: "right", name: "left" }),
	scopes: new Set(["block", "module"]),
};

/** Statements that return or make the one expression of a body. */
const MAKERS = new Set(["return_statement", "expression_statement"]);

/** Wrappers that hand on the value of the expression inside. */
const UNWRAPPED = new Set(["await", "parenthesized_expression"]);

/**
 * The named children of a node that are no comment.
 * @param node The node.
 * @returns The children.
 */
function codeOf(node: Node): Node[] {
	return node.namedChildren.filter((child) => child.type !== "comment");
}

/**
 * The name one parameter declares.
 * @param parameter The parameter.
 * @returns The name, or undefined for `self`-less syntax such as `*` alone.
 */
function parameterName(parameter: Node): string | undefined {
	if (parameter.type === "identifier") return parameter.text;
	const name = parameter.childForFieldName("name") ?? codeOf(parameter)[0];
	return name === undefined ? undefined : parameterName(name);
}

/**
 * Whether a statement is a docstring.
 * @param statement The statement.
 * @returns True for a string alone.
 */
function docstring(statement: Node): boolean {
	const only = codeOf(statement);
	return (
		statement.type === "expression_statement" && only.length === 1 && only[0]?.type === "string"
	);
}

/**
 * The statements of a body, without a docstring that opens it.
 * @param body The body.
 * @returns The statements.
 */
function statementsOf(body: Node): Node[] {
	const statements = codeOf(body);
	const first = statements[0];
	return first !== undefined && docstring(first) ? statements.slice(1) : statements;
}

/**
 * The one expression a function's body returns or makes, without `await` or parentheses.
 * @param body The body.
 * @returns The expression, or undefined.
 */
function bodyExpression(body: Node): Node | undefined {
	const statements = statementsOf(body);
	const only = statements.length === 1 ? statements[0] : undefined;
	let expression = only !== undefined && MAKERS.has(only.type) ? codeOf(only)[0] : undefined;
	while (expression !== undefined && UNWRAPPED.has(expression.type)) {
		expression = codeOf(expression)[0];
	}
	return expression;
}

/**
 * Whether an argument comes straight from a parameter.
 * @param argument The argument.
 * @param parameters The parameters.
 * @returns True for `name`, `*name`, `**name` and `key=name` of a parameter.
 */
function passed(argument: Node, parameters: ReadonlySet<string>): boolean {
	const value =
		argument.type === "keyword_argument"
			? argument.childForFieldName("value")
			: argument.type === "list_splat" || argument.type === "dictionary_splat"
				? codeOf(argument)[0]
				: argument;
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
	return callee.type === "attribute" ? calleeRoot(callee.childForFieldName("object")) : undefined;
}

/**
 * The function a declaration is, through its decorators.
 * @param declaration The declaration.
 * @returns The function, or undefined for another declaration.
 */
function functionOf(declaration: Node): Node | undefined {
	const definition =
		declaration.type === "decorated_definition"
			? declaration.childForFieldName("definition")
			: declaration;
	return definition?.type === "function_definition" ? definition : undefined;
}

/**
 * Whether a call hands on every argument straight from a function's
 * parameters, and one at least.
 * @param call The call.
 * @param definition The function.
 * @returns True when it does.
 */
function passesParameters(call: Node, definition: Node | undefined): boolean {
	const list = definition?.childForFieldName("parameters");
	const parameters = new Set(
		(list == null ? [] : codeOf(list)).flatMap((each) => parameterName(each) ?? []),
	);
	const argumentList = call.childForFieldName("arguments");
	const args = argumentList === null ? [] : codeOf(argumentList);
	return args.length > 0 && args.every((each) => passed(each, parameters));
}

/**
 * The root of the callee a function only passes its call on to.
 * @param declaration The function's declaration, with its decorators.
 * @returns The root, or undefined when it decides something.
 */
function pythonPassesTo(declaration: Node): string | undefined {
	const definition = functionOf(declaration);
	const body = definition?.childForFieldName("body");
	const call = body == null ? undefined : bodyExpression(body);
	if (call?.type !== "call" || !passesParameters(call, definition)) return undefined;
	return calleeRoot(call.childForFieldName("function"));
}

export { PYTHON_MATH, pythonPassesTo };
