// How C# awaits and starts a call, and which of its methods are async
// (call-timing.ts, TASK-663.09).

import type { Node } from "web-tree-sitter";
import type { Definition } from "#runtime/code-facts/operations/facts.ts";
import { lastWord, type TimingSyntax } from "#runtime/code-facts/operations/call-timing.ts";

/** The methods that queue what they are handed to run on another thread. */
const STARTERS = new Set(["StartNew", "QueueUserWorkItem", "UnsafeQueueUserWorkItem"]);

/** A declared return type that is a task, which the caller may await or leave. */
const TASKS = /^(?:System\.Threading\.Tasks\.)?(?:Task|ValueTask|IAsyncEnumerable)\b/u;

/**
 * Whether a call or construction starts what its arguments hold:
 * `Task.Run`, `Task.Factory.StartNew`, `ThreadPool.QueueUserWorkItem`, `new Thread`.
 * @param holder The syntax.
 * @param held Its child.
 * @returns Whether it starts it.
 */
function startsTask(holder: Node, held: Node): boolean {
	if (holder.childForFieldName("arguments")?.id !== held.id) return false;
	if (holder.type === "object_creation_expression") {
		return lastWord(holder.childForFieldName("type")) === "Thread";
	}
	return holder.type === "invocation_expression" && callsStarter(holder);
}

/**
 * Whether a call is to a task starter.
 * @param call The call.
 * @returns True for `Task.Run` and the queues of the thread pool.
 */
function callsStarter(call: Node): boolean {
	const callee = call.childForFieldName("function");
	const spelled = (callee?.text ?? "").replaceAll(/\s|<[^<>]*>/gu, "");
	return spelled.endsWith("Task.Run") || STARTERS.has(lastWord(callee));
}

/**
 * How C# awaits and starts a call: `await` (through `ConfigureAwait`),
 * `ContinueWith`, and a task starter. A construction is plain, and another
 * bare call's callee decides.
 */
const CSHARP_TIMING: TimingSyntax = {
	calls: new Set(["invocation_expression", "object_creation_expression"]),
	awaits: new Set(["await_expression"]),
	wrappers: new Set(["parenthesized_expression"]),
	continuations: new Map([
		["ConfigureAwait", "pass"],
		["ContinueWith", "awaited"],
	]),
	starts: startsTask,
	/**
	 * A construction is plain; any other call is as its callee is.
	 * @param call The call.
	 * @returns The call site.
	 */
	bare: (call) => (call.type === "object_creation_expression" ? "plain" : "unawaited"),
};

/**
 * Whether a method is async: `async`, or one that returns a task.
 * @param node The declaration.
 * @returns The mark, or nothing for a declaration that is no method.
 */
function csharpAsync(node: Node): Pick<Definition, "async"> {
	if (node.type !== "method_declaration" && node.type !== "local_function_statement") return {};
	if (node.namedChildren.some((child) => child.type === "modifier" && child.text === "async")) {
		return { async: true };
	}
	return { async: TASKS.test(node.childForFieldName("returns")?.text ?? "") };
}

export { CSHARP_TIMING, csharpAsync };
