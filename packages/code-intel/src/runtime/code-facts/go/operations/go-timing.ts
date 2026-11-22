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
	 * A `go` statement starts what it holds.
	 * @param holder The syntax.
	 * @returns Whether it starts it.
	 */
	starts: (holder) => holder.type === "go_statement",
	/**
	 * A bare call is plain.
	 * @returns The call site.
	 */
	bare: () => "plain",
};

export { GO_TIMING };
