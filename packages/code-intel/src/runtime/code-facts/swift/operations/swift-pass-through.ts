// Whether a Swift function only passes its call on (TASK-646.12), as
// TypeScript's reading decides it (typescript-pass-through.ts): its body is
// one call, returned or made, behind any `try` or `await`, that passes every
// argument straight from its own parameters, one at least, whatever labels
// the arguments carry. The callee is a name or a chain of names from a name
// or `self`, and what the fact names is its root. A call of a type, whose
// name Swift writes with a capital, `Money(cents: cents)`, constructs a
// value, as TypeScript's `new` does, and passes nothing on.

import type { Node } from "web-tree-sitter";
import { memberName } from "#runtime/code-facts/swift/operations/swift-math.ts";

/** Wrappers that hand on the value of the expression inside. */
const UNWRAPPED = new Set(["try_expression", "await_expression"]);

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
 * The one expression a function's body makes or returns, without `try` or `await`.
 * @param declaration The function declaration.
 * @returns The expression, or undefined.
 */
function bodyExpression(declaration: Node): Node | undefined {
	const statements = declaration.childForFieldName("body")?.namedChildren[0];
	const all = statements?.type === "statements" ? statements.namedChildren : [];
	const [only] = all.filter((each) => each.type !== "comment" && each.type !== "multiline_comment");
	if (only === undefined || all.length !== 1) return undefined;
	let expression: Node | null | undefined =
		only.type === "control_transfer_statement" ? only.childForFieldName("result") : only;
	while (expression !== null && expression !== undefined && UNWRAPPED.has(expression.type)) {
		expression = expression.childForFieldName("expr");
	}
	return expression ?? undefined;
}

/**
 * The root of a callee that is a name or a chain of names from a name or `self`.
 * @param callee The callee.
 * @returns The root, or undefined for any other callee.
 */
function rootOf(callee: Node | undefined): string | undefined {
	if (callee === undefined) return undefined;
	if (callee.type === "simple_identifier" || callee.type === "self_expression") return callee.text;
	const target = callee.type === "navigation_expression" ? callee.childForFieldName("target") : null;
	return target === null ? undefined : rootOf(target);
}

/**
 * Whether a call passes only its caller's parameters, one at least, with no trailing closure.
 * @param call The call.
 * @param parameters The parameters.
 * @returns True when it does.
 */
function passesParameters(call: Node, parameters: ReadonlySet<string>): boolean {
	const suffix = call.namedChildren.find((child) => child.type === "call_suffix");
	const list = suffix?.namedChildren[0];
	if (list?.type !== "value_arguments" || suffix?.namedChildren.length !== 1) return false;
	const values = list.namedChildren
		.filter((each) => each.type === "value_argument")
		.map((each) => each.childForFieldName("value"));
	return (
		values.length > 0 &&
		values.every((value) => value?.type === "simple_identifier" && parameters.has(value.text))
	);
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
	const last = callee?.type === "navigation_expression" ? memberName(callee) : callee?.text;
	return /^\p{Lu}/u.test(last ?? "") ? undefined : rootOf(callee);
}

export { swiftPassesTo };
