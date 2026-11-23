// How Python awaits and starts a call, and which of its functions are async
// (call-timing.ts, TASK-663.09).

import type { Node } from "web-tree-sitter";
import type { Definition } from "#runtime/code-facts/operations/facts.ts";
import { lastWord, type TimingSyntax } from "#runtime/code-facts/operations/call-timing.ts";

/**
 * The calls that run what they are handed as a task, a thread or a process:
 * `asyncio.create_task(work())`, `threading.Thread(target=work)`.
 */
const STARTERS = new Set([
	"create_task",
	"ensure_future",
	"run_coroutine_threadsafe",
	"to_thread",
	"run_in_executor",
	"start_soon",
	"Thread",
	"Process",
]);

/** How Python awaits and starts a call: `await`, and a task starter. A bare call's callee decides. */
const PYTHON_TIMING: TimingSyntax = {
	calls: new Set(["call"]),
	awaits: new Set(["await"]),
	wrappers: new Set(["parenthesized_expression"]),
	continuations: new Map(),
	/**
	 * A task starter starts what its arguments hold.
	 * @param holder The syntax.
	 * @param held Its child.
	 * @returns Whether it starts it.
	 */
	starts: (holder, held) =>
		holder.type === "call" &&
		holder.childForFieldName("arguments")?.id === held.id &&
		STARTERS.has(lastWord(holder.childForFieldName("function"))),
	/**
	 * A bare call is as its callee is.
	 * @returns The call site.
	 */
	bare: () => "unawaited",
};

/**
 * Whether a function is async: `async def`. A `def` and a lambda are synchronous.
 * @param declaration The declaration, through its decorators.
 * @returns The mark.
 */
function pythonAsync(declaration: Node): Pick<Definition, "async"> {
	const defined =
		declaration.type === "decorated_definition"
			? declaration.childForFieldName("definition")
			: declaration;
	if (defined?.type !== "function_definition") return { async: false };
	return { async: defined.children.some((child) => child.type === "async") };
}

export { PYTHON_TIMING, pythonAsync };
