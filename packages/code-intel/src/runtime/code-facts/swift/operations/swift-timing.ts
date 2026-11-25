// How Swift awaits and starts a call (call-timing.ts, TASK-663.09). Swift
// makes every call of an async function say `await`, so a call outside any
// `await` is plain, while one inside another call's `await` may be either.

import type { Node } from "web-tree-sitter";
import { lastWord, type TimingSyntax } from "#runtime/code-facts/operations/call-timing.ts";

/** The callees that run the closure they are handed as a task. */
const TASKS = new Set(["Task", "Task.detached"]);

/** The methods of a queue that run the closure they are handed later: `DispatchQueue.main.async`. */
const QUEUED = new Set(["async", "asyncAfter", "addOperation"]);

/**
 * Whether a call runs the closure it is handed as a task, or on a queue.
 * @param holder The call.
 * @param held Its child.
 * @returns Whether it starts it.
 */
function startsClosure(holder: Node, held: Node): boolean {
	if (holder.type !== "call_expression" || held.type !== "call_suffix") return false;
	const callee = holder.namedChildren[0];
	return TASKS.has((callee?.text ?? "").replaceAll(/\s/gu, "")) || QUEUED.has(lastWord(callee));
}

/**
 * Whether syntax starts what it holds: a task or a queue's closure, or the value of `async let`.
 * @param holder The syntax.
 * @param held Its child.
 * @returns Whether it starts it.
 */
function startsTask(holder: Node, held: Node): boolean {
	if (holder.type !== "property_declaration") return startsClosure(holder, held);
	return holder.childForFieldName("value")?.id === held.id && /^async\s/u.test(holder.text);
}

/**
 * Whether a call is inside an `await` that covers more than it, which may be its own.
 * @param call The call.
 * @returns True when one holds it.
 */
function underAwait(call: Node): boolean {
	for (let at = call.parent; at !== null; at = at.parent) {
		if (at.type === "await_expression") return true;
	}
	return false;
}

/** How Swift awaits and starts a call: `await`, `Task {}`, a queue's closure, `async let`. */
const SWIFT_TIMING: TimingSyntax = {
	calls: new Set(["call_expression"]),
	awaits: new Set(["await_expression"]),
	wrappers: new Set(),
	continuations: new Map(),
	starts: startsTask,
	/**
	 * A bare call is plain, unless an `await` around it may be its own.
	 * @param call The call.
	 * @returns The call site.
	 */
	bare: (call) => (underAwait(call) ? "unknown" : "plain"),
};

export { SWIFT_TIMING };
