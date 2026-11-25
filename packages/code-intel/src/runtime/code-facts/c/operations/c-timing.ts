// How C, C++ and Objective-C start a call (call-timing.ts, TASK-663.09). C
// has no async callee: a call that no thread or queue starts returns when
// its callee does. An Objective-C message handed a block, or a completion
// handler, may call back later, so its timing is unknown.

import type { Node } from "web-tree-sitter";
import { lastWord, type TimingSyntax } from "#runtime/code-facts/operations/call-timing.ts";

/** The functions that run what they are handed on another thread or queue. */
const STARTERS = new Set([
	"pthread_create",
	"thrd_create",
	"CreateThread",
	"_beginthread",
	"_beginthreadex",
	"dispatch_async",
	"dispatch_async_f",
	"dispatch_after",
	"dispatch_after_f",
	"dispatch_group_async",
	"dispatch_group_async_f",
	"dispatch_barrier_async",
	"dispatch_barrier_async_f",
	"async",
]);

/** The selectors of messages that run what they are handed on another thread or queue. */
const STARTING_SELECTORS =
	/^(?:performSelectorInBackground|detachNewThread|addOperationWithBlock)/u;

/** The selectors of messages that take a block to call back, maybe later. */
const CALLS_BACK = /completion|handler|reply|callback/iu;

/**
 * The selector a message sends, its parts joined by `:`.
 * @param send The message.
 * @returns The selector.
 */
function selectorOf(send: Node): string {
	return send
		.childrenForFieldName("method")
		.map((part) => part.text)
		.join(":");
}

/**
 * Whether a call or a message starts what it holds.
 * @param holder The syntax.
 * @param held Its child.
 * @returns Whether it starts it.
 */
function startsThread(holder: Node, held: Node): boolean {
	if (holder.type === "message_expression") {
		const receiver = holder.childForFieldName("receiver");
		return receiver?.id !== held.id && STARTING_SELECTORS.test(selectorOf(holder));
	}
	return holder.type === "call_expression" && startsArguments(holder, held);
}

/**
 * Whether a call is to a starter, and the node is its arguments.
 * @param call The call.
 * @param held Its child.
 * @returns Whether it starts it.
 */
function startsArguments(call: Node, held: Node): boolean {
	return (
		call.childForFieldName("arguments")?.id === held.id &&
		STARTERS.has(lastWord(call.childForFieldName("function")))
	);
}

/**
 * Whether a message is handed a block, or names a handler to call back.
 * @param send The message.
 * @returns True when it is.
 */
function callsBack(send: Node): boolean {
	return (
		send.namedChildren.some((child) => child.type === "block_literal") ||
		CALLS_BACK.test(selectorOf(send))
	);
}

/** How C, C++ and Objective-C start a call: a thread, a dispatch queue, an operation queue. */
const C_TIMING: TimingSyntax = {
	calls: new Set(["call_expression", "message_expression"]),
	awaits: new Set(),
	wrappers: new Set(["parenthesized_expression"]),
	continuations: new Map(),
	starts: startsThread,
	/**
	 * A bare call is plain, and so is a message that calls nothing back.
	 * @param call The call or the message.
	 * @returns The call site.
	 */
	bare: (call) => (call.type === "message_expression" && callsBack(call) ? "unknown" : "plain"),
};

export { C_TIMING };
