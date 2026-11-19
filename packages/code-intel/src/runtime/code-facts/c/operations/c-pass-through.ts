// Whether a C, C++ or Objective-C function or method only passes its call on
// (TASK-646.12), as TypeScript's reading decides it (typescript-pass-through.ts):
// its body is one statement, returned or made, that calls with every argument
// straight from its own parameters, one at least. The call is a function's or
// a method's, `save(item)`, `db_->save(item)`, `shop::save(item)`, or an
// Objective-C message, `[self.store save:item]`. What the fact names is the
// callee's root: the name, `this` or `self` the chain starts at.

import type { Node } from "web-tree-sitter";
import { spell } from "#runtime/code-facts/c/operations/c-definitions.ts";

/** Statements that return or make the one expression of a body. */
const MAKERS = new Set(["return_statement", "expression_statement"]);

/** Names a callee's chain can start from. */
const ROOTS = new Set(["identifier", "this", "qualified_identifier", "template_function"]);

/**
 * The named children of a node that are no comment.
 * @param node The node.
 * @returns The children.
 */
function codeOf(node: Node): Node[] {
	return node.namedChildren.filter((child) => child.type !== "comment");
}

/**
 * The names of a function's or a method's parameters.
 * @param definition The function or method definition.
 * @returns The names.
 */
function parametersOf(definition: Node): Set<string> {
	if (definition.type === "method_definition") {
		const names = definition.namedChildren
			.filter((child) => child.type === "method_parameter")
			.flatMap((parameter) => parameter.namedChildren.filter((each) => each.type === "identifier"))
			.map((name) => name.text);
		return new Set(names);
	}
	const declarator = definition.childForFieldName("declarator");
	const function_ = declarator?.descendantsOfType("function_declarator")[0] ?? declarator;
	const list = function_?.childForFieldName("parameters");
	const names = (list === null || list === undefined ? [] : codeOf(list)).flatMap((parameter) => {
		const name = parameter.childForFieldName("declarator");
		const found = name?.type === "identifier" ? name : name?.descendantsOfType("identifier")[0];
		return found === undefined || found === null ? [] : [found.text];
	});
	return new Set(names);
}

/**
 * The expression a body's one statement returns or makes, without parentheses.
 * @param definition The function or method definition.
 * @returns The expression, or undefined.
 */
function bodyExpression(definition: Node): Node | undefined {
	const body =
		definition.childForFieldName("body") ??
		definition.namedChildren.find((child) => child.type === "compound_statement");
	const statements = body === null || body === undefined ? [] : codeOf(body);
	const [only] = statements;
	if (statements.length !== 1 || only === undefined || !MAKERS.has(only.type)) return undefined;
	let expression = codeOf(only)[0];
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
 * The root of the callee a function or method only passes its call on to.
 * @param definition The function or method definition.
 * @returns The callee's root, such as `save`, `db_`, `this` or `self`, or
 * undefined when it decides something.
 */
function cPassesTo(definition: Node): string | undefined {
	const call = bodyExpression(definition);
	if (call?.type !== "call_expression" && call?.type !== "message_expression") return undefined;
	const parameters = parametersOf(definition);
	const passed = argumentsOf(call);
	const all = passed.every((each) => each.type === "identifier" && parameters.has(each.text));
	if (passed.length === 0 || !all) return undefined;
	return rootOf(call.childForFieldName(call.type === "call_expression" ? "function" : "receiver"));
}

export { cPassesTo };
