// Whether a call site awaits its callee, starts it as a task, or calls it
// plainly (TASK-663.09): the fact that decides between the kinds `sync` and
// `async` (ADR 0094).
//
// A call is awaited when the code waits for it without blocking: `await f()`,
// `f().await`, or `f().then(...)`. It is started when a task starter holds it,
// as an argument or inside a closure it is handed: `create_task`, `Task.Run`,
// `Task {}`, `spawn`, `go f()`, `dispatch_async`, `pthread_create`, and their
// kin in each grammar's table. Either way the caller goes on before the work
// is done, which is `async`. A plain call is a call of a callee known to be
// synchronous, which is `sync`.
//
// Some languages decide a bare call by syntax alone: Go and C have no async
// callee, and Swift makes every call of one say `await`. In TypeScript,
// Python, Rust and C# a call with no `await` around it may still return work
// that runs on (fire-and-forget), so the callee's declaration decides: the
// adapter marks such a call `unawaited`, and `resolvedTiming` reads the
// callee's `async` mark. Where nothing tells, the timing is `unknown`; a
// reading never guesses.

import type { Node } from "web-tree-sitter";
import type { Definition, Reference } from "#runtime/code-facts/operations/facts.ts";
import type { CallTiming } from "#shared/protocol/code-check.ts";

/**
 * How a call site runs its callee, as its file alone says it: `unawaited`
 * for a call that neither waits for nor starts its callee, in a language
 * where the callee's declaration decides whether that call is plain.
 */
type CallSite = CallTiming | "unawaited";

/** How one grammar writes awaiting and starting a call. */
interface TimingSyntax {
	/** The syntax that calls a name. Another way to run it, such as a decorator, has no timing. */
	readonly calls: ReadonlySet<string>;
	/** The syntax that awaits the expression it holds: `await f()`, `f().await`. */
	readonly awaits: ReadonlySet<string>;
	/** The syntax that only wraps an expression, as parentheses do. */
	readonly wrappers: ReadonlySet<string>;
	/**
	 * The methods that, called on a call's result, decide its timing, as
	 * `then` awaits it. `pass` hands the result on, as `catch` and C#'s
	 * `ConfigureAwait` do, so what is done with that method's call decides.
	 */
	readonly continuations: ReadonlyMap<string, CallTiming | "pass">;
	/**
	 * Whether syntax starts what one of its children holds as a task.
	 * @param holder The syntax.
	 * @param held Its child that holds the call.
	 * @param site The original call or name.
	 */
	readonly starts: (holder: Node, held: Node, site: Node) => boolean;
	/**
	 * What a call that is neither awaited nor started is.
	 * @param call The call.
	 */
	readonly bare: (call: Node) => CallSite;
}

/**
 * The last name a callee is spelled with: `spawn` in `tokio::spawn`,
 * `create_task` in `asyncio.create_task`, `Run` in `Task.Run<int>`.
 * @param callee The callee.
 * @returns The name, or the empty string when it ends in no name.
 */
function lastWord(callee: Node | null | undefined): string {
	const text = (callee?.text ?? "").replaceAll(/<[^<>]*>/gu, "").trim();
	return /[\p{L}\p{N}_$]+$/u.exec(text)?.[0] ?? "";
}

/**
 * The expression a call stands as, through the syntax that only wraps it.
 * @param call The call.
 * @param syntax The grammar's syntax.
 * @returns The outermost wrapper, or the call.
 */
function unwrapped(call: Node, syntax: TimingSyntax): Node {
	let outer = call;
	while (outer.parent !== null && syntax.wrappers.has(outer.parent.type)) outer = outer.parent;
	return outer;
}

/**
 * Whether a node is the first named child of the syntax that holds it, as
 * the object of a member, and the callee of a call, are.
 * @param holder The syntax, if any.
 * @param node The node.
 * @returns True when it leads it.
 */
function leads(holder: Node | null, node: Node): holder is Node {
	return holder !== null && holder.namedChildren[0]?.id === node.id;
}

/**
 * What the code does with a call's result, where a method called on it
 * decides: the call of that method, and the timing the method gives.
 * @param outer The call, as it stands.
 * @param syntax The grammar's syntax.
 * @returns The timing, or undefined when no such method is called on it.
 */
function continued(outer: Node, syntax: TimingSyntax): CallSite | undefined {
	const member = outer.parent;
	if (!leads(member, outer)) return undefined;
	const call = member.parent;
	if (!leads(call, member) || !syntax.calls.has(call.type)) return undefined;
	const timing = syntax.continuations.get(lastWord(member));
	return timing === "pass" ? directTiming(unwrapped(call, syntax), syntax) : timing;
}

/**
 * The timing a call's own place gives it: awaited, or decided by a method called on its result.
 * @param outer The call, as it stands.
 * @param syntax The grammar's syntax.
 * @returns The timing, or undefined when its place says none.
 */
function directTiming(outer: Node, syntax: TimingSyntax): CallSite | undefined {
	if (outer.parent !== null && syntax.awaits.has(outer.parent.type)) return "awaited";
	return continued(outer, syntax);
}

/**
 * Whether a task starter holds a node, as an argument or inside a closure it is handed.
 * @param node The node.
 * @param syntax The grammar's syntax.
 * @returns True when one does.
 */
function startedIn(node: Node, syntax: TimingSyntax): boolean {
	let held = node;
	for (let holder = node.parent; holder !== null; holder = holder.parent) {
		if (syntax.starts(holder, held, node)) return true;
		held = holder;
	}
	return false;
}

/**
 * How a use runs the name it spells: where the code calls it, how; and where
 * it passes the name on, started when a task starter is handed it, as
 * `pthread_create` is handed its thread's function.
 * @param site The syntax that runs the name, or, for a name passed on, the name as it stands.
 * @param runs Whether the code runs the name there, rather than passes it on.
 * @param syntax The grammar's syntax.
 * @returns The call site, or undefined for syntax that runs a name without
 * calling it and for a name passed to anything but a starter.
 */
function callSiteOf(site: Node, runs: boolean, syntax: TimingSyntax): CallSite | undefined {
	if (!runs) return startedIn(site, syntax) ? "started" : undefined;
	if (!syntax.calls.has(site.type)) return undefined;
	const direct = directTiming(unwrapped(site, syntax), syntax);
	if (direct !== undefined) return direct;
	return startedIn(site, syntax) ? "started" : syntax.bare(site);
}

/**
 * How a call site runs its callee, once the callee's declaration is known:
 * an unawaited call of an async callee starts it (fire-and-forget), and one
 * of a sync callee or a class is plain.
 * @param site The call site, as its file says it.
 * @param callee The callee's definition, where it is found.
 * @returns The timing.
 */
function resolvedTiming(site: CallSite, callee: Definition | undefined): CallTiming {
	return site === "unawaited" ? calleeTiming(callee) : site;
}

/**
 * How an unawaited call runs its callee: a class constructs, plainly; an
 * async callee is started; a sync one is plain.
 * @param callee The callee's definition, where it is found.
 * @returns The timing, or unknown where the callee does not tell.
 */
function calleeTiming(callee: Definition | undefined): CallTiming {
	if (callee?.kind === "class") return "plain";
	if (callee?.async === undefined) return "unknown";
	return callee.async ? "started" : "plain";
}

/**
 * The relationship kind a set of call sites decides: `async` when every one
 * is awaited or started, `sync` when every one is plain, and none when one
 * is unknown or they disagree.
 * @param timings The timings.
 * @returns The kind, or undefined.
 */
function callKindOf(timings: readonly CallTiming[]): "sync" | "async" | undefined {
	if (timings.length === 0) return undefined;
	if (timings.every((timing) => timing === "plain")) return "sync";
	return timings.every((timing) => timing === "awaited" || timing === "started")
		? "async"
		: undefined;
}

/**
 * The mark of a call's timing on a reference.
 * @param site The call site, or undefined where the reference calls nothing.
 * @returns The mark, or nothing.
 */
function timingMark(site: CallSite | undefined): Pick<Reference, "timing"> {
	return site === undefined ? {} : { timing: site };
}

export {
	type CallSite,
	type TimingSyntax,
	callKindOf,
	callSiteOf,
	lastWord,
	resolvedTiming,
	timingMark,
};
