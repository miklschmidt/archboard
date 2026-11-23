// How Go starts a call (call-timing.ts, TASK-663.09). Go has no async
// callee: a call with no `go` before it returns when its callee does.

import type { TimingSyntax } from "#runtime/code-facts/operations/call-timing.ts";

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
	starts: (holder, held, site) => {
		if (holder.type !== "go_statement" || held.type !== "call_expression") return false;
		if (held.id === site.id) return true;
		const callee = held.childForFieldName("function");
		return (
			callee?.type === "func_literal" &&
			callee.startIndex <= site.startIndex &&
			site.endIndex <= callee.endIndex
		);
	},
	/**
	 * A bare call is plain.
	 * @returns The call site.
	 */
	bare: () => "plain",
};

export { GO_TIMING };
