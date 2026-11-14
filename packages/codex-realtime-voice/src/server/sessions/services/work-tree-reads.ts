// What a work tree stop reads of one thread (ADR 0048): its running turn and the requests waiting
// in its queue. A thread whose queue was empty is read again after that listing, so a request
// that left the queue and started a turn while it was listed is still seen.

import type { ThreadId, TurnId, QueuedSubmissionId } from "@archboard/codex-app-server/identity";
import type { CodexSession } from "@archboard/codex-app-server/session";
import type { CodexThreadStatusType } from "@archboard/codex-app-server/contract";

/** The reads and effects a stop needs from the Codex session. */
type WorkTreeStopSession = Pick<
	CodexSession,
	| "threadRead"
	| "threadListPage"
	| "threadTurnsListPage"
	| "queueListPage"
	| "queueDelete"
	| "turnInterrupt"
>;

/** What one pass saw of one thread of the work tree. */
interface ObservedThread {
	readonly threadId: ThreadId;
	/** The running turn, null when none runs, or "unknown" when Codex says active but names none. */
	readonly running: TurnId | null | "unknown";
	/** The requests waiting in its queue, or null when the thread or its queue could not be read. */
	readonly queued: readonly QueuedSubmissionId[] | null;
}

/**
 * The turn running on a thread that Codex reports as active, from its newest turns. A thread
 * summary carries no turns, so only this listing names the running turn.
 * @param session Lists turns.
 * @param threadId The thread.
 * @returns The running turn, or "unknown" when no listed turn is in progress.
 */
async function runningTurn(
	session: WorkTreeStopSession,
	threadId: ThreadId,
): Promise<TurnId | "unknown"> {
	const page = await session.threadTurnsListPage({
		threadId,
		limit: 5,
		sortDirection: "desc",
		itemsView: "notLoaded",
	});
	return page.data.find((turn) => turn.status === "inProgress")?.id ?? "unknown";
}

/**
 * Every request waiting in a thread's queue.
 * @param session Lists queues.
 * @param threadId The thread.
 * @returns The queued requests, in queue order.
 * @throws {Error} When Codex repeats a cursor, so the listing would never end.
 */
async function queuedRequests(
	session: WorkTreeStopSession,
	threadId: ThreadId,
): Promise<readonly QueuedSubmissionId[]> {
	const ids: QueuedSubmissionId[] = [];
	const seen = new Set<string>();
	let cursor: string | null = null;
	do {
		// oxlint-disable-next-line no-await-in-loop -- pagination is sequential by contract: each page's cursor comes from the one before it
		const page = await session.queueListPage({ threadId, cursor });
		ids.push(...page.data.map((submission) => submission.id));
		cursor = page.nextCursor;
		if (cursor !== null && seen.has(cursor)) {
			throw new Error("The queue listing repeated a cursor.");
		}
		if (cursor !== null) seen.add(cursor);
	} while (cursor !== null);
	return ids;
}

/**
 * The turn running on a thread now, read again after its empty queue was listed: a request that
 * left the queue while it was listed started a turn that the first status read could not see.
 * @param session Reads threads and turns.
 * @param threadId The thread.
 * @returns What the thread runs; a read that fails leaves the thread unread.
 */
async function readAgain(
	session: WorkTreeStopSession,
	threadId: ThreadId,
): Promise<ObservedThread> {
	const status = await session
		.threadRead({ threadId, includeTurns: false })
		.then(({ thread }) => thread.status.type)
		.catch(() => null);
	if (status === null) {
		return { threadId, running: null, queued: null };
	}
	const running =
		status === "active"
			? await runningTurn(session, threadId).catch(() => "unknown" as const)
			: null;
	return { threadId, running, queued: [] };
}

/**
 * Observe one thread whose status is known. A thread that is not loaded runs nothing and starts
 * nothing until something loads it, so its queue is not read. A thread that ran nothing and whose
 * queue was empty is read once more.
 * @param session Reads turns and queues.
 * @param threadId The thread.
 * @param status Its status type as Codex reported it.
 * @returns What it runs and what waits on it; a read that fails reads as unknown.
 */
async function observeThread(
	session: WorkTreeStopSession,
	threadId: ThreadId,
	status: CodexThreadStatusType,
): Promise<ObservedThread> {
	if (status === "notLoaded") {
		return { threadId, running: null, queued: [] };
	}
	const [running, queued] = await Promise.all([
		status === "active"
			? runningTurn(session, threadId).catch(() => "unknown" as const)
			: Promise.resolve(null),
		queuedRequests(session, threadId).catch(() => null),
	]);
	return running === null && queued?.length === 0
		? readAgain(session, threadId)
		: { threadId, running, queued };
}

export { observeThread };
export type { ObservedThread, WorkTreeStopSession };
