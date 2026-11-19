// Whether a Swift function only passes its call on (TASK-646.12), as
// TypeScript's reading decides it (typescript-pass-through.ts): its body is
// one call, returned or made, behind any `try` or `await`, that passes every
// argument straight from its own parameters, one at least, whatever labels
// the arguments carry. The callee is a name or a chain of names from a name
// or `self`, and what the fact names is its root. A call of a type, whose
// name Swift writes with a capital, `Money(cents: cents)`, constructs a
// value, as TypeScript's `new` does, and passes nothing on.

import type { Node } from "web-tree-sitter";
import { argumentsOf, memberName } from "#runtime/code-facts/swift/operations/swift-math.ts";

/** Wrappers that hand on the value of the expression inside. */
const UNWRAPPED = new Set(["try_expression", "await_expression"]);

/** The comments a body can hold beside its statement. */
const COMMENTS = new Set(["comment", "multiline_comment"]);

/**
 * The names a function's parameters bind.
 * @param declaration The function declaration.
 * @returns The names.
 */
function parametersOf(declaration: Node): Set<string> {
	const names = declaration.namedChildren
		.filter((child) => child.type === "parameter")
		.flatMap((parameter) =>
			parameter.childrenForFieldName("name").filter((name) => name.type === "simple_identifier"),
		)
		.map((name) => name.text);
	return new Set(names);
}

/**
 * The one statement of a function's body.
 * @param declaration The function declaration.
 * @returns The statement, or undefined for a body of another number.
 */
function onlyStatement(declaration: Node): Node | undefined {
	const statements = declaration.childForFieldName("body")?.namedChildren[0];
	if (statements?.type !== "statements") return undefined;
	const code = statements.namedChildren.filter((each) => !COMMENTS.has(each.type));
	return code.length === 1 ? code[0] : undefined;
}

/**
 * What a statement makes: the value a `return` returns, else the statement.
 * @param only The statement.
 * @returns The expression, or null for a `return` with none.
 */
function resultOf(only: Node): Node | null {
	return only.type === "control_transfer_statement" ? only.childForFieldName("result") : only;
}

/**
 * The one expression a function's body makes or returns, without `try` or `await`.
 * @param declaration The function declaration.
 * @returns The expression, or undefined.
 */
function bodyExpression(declaration: Node): Node | undefined {
	const only = onlyStatement(declaration);
	let expression = only === undefined ? null : resultOf(only);
	while (expression !== null && UNWRAPPED.has(expression.type)) {
		expression = expression.childForFieldName("expr");
	}
	return expression ?? undefined;
}

/**
 * The root of a callee that is a name or a chain of names from a name or `self`.
 * @param callee The callee.
 * @returns The root, or undefined for any other callee.
 */
function rootOf(callee: Node | null | undefined): string | undefined {
	if (callee === null || callee === undefined) return undefined;
	if (callee.type === "simple_identifier" || callee.type === "self_expression") return callee.text;
	return callee.type === "navigation_expression"
		? rootOf(callee.childForFieldName("target"))
		: undefined;
}

/**
 * Whether a call passes only its caller's parameters, one at least, with no trailing closure.
 * @param call The call.
 * @param parameters The parameters.
 * @returns True when it does.
 */
function passesParameters(call: Node, parameters: ReadonlySet<string>): boolean {
	const values = argumentsOf(call) ?? [];
	const all = values.every(
		(value) => value.type === "simple_identifier" && parameters.has(value.text),
	);
	return values.length > 0 && all;
}

/**
 * Whether a callee names a type, which Swift writes with a capital: its call constructs.
 * @param callee The callee.
 * @returns True when it does.
 */
function namesType(callee: Node | undefined): boolean {
	const last = callee?.type === "navigation_expression" ? memberName(callee) : callee?.text;
	return /^\p{Lu}/u.test(last ?? "");
}

/**
 * The root of the callee a function only passes its call on to.
 * @param declaration The function declaration.
 * @returns The callee's root, such as `save`, `store` or `self`, or undefined
 * when it decides something.
 */
function swiftPassesTo(declaration: Node): string | undefined {
	if (declaration.type !== "function_declaration") return undefined;
	const call = bodyExpression(declaration);
	if (call?.type !== "call_expression" || !passesParameters(call, parametersOf(declaration))) {
		return undefined;
	}
	const callee = call.namedChildren[0];
	return namesType(callee) ? undefined : rootOf(callee);
}

export { swiftPassesTo };
