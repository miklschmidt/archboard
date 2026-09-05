// What the queue is, in workhorse and coordinator terms: the linked thread,
// its active turn, its child, the coordinator that queues through it, and
// how many pending approvals hold it.

import type { BrowserSnapshot } from "@/shared/codex-browser-model";
import type {
	WorkbenchQueueCorrelation,
	WorkbenchQueueState,
} from "@/ui/workbench-queue/contracts";
import { WORKBENCH_QUEUE_NARRATIVES } from "@/ui/workbench-queue/lib/narratives";
import { childIdentityOf } from "@/ui/workbench-queue/lib/state";

type Turn = NonNullable<BrowserSnapshot["timeline"]>["turns"][number];
type CorrelationFacts = Omit<WorkbenchQueueCorrelation, "summary">;

const ABSENT: CorrelationFacts = Object.freeze({
	linkState: null,
	workhorseThreadId: null,
	workhorseThreadStatus: null,
	child: null,
	activeTurnId: null,
	activeTurnStatus: null,
	coordinatorThreadId: null,
	coordinatorState: null,
	blockingApprovals: 0,
	sequence: null,
});

/**
 * The turn the workhorse is on: the last in-progress turn, else the last turn.
 * @param snapshot The published snapshot.
 * @returns The turn, or null when the timeline shows none.
 */
function activeTurn(snapshot: BrowserSnapshot): Turn | null {
	const turns = snapshot.timeline?.turns ?? [];
	return turns.findLast((turn) => turn.status === "inProgress") ?? turns.at(-1) ?? null;
}

/**
 * How many approvals are pending on the linked workhorse.
 * @param snapshot The published snapshot.
 * @returns The count.
 */
function pendingApprovals(snapshot: BrowserSnapshot): number {
	const threadId = snapshot.threadLink.threadId;
	return snapshot.approvals.filter(
		(approval) => approval.threadId === threadId && approval.lifecycle.state === "pending",
	).length;
}

/**
 * The words for the workhorse thread.
 * @param facts The correlation facts.
 * @returns A phrase.
 */
function workhorseText(facts: CorrelationFacts): string {
	return facts.workhorseThreadId === null
		? "no linked workhorse"
		: `workhorse thread ${facts.workhorseThreadId}`;
}

/**
 * The words for the active turn.
 * @param facts The correlation facts.
 * @returns A phrase.
 */
function turnText(facts: CorrelationFacts): string {
	return facts.activeTurnId === null
		? "no workhorse turn on record"
		: `turn ${facts.activeTurnId} (${facts.activeTurnStatus ?? "unknown"})`;
}

/**
 * One sentence naming the queue, its workhorse, and its coordinator.
 * @param state The governing state.
 * @param facts The correlation facts.
 * @param entryCount How many entries the host holds.
 * @returns The sentence.
 */
function correlationSummary(
	state: WorkbenchQueueState,
	facts: CorrelationFacts,
	entryCount: number,
): string {
	const coordinator =
		facts.coordinatorThreadId === null
			? "no coordinator thread"
			: `coordinator thread ${facts.coordinatorThreadId}`;
	const submissions = entryCount === 1 ? "1 submission" : `${entryCount} submissions`;
	return `${WORKBENCH_QUEUE_NARRATIVES[state].label}: ${submissions} on ${workhorseText(facts)}, ${turnText(facts)}, queued through ${coordinator}.`;
}

/**
 * The correlation facts a published snapshot carries.
 * @param snapshot The published snapshot.
 * @param sequence The transport sequence, or null.
 * @returns The facts.
 */
function snapshotFacts(snapshot: BrowserSnapshot, sequence: number | null): CorrelationFacts {
	const turn = activeTurn(snapshot);
	return {
		linkState: snapshot.threadLink.state,
		workhorseThreadId: snapshot.threadLink.threadId,
		workhorseThreadStatus: snapshot.threadLink.status,
		child: childIdentityOf(snapshot.threadLink),
		activeTurnId: turn?.turnId ?? null,
		activeTurnStatus: turn?.status ?? null,
		coordinatorThreadId: snapshot.coordinator.threadId,
		coordinatorState: snapshot.coordinator.state,
		blockingApprovals: pendingApprovals(snapshot),
		sequence,
	};
}

/**
 * The queue's correlation with its workhorse and coordinator.
 * @param state The governing state.
 * @param snapshot The published snapshot, or null.
 * @param sequence The transport sequence, or null.
 * @param entryCount How many entries the host holds.
 * @returns The correlation.
 */
function projectCorrelation(
	state: WorkbenchQueueState,
	snapshot: BrowserSnapshot | null,
	sequence: number | null,
	entryCount: number,
): WorkbenchQueueCorrelation {
	const facts = snapshot === null ? { ...ABSENT, sequence } : snapshotFacts(snapshot, sequence);
	return Object.freeze({ ...facts, summary: correlationSummary(state, facts, entryCount) });
}

export { projectCorrelation };
