// How TypeScript awaits and starts a call, and which of its callables are
// async (call-timing.ts, TASK-663.09).

import type { Node } from "web-tree-sitter";
import type { Definition } from "#runtime/code-facts/operations/facts.ts";
import { lastWord, type TimingSyntax } from "#runtime/code-facts/operations/call-timing.ts";

/** The calls that run what they are handed later, on the event loop. */
const STARTERS = new Set([
	"setTimeout",
	"setInterval",
	"setImmediate",
	"queueMicrotask",
	"nextTick",
	"requestAnimationFrame",
]);

/**
 * How TypeScript awaits and starts a call: `await`, `.then` on its result, a
 * timer or the microtask queue. A bare call's callee decides.
 */
const TYPESCRIPT_TIMING: TimingSyntax = {
	calls: new Set(["call_expression", "new_expression"]),
	awaits: new Set(["await_expression"]),
	wrappers: new Set([
		"parenthesized_expression",
		"non_null_expression",
		"as_expression",
		"satisfies_expression",
	]),
	continuations: new Map([
		["then", "awaited"],
		["catch", "pass"],
		["finally", "pass"],
	]),
	/**
	 * A timer's or the microtask queue's call starts what its arguments hold.
	 * @param holder The syntax.
	 * @param held Its child.
	 * @returns Whether it starts it.
	 */
	starts: (holder, held) =>
		holder.type === "call_expression" &&
		holder.childForFieldName("arguments")?.id === held.id &&
		STARTERS.has(lastWord(holder.childForFieldName("function"))),
	/**
	 * A construction is plain; any other call is as its callee is.
	 * @param call The call.
	 * @returns The call site.
	 */
	bare: (call) => (call.type === "new_expression" ? "plain" : "unawaited"),
};

/** Callable literals and declarations, inside which a `return` is another function's. */
const FUNCTIONS = new Set([
	"function_declaration",
	"generator_function_declaration",
	"method_definition",
	"arrow_function",
	"function_expression",
	"generator_function",
	"class_body",
]);

/** A declared return type that is a promise. */
const PROMISED = /^:\s*(?:Promise|PromiseLike)\s*</u;

/**
 * Whether a function body returns a value of its own, which may be a promise.
 * @param body The body.
 * @returns True when one of its own `return` statements returns a value.
 */
function returnsValue(body: Node): boolean {
	return body.descendantsOfType("return_statement").some((statement) => {
		if (statement.namedChildCount === 0) return false;
		for (let at = statement.parent; at !== null && at.id !== body.id; at = at.parent) {
			if (FUNCTIONS.has(at.type)) return false;
		}
		return true;
	});
}

/**
 * Whether a callable is async: `async`, or a declared promise. One with
 * another declared return type, or a block body that returns no value, is
 * synchronous. Any other may return a promise, so it is not told.
 * @param callable The function literal or declaration.
 * @returns The mark, or nothing when the declaration does not tell.
 */
function typeScriptAsync(callable: Node): Pick<Definition, "async"> {
	if (callable.children.some((child) => child.type === "async")) return { async: true };
	const returns = callable.childForFieldName("return_type");
	if (returns !== null) return { async: PROMISED.test(returns.text) };
	const body = callable.childForFieldName("body");
	if (body?.type !== "statement_block" || returnsValue(body)) return {};
	return { async: false };
}

export { TYPESCRIPT_TIMING, typeScriptAsync };
