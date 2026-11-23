// How Go starts a call (call-timing.ts, TASK-663.09). Go has no async
// callee: a call with no `go` before it returns when its callee does.

import type { Node } from "web-tree-sitter";
import type { TimingSyntax } from "#runtime/code-facts/operations/call-timing.ts";

/**
 * Whether a call stands in the function literal that a `go` call runs, so that it runs in the goroutine.
 * @param call The call `go` starts.
 * @param site The call or name being classified.
 * @returns True inside the literal.
 */
function inLiteral(call: Node, site: Node): boolean {
	const callee = call.childForFieldName("function");
	return (
		callee?.type === "func_literal" &&
		callee.startIndex <= site.startIndex &&
		site.endIndex <= callee.endIndex
	);
}

/** How Go starts a call: `go f()`, or a call in the function literal `go` runs. */
const GO_TIMING: TimingSyntax = {
	calls: new Set(["call_expression"]),
	awaits: new Set(),
	wrappers: new Set(["parenthesized_expression"]),
	continuations: new Map(),
	/**
	 * A `go` statement starts its call and runs an inline function in the goroutine.
	 * @param holder The syntax.
	 * @param held Its call.
	 * @param site The call or name being classified.
	 * @returns Whether it starts it.
	 */
	starts: (holder, held, site) =>
		holder.type === "go_statement" &&
		held.type === "call_expression" &&
		(held.id === site.id || inLiteral(held, site)),
	/**
	 * A bare call is plain.
	 * @returns The call site.
	 */
	bare: () => "plain",
};

export { GO_TIMING };
