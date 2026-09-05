// Pure projection of the thread queue: what each entry may do, and the words
// for the queue's own state. Public so tests can reach it.

import type { BrowserQueue } from "@/shared/codex-browser-model";

type QueueStatus = BrowserQueue["status"];
type QueueEntry = BrowserQueue["entries"][number];

/** Which actions one queue entry offers. */
interface QueueEntryActions {
	moveUp: boolean;
	moveDown: boolean;
	remove: boolean;
	sendNow: boolean;
}

/** The queue's own state, as words and a recovery hint. */
interface QueueStateText {
	text: string;
	/** True when the host cannot act on the queue right now. */
	recovering: boolean;
}

const QUEUE_TEXT: Record<QueueStatus, string> = {
	empty: "Queue empty",
	queued: "Queued",
	running: "Running",
	interrupted: "Interrupted",
	approval_blocked: "Waiting for approval",
	failed: "Failed",
	completed: "Completed",
	stale: "Stale",
	reconnecting: "Reconnecting",
	unavailable: "Queue unavailable",
	outcome_unknown: "Outcome unknown",
};

const RECOVERY_STATES: ReadonlySet<QueueStatus> = new Set([
	"reconnecting",
	"unavailable",
	"outcome_unknown",
]);
const REMOVABLE_STATES: ReadonlySet<QueueStatus> = new Set([
	"queued",
	"interrupted",
	"failed",
	"completed",
	"stale",
]);

/**
 * Whether an entry is still waiting its turn.
 * @param entry The queue entry.
 * @returns True when queued.
 */
function isWaiting(entry: QueueEntry): boolean {
	return entry.status === "queued";
}

const NO_ACTIONS: QueueEntryActions = {
	moveUp: false,
	moveDown: false,
	remove: false,
	sendNow: false,
};

/**
 * Whether the entry at one index is waiting, so a neighbour may swap with it.
 * @param queue The published queue.
 * @param index The neighbour's position.
 * @returns True when a waiting entry sits there.
 */
function waitingAt(queue: BrowserQueue, index: number): boolean {
	const neighbour = queue.entries[index];
	return neighbour !== undefined && isWaiting(neighbour);
}

/**
 * Whether a waiting entry may be started now: not while a turn runs or an
 * approval blocks the queue.
 * @param status The queue status.
 * @returns True when send-now is offered.
 */
function canSendNow(status: QueueStatus): boolean {
	return status !== "running" && status !== "approval_blocked";
}

/**
 * The actions available on the entry at one index.
 * @param queue The published queue.
 * @param index The entry's position.
 * @returns Which actions apply; all false while the queue is recovering.
 */
function queueEntryActions(queue: BrowserQueue, index: number): QueueEntryActions {
	const entry = queue.entries[index];
	if (entry === undefined || RECOVERY_STATES.has(queue.status)) {
		return NO_ACTIONS;
	}
	const waiting = isWaiting(entry);
	return {
		moveUp: waiting && waitingAt(queue, index - 1),
		moveDown: waiting && waitingAt(queue, index + 1),
		remove: REMOVABLE_STATES.has(entry.status),
		sendNow: waiting && canSendNow(queue.status),
	};
}

/**
 * The queue's own state as words.
 * @param queue The published queue.
 * @returns The state text and whether the host is recovering.
 */
function queueStateText(queue: BrowserQueue): QueueStateText {
	const recovering = RECOVERY_STATES.has(queue.status);
	const count = queue.entries.length;
	const base = QUEUE_TEXT[queue.status];
	return { text: count === 0 ? base : `${base} · ${count}`, recovering };
}

/**
 * The words for one entry's status.
 * @param status The entry status.
 * @returns The status text.
 */
function queueEntryStatusText(status: QueueStatus): string {
	return QUEUE_TEXT[status];
}

export {
	queueEntryActions,
	queueEntryStatusText,
	queueStateText,
	type QueueEntryActions,
	type QueueStateText,
};
