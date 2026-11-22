// How Rust awaits and starts a call, and which of its functions are async
// (call-timing.ts, TASK-663.09).

import type { Node } from "web-tree-sitter";
import type { Definition } from "#runtime/code-facts/operations/facts.ts";
import { lastWord, type TimingSyntax } from "#runtime/code-facts/operations/call-timing.ts";

/** The calls that run what they are handed as a task or a thread: `tokio::spawn`, `thread::spawn`. */
const STARTERS = new Set(["spawn", "spawn_blocking", "spawn_local"]);

/** How Rust awaits and starts a call: `.await`, and a spawn. A bare call's callee decides. */
const RUST_TIMING: TimingSyntax = {
	calls: new Set(["call_expression"]),
	awaits: new Set(["await_expression"]),
	wrappers: new Set(["parenthesized_expression", "try_expression"]),
	continuations: new Map(),
	/**
	 * A spawn starts what its arguments hold.
	 * @param holder The syntax.
	 * @param held Its child.
	 * @returns Whether it starts it.
	 */
	starts: (holder, held) =>
		holder.type === "call_expression" &&
		holder.childForFieldName("arguments")?.id === held.id &&
		STARTERS.has(lastWord(holder.childForFieldName("function"))),
	/**
	 * A bare call is as its callee is.
	 * @returns The call site.
	 */
	bare: () => "unawaited",
};

/**
 * Whether a function is async: `async fn`, or one that returns a `Future`.
 * @param item The item.
 * @returns The mark, or nothing for an item that is no function.
 */
function rustAsync(item: Node): Pick<Definition, "async"> {
	if (item.type !== "function_item" && item.type !== "function_signature_item") return {};
	const returned = item.childForFieldName("return_type")?.text ?? "";
	return { async: declaredAsync(item) || /\bFuture\b/u.test(returned) };
}

/**
 * Whether a function's modifiers say `async`.
 * @param item The function.
 * @returns True for `async fn`.
 */
function declaredAsync(item: Node): boolean {
	const modifiers = item.namedChildren.find((child) => child.type === "function_modifiers");
	return modifiers?.children.some((child) => child.type === "async") ?? false;
}

export { RUST_TIMING, rustAsync };
