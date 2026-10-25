// Which workhorse a callback is about. A tab session has one workhorse for each checkout (ADR
// 0050), so a callback is correlated with the workhorse its own thread names: an operation's, the
// thread workhorse news came from, and for an announced change the workhorse voice is bound to.

import type { ThreadId } from "@archboard/codex-app-server/identity";
import type {
	CoordinatorCallbackLinkCorrelation,
	CoordinatorCallbackOptions,
	CoordinatorCallbackSource,
} from "#runtime/protocol/coordinator-callbacks/contract.ts";

/**
 * The current link of the workhorse that runs on a thread.
 * @param options - The callback options, for the live links.
 * @param threadId - The workhorse thread, or null.
 * @returns The link, or null when no ready workhorse of the tab session runs on that thread.
 */
function workhorseLinkOf(
	options: Pick<CoordinatorCallbackOptions, "workhorseLinks">,
	threadId: ThreadId | null,
): CoordinatorCallbackLinkCorrelation | null {
	if (threadId === null) {
		return null;
	}
	return options.workhorseLinks().find((link) => link.target.threadId === threadId) ?? null;
}

/**
 * The workhorse thread a source event names.
 * @param event - The source event.
 * @returns The thread, or null when the event names none.
 */
function workhorseThreadOf(event: CoordinatorCallbackSource): ThreadId | null {
	if (!("kind" in event)) {
		return event.correlation.workhorseThreadId;
	}
	return event.kind === "workhorse_news" ? event.workhorseThreadId : event.workhorse.threadId;
}

export { workhorseLinkOf, workhorseThreadOf };
