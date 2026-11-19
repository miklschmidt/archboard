// Whether a TypeScript function only passes its call on (TASK-646.05), as
// Ousterhout's pass-through method does: its body is one call, returned,
// awaited or made as a statement, that hands every argument straight from its
// own parameters. Module depth judges it.
//
// The call has at least one argument, each a parameter or a spread of one, so
// a function that fixes what it calls with, or calls with nothing, decides
// something for its callers. The callee is a name or a chain of names from a
// name or `this`, and its root is what the fact names, so the judge can tell
// a call into the module's own hidden value, as `schema.parse(input)` is.

import type { Node } from "web-tree-sitter";

/** The wrappers a callable literal can sit in when a name holds it. */
const WRAPPERS = new Set(["as_expression", "satisfies_expression", "parenthesized_expression"]);

/** Callable declarations and literals with a body. */
const CALLABLES = new Set([
	"function_declaration",
	"method_definition",
	"arrow_function",
	"function_expression",
]);

/**
 * The callable a declaration is or holds.
 * @param declaration The declaration or its value.
 * @returns The callable, or undefined.
 */
function callableOf(declaration: Node | null): Node | undefined {
	if (declaration === null) return undefined;
	if (CALLABLES.has(declaration.type)) return declaration;
	if (WRAPPERS.has(declaration.type)) return callableOf(declaration.namedChildren[0] ?? null);
	return declaration.type === "variable_declarator"
		? callableOf(declaration.childForFieldName("value"))
		: undefined;
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
 * The names of a callable's parameters that are plain names or a rest of one.
 * @param callable The callable.
 * @returns The names.
 */
function parametersOf(callable: Node): Set<string> {
	const single = callable.childForFieldName("parameter");
	if (single !== null) return new Set([single.text]);
	const list = callable.childForFieldName("parameters");
	const names = (list === null ? [] : codeOf(list)).flatMap((parameter) => {
		const pattern = parameter.childForFieldName("pattern");
		const name = pattern?.type === "rest_pattern" ? codeOf(pattern)[0] : pattern;
		return name?.type === "identifier" ? [name.text] : [];
	});
	return new Set(names);
}

/** Statements that return or make the one expression of a body. */
const MAKERS = new Set(["return_statement", "expression_statement"]);

/** The roots a callee's chain of names can start from. */
const ROOTS = new Set(["identifier", "this"]);

/** Wrappers that hand on the value of the expression inside. */
const UNWRAPPED = new Set(["await_expression", "parenthesized_expression"]);

/**
 * The one statement of a block, or nothing.
 * @param block The block.
 * @returns The statement, or undefined when the block holds another number.
 */
function onlyStatement(block: Node): Node | undefined {
	const statements = codeOf(block);
	return statements.length === 1 ? statements[0] : undefined;
}

/**
 * The expression a body evaluates: an arrow's expression, or the one
 * statement of a block that returns or makes it.
 * @param body The body.
 * @returns The expression, or undefined.
 */
function bodyValue(body: Node): Node | undefined {
	if (body.type !== "statement_block") return body;
	const only = onlyStatement(body);
	return only !== undefined && MAKERS.has(only.type) ? codeOf(only)[0] : undefined;
}

/**
 * The one expression a callable's body evaluates, without `await` or parentheses.
 * @param callable The callable.
 * @returns The expression, or undefined.
 */
function bodyExpression(callable: Node): Node | undefined {
	const body = callable.childForFieldName("body");
	let expression = body === null ? undefined : bodyValue(body);
	while (expression !== undefined && UNWRAPPED.has(expression.type))
		expression = codeOf(expression)[0];
	return expression;
}

/**
 * The root of a callee that is a name or a chain of names from a name or `this`.
 * @param callee The callee.
 * @returns The root, or undefined for any other callee.
 */
function calleeRoot(callee: Node | null): string | undefined {
	if (callee === null) return undefined;
	if (ROOTS.has(callee.type)) return callee.text;
	return namedMember(callee) ? calleeRoot(callee.childForFieldName("object")) : undefined;
}

/**
 * Whether an expression names a member by its name, as `a.b` does and `a[b]` does not.
 * @param expression The expression.
 * @returns True when it does.
 */
function namedMember(expression: Node): boolean {
	return (
		expression.type === "member_expression" &&
		expression.childForFieldName("property")?.type === "property_identifier"
	);
}

/**
 * Whether an argument comes straight from a parameter.
 * @param argument The argument.
 * @param parameters The parameters.
 * @returns True for a parameter or a spread of one.
 */
function passed(argument: Node, parameters: ReadonlySet<string>): boolean {
	const name = argument.type === "spread_element" ? codeOf(argument)[0] : argument;
	return name?.type === "identifier" && parameters.has(name.text);
}

/**
 * The arguments of a call, if each comes straight from a parameter and there is one at least.
 * @param call The call.
 * @param parameters The parameters.
 * @returns True when they do.
 */
function passesParameters(call: Node, parameters: ReadonlySet<string>): boolean {
	const list = call.childForFieldName("arguments");
	const args = list?.type === "arguments" ? codeOf(list) : [];
	return args.length > 0 && args.every((each) => passed(each, parameters));
}

/**
 * The root of the callee a declaration only passes its call on to.
 * @param declaration The declaration.
 * @returns The callee's root, such as `save` or `this`, or undefined when it
 * is no callable that only passes its call on.
 */
function passesTo(declaration: Node): string | undefined {
	const callable = callableOf(declaration);
	const call = callable === undefined ? undefined : bodyExpression(callable);
	if (callable === undefined || call?.type !== "call_expression") return undefined;
	if (!passesParameters(call, parametersOf(callable))) return undefined;
	return calleeRoot(call.childForFieldName("function"));
}

export { passesTo };
