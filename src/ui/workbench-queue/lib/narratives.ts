// One sentence of truth and one of recovery per queue state, and the words
// for each entry status. Colour is never the only carrier: the label, the
// detail and the recovery all name the state.

import type { WorkbenchQueueEntry, WorkbenchQueueState } from "@/ui/workbench-queue/contracts";

/** The words for one state. */
interface WorkbenchQueueNarrative {
	readonly label: string;
	readonly detail: string;
	readonly recovery: string;
}

const WORKBENCH_QUEUE_NARRATIVES = {
	loading: {
		label: "Loading queue",
		detail: "The authoritative queue snapshot for this thread link has not arrived yet.",
		recovery: "Wait for the snapshot, or refresh the list to request it again.",
	},
	empty: {
		label: "Queue empty",
		detail: "The linked workhorse is holding no queued submissions.",
		recovery: "Add a submission to queue work behind the current turn.",
	},
	queued: {
		label: "Queued",
		detail: "The linked workhorse is holding queued submissions in this order.",
		recovery: "Edit, cancel, reorder, or start a submission the coordinator owns.",
	},
	running: {
		label: "Running",
		// The authoritative list holds pending submissions only, and the busy turn
		// may be direct input rather than anything this queue supplied, so this
		// says what the host's facts support: the workhorse is busy.
		detail: "The linked workhorse is busy, so this queue is waiting behind the current turn.",
		recovery: "Wait for the turn to settle, or interrupt it from the workhorse timeline.",
	},
	interrupted_preserved: {
		label: "Interrupted, queue preserved",
		detail: "The workhorse turn was interrupted and the host preserved every queued submission.",
		recovery: "Start the next submission when the workhorse is idle, or cancel what is stale.",
	},
	approval_blocked: {
		label: "Blocked on approval",
		detail: "The linked workhorse is waiting on an approval before it can drain this queue.",
		recovery: "Answer the pending approval request, then the queue continues.",
	},
	failed: {
		label: "Failed",
		detail: "The host reported a failure for this queue on the linked workhorse.",
		recovery: "Refresh the list to read the authoritative queue, then retry or cancel.",
	},
	restarted: {
		label: "Workhorse restarted",
		detail:
			"The Codex child that owned the queue on screen was replaced, so its execution proof is void.",
		recovery: "Refresh the list to read the new child's queue before commanding it.",
	},
	completed: {
		label: "Completed",
		detail: "Every submission the host is reporting for this queue has completed.",
		recovery: "Add a submission, or refresh the list to read the authoritative queue.",
	},
	stale: {
		label: "Stale snapshot",
		detail: "The workbench stream skipped a sequence, so the queue on screen may not be current.",
		recovery: "Refresh the list to replace it with an authoritative snapshot.",
	},
	reconnecting: {
		label: "Reconnecting",
		detail: "The workbench is reconnecting, so the queue cannot be commanded.",
		recovery: "Wait for the connection, then refresh the list before commanding the queue.",
	},
	disconnected: {
		label: "Disconnected",
		detail: "This pane has no workbench socket, so there is nothing to read a queue from.",
		recovery: "Reconnect the workbench; refreshing needs a socket and cannot recover this.",
	},
	session_stopped: {
		label: "Codex session stopped",
		detail: "This pane is connected, but the host's Codex session is not running.",
		recovery: "Refresh the list once the host's Codex session is running again.",
	},
	session_incompatible: {
		label: "Codex session incompatible",
		detail:
			"This pane is connected, but the host's Codex session reports a contract it cannot serve.",
		recovery:
			"Install the pinned Codex version and restart the host session; refreshing will keep reporting this until then.",
	},
	unavailable: {
		label: "Queue unavailable",
		detail: "The host is not publishing a queue for the thread link this pane is on.",
		recovery: "Choose an executable thread link, then refresh the list.",
	},
	outcome_unknown: {
		label: "Outcome unknown",
		detail: "A queue mutation's outcome was lost, so nothing on screen may be read as settled.",
		recovery: "Refresh the list to read the authoritative queue before commanding it again.",
	},
} as const satisfies Record<WorkbenchQueueState, WorkbenchQueueNarrative>;

const WORKBENCH_QUEUE_ENTRY_STATUS_LABELS = {
	empty: "Empty",
	queued: "Queued",
	running: "Running",
	interrupted: "Interrupted, preserved",
	approval_blocked: "Blocked on approval",
	failed: "Failed",
	completed: "Completed",
	stale: "Stale",
	reconnecting: "Reconnecting",
	unavailable: "Unavailable",
	outcome_unknown: "Outcome unknown",
} as const satisfies Record<WorkbenchQueueEntry["status"], string>;

export { WORKBENCH_QUEUE_ENTRY_STATUS_LABELS, WORKBENCH_QUEUE_NARRATIVES };
