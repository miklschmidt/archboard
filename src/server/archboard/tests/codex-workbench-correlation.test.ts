// Which target a coordinator callback is correlated against, after a relink.
//
// A pane relinked from thread A to an existing thread B moves the thread-context
// binding and leaves the workhorse snapshot naming A — it is still the thread
// that started this child. Every settled event then names B, and a coordinator
// correlating against A rejected both halves of the rule at once: B's own
// writes were not recognised as its own, and everybody else's failed the link
// match as a stale link.
//
// The subtler half is that a target cannot be assembled from both. A thread and
// the operation that bound it are proved together by the epoch authority, so
// asking it to prove thread B against the operation that bound thread A is
// answered `mismatched_thread` — and then nothing is delivered at all. The
// epoch authority here is a real one: it checks the record it hands back
// against the request, exactly as the production one does, so a mixture fails
// this owner rather than passing it.

import { expect, test } from "bun:test";

import { workhorseLink } from "../codex-workbench-adapters.js";

/** One thread and the operation that bound it. */
interface Bound {
	readonly threadId: string;
	readonly operationId: string;
}

/** The thread that started the child, with its own binding operation. */
const STARTED: Bound = { threadId: "thread-a", operationId: "operation-a" };

/** The thread a relink bound afterwards, with the operation that did it. */
const RELINKED: Bound = { threadId: "thread-b", operationId: "operation-b" };

/**
 * An epoch authority that proves a target only when its thread and its
 * operation belong together, which is what the production one does.
 * @returns The authority, and what it was asked to prove.
 */
function epochAuthority() {
	const asked: { threadId: string; operationId: string }[] = [];
	return {
		asked,
		assertCurrent: (request: { threadId: string; operationId: string }) => {
			asked.push({ threadId: request.threadId, operationId: request.operationId });
			const owner = [STARTED, RELINKED].find(
				(candidate) => candidate.operationId === request.operationId,
			);
			if (owner === undefined || owner.threadId !== request.threadId) {
				throw new Error(
					`mismatched_thread: operation ${request.operationId} belongs to ` +
						`${owner?.threadId ?? "no thread"}, not ${request.threadId}`,
				);
			}
			return { record: { operationId: request.operationId, threadId: request.threadId } };
		},
	};
}

/**
 * A graph whose workhorse started the child on one thread, and whose delivery is
 * bound to another — what a relink to an existing thread leaves behind.
 * @param bound The thread the pane is bound to now, or null for no binding.
 * @returns The `created` components stand-in.
 */
function graph(bound: Bound | null) {
	return {
		workhorse: {
			snapshot: () => ({
				state: "ready",
				threadId: STARTED.threadId,
				childId: "child-1",
				epoch: "epoch-1",
				operationId: STARTED.operationId,
				binding: { paneId: "pane-a", revision: 1 },
			}),
		},
		semanticDelivery: {
			snapshot: () => ({
				token: { revision: 2 },
				binding:
					bound === null
						? null
						: {
								paneId: "pane-a",
								target: {
									threadId: bound.threadId,
									childId: "child-1",
									epoch: "epoch-1",
									operationId: bound.operationId,
								},
								link: {
									paneId: "pane-a",
									revision: 9,
									link: { state: "executable", threadId: bound.threadId },
								},
							},
			}),
		},
	};
}

test("the correlation is the bound target whole: its thread and the operation that bound it", () => {
	const epoch = epochAuthority();

	const correlated = workhorseLink(graph(RELINKED) as never, epoch.assertCurrent as never);

	expect(String(correlated?.target.threadId)).toBe("thread-b");
	expect(String(correlated?.target.operationId)).toBe("operation-b");
	// And the link evidence with it, which is the other half of the stale-link bug.
	expect(correlated?.binding.revision).toBe(9);
	// Proved as one thing: the authority was asked about B's own operation and
	// nothing else. Asked to prove B against A's operation it would refuse, and
	// the coordinator would hear nothing at all.
	expect(epoch.asked).toEqual([{ threadId: "thread-b", operationId: "operation-b" }]);
});

test("with nothing bound the whole target is the workhorse's own", () => {
	const epoch = epochAuthority();

	const correlated = workhorseLink(graph(null) as never, epoch.assertCurrent as never);

	expect(String(correlated?.target.threadId)).toBe("thread-a");
	expect(String(correlated?.target.operationId)).toBe("operation-a");
	expect(correlated?.binding.revision).toBe(1);
	expect(epoch.asked).toEqual([{ threadId: "thread-a", operationId: "operation-a" }]);
});
