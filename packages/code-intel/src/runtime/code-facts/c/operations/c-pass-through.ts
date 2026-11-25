// Whether a C, C++ or Objective-C function or method only passes its call on
// (TASK-646.12), as TypeScript's reading decides it (typescript-pass-through.ts):
// its body is one statement, returned or made, that calls with every argument
// straight from its own parameters, one at least. The call is a function's or
// a method's, `save(item)`, `db_->save(item)`, `shop::save(item)`, or an
// Objective-C message, `[self.store save:item]`. What the fact names is the
// callee's root: the name, `this` or `self` the chain starts at.

import type { Node } from "web-tree-sitter";
import { spell } from "#runtime/code-facts/c/operations/c-spelling.ts";

/** Statements that return or make the one expression of a body. */
const MAKERS = new Set(["return_statement", "expression_statement"]);

/** Names a callee's chain can start from. */
const ROOTS = new Set(["identifier", "this", "qualified_identifier", "template_function"]);

/** The field that names what a call or a message runs. */
const CALLEE: Readonly<Record<string, string>> = {
	call_expression: "function",
	message_expression: "receiver",
};

/**
 * The named children of a node that are no comment.
 * @param node The node.
 * @returns The children.
 */
function codeOf(node: Node): Node[] {
	return node.namedChildren.filter((child) => child.type !== "comment");
}

/**
 * The name a parameter declares, through pointers and references.
 * @param parameter The parameter declaration.
 * @returns The name, or none for a parameter with no name.
 */
function parameterName(parameter: Node): string[] {
	const declarator = parameter.childForFieldName("declarator");
	if (declarator === null) return [];
	const name =
		declarator.type === "identifier" ? declarator : declarator.descendantsOfType("identifier")[0];
	return name === undefined ? [] : [name.text];
}

/**
 * The names of an Objective-C method's parameters.
 * @param method The method definition.
 * @returns The names.
 */
function methodParameters(method: Node): string[] {
	return method.namedChildren
		.filter((child) => child.type === "method_parameter")
		.flatMap((parameter) => parameter.namedChildren.filter((each) => each.type === "identifier"))
		.map((name) => name.text);
}

/**
 * The list of a function's parameters, through the declarators around its name.
 * @param definition The function definition.
 * @returns The list, or undefined.
 */
function parameterList(definition: Node): Node | undefined {
	const declarator = definition.childForFieldName("declarator");
	const callable = declarator?.descendantsOfType("function_declarator")[0] ?? declarator;
	return callable?.childForFieldName("parameters") ?? undefined;
}

/**
 * The names of a function's or a method's parameters.
 * @param definition The function or method definition.
 * @returns The names.
 */
function parametersOf(definition: Node): Set<string> {
	if (definition.type === "method_definition") return new Set(methodParameters(definition));
	const list = parameterList(definition);
	return new Set(list === undefined ? [] : codeOf(list).flatMap(parameterName));
}

/**
 * The block of a function's or a method's code.
 * @param definition The function or method definition.
 * @returns The block, or undefined.
 */
function bodyOf(definition: Node): Node | undefined {
	const body = definition.childForFieldName("body");
	return body ?? definition.namedChildren.find((child) => child.type === "compound_statement");
}

/**
 * The one statement of a body that returns or makes an expression.
 * @param definition The function or method definition.
 * @returns The statement, or undefined for a body of another number or kind.
 */
function onlyStatement(definition: Node): Node | undefined {
	const body = bodyOf(definition);
	const statements = body === undefined ? [] : codeOf(body);
	const [only] = statements;
	return statements.length === 1 && MAKERS.has(only?.type ?? "") ? only : undefined;
}

/**
 * The expression a body's one statement returns or makes, without parentheses.
 * @param definition The function or method definition.
 * @returns The expression, or undefined.
 */
function bodyExpression(definition: Node): Node | undefined {
	const only = onlyStatement(definition);
	let expression = only === undefined ? undefined : codeOf(only)[0];
	while (expression?.type === "parenthesized_expression") expression = codeOf(expression)[0];
	return expression;
}

/**
 * The root of a callee or a receiver that is a name or a chain of fields from one.
 * @param callee The callee.
 * @returns The root, or undefined for any other callee.
 */
function rootOf(callee: Node | null): string | undefined {
	if (callee === null) return undefined;
	if (ROOTS.has(callee.type)) return callee.type === "this" ? "this" : spell(callee);
	return callee.type === "field_expression"
		? rootOf(callee.childForFieldName("argument"))
		: undefined;
}

/**
 * The arguments of a call or a message.
 * @param call The call or message.
 * @returns The arguments.
 */
function argumentsOf(call: Node): Node[] {
	if (call.type === "call_expression") {
		const list = call.childForFieldName("arguments");
		return list === null ? [] : codeOf(list);
	}
	const receiver = call.childForFieldName("receiver")?.id;
	const methods = new Set(call.childrenForFieldName("method").map((each) => each.id));
	return codeOf(call).filter((each) => each.id !== receiver && !methods.has(each.id));
}

/**
 * Whether a call or message passes only its caller's parameters, one at least.
 * @param call The call or message.
 * @param parameters The parameters.
 * @returns True when it does.
 */
function passesParameters(call: Node, parameters: ReadonlySet<string>): boolean {
	const passed = argumentsOf(call);
	const all = passed.every((each) => each.type === "identifier" && parameters.has(each.text));
	return passed.length > 0 && all;
}

/**
 * The root of the callee a function or method only passes its call on to.
 * @param definition The function or method definition.
 * @returns The callee's root, such as `save`, `db_`, `this` or `self`, or
 * undefined when it decides something.
 */
function cPassesTo(definition: Node): string | undefined {
	const call = bodyExpression(definition);
	const field = CALLEE[call?.type ?? ""];
	if (call === undefined || field === undefined) return undefined;
	const passes = passesParameters(call, parametersOf(definition));
	return passes ? rootOf(call.childForFieldName(field)) : undefined;
}

export { cPassesTo };
