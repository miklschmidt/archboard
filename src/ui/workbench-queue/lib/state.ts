import type { BrowserSnapshot } from "../../../shared/codex-browser-model/index.js";
import type { BrowserWorkbenchState } from "../../workbench-transport/index.js";

import type {
	WorkbenchQueueChildIdentity,
	WorkbenchQueueEntry,
	WorkbenchQueueProjectionInput,
	WorkbenchQueueState,
} from "./contract.js";

interface WorkbenchQueueNarrative {
	readonly label: string;
	readonly detail: string;
	readonly recovery: string;
}

/**
 * One sentence of truth and one of recovery per state. Colour is never the only
 * carrier: the label, the detail, and the recovery all name the state.
 */
export const WORKBENCH_QUEUE_NARRATIVES = {
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

const QUEUE_STATUS_STATES = {
	empty: "empty",
	queued: "queued",
	running: "running",
	interrupted: "interrupted_preserved",
	approval_blocked: "approval_blocked",
	failed: "failed",
	completed: "completed",
	stale: "stale",
	reconnecting: "reconnecting",
	unavailable: "unavailable",
	outcome_unknown: "outcome_unknown",
} as const satisfies Record<WorkbenchQueueEntry["status"], WorkbenchQueueState>;

export const WORKBENCH_QUEUE_ENTRY_STATUS_LABELS = {
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

/** Statuses whose submission the host is no longer holding as pending work. */
const SETTLED_ENTRY_STATUSES = new Set<WorkbenchQueueEntry["status"]>([
	"completed",
	"failed",
	"empty",
]);

export function isSettledEntryStatus(status: WorkbenchQueueEntry["status"]): boolean {
	return SETTLED_ENTRY_STATUSES.has(status);
}

export function childIdentityOf(
	link: BrowserSnapshot["threadLink"] | null,
): WorkbenchQueueChildIdentity | null {
	if (link === null || link.childId === null || link.epoch === null) return null;
	return { childId: link.childId, epoch: link.epoch };
}

function sameChild(
	left: WorkbenchQueueChildIdentity | null,
	right: WorkbenchQueueChildIdentity | null,
): boolean {
	if (left === null || right === null) return left === right;
	return left.childId === right.childId && left.epoch === right.epoch;
}

/**
 * A restart is the one state the wire cannot spell on its own: the queue looks
 * ordinary, but it belongs to a child that replaced the one the person was
 * reading. Comparing the presented child with the snapshot's is the only
 * authoritative way to see it (ADR 0019).
 */
function isRestarted(
	presented: WorkbenchQueueChildIdentity | null | undefined,
	current: WorkbenchQueueChildIdentity | null,
): boolean {
	if (presented === null || presented === undefined || current === null) return false;
	return !sameChild(presented, current);
}

type Readiness = Extract<BrowserWorkbenchState, { readonly kind: "readiness" }>["state"];

/**
 * Every readiness arm the host can publish, and what it means for the queue.
 *
 * A readiness state always arrives over a live socket, so none of these arms is
 * `disconnected`: they say something about the host's Codex session, not about
 * this pane's connection. `null` hands the decision to the queue's own status —
 * the session is up and the queue is the only thing left to describe. The
 * exhaustive map is the point: a new readiness arm fails type-check here rather
 * than silently falling through to an ordinary label.
 */
const READINESS_STATES = {
	// The child is down or terminally failed. A storage mismatch is the same
	// thing with a named cause: the session cannot run until it is fixed.
	stopped: "session_stopped",
	storage_mismatch: "session_stopped",
	backoff: "reconnecting",
	reconnecting: "reconnecting",
	incompatible_contract: "session_incompatible",
	// The session runs; it has no thread link to hold a queue for yet.
	initialized: "unavailable",
	login_capable: "unavailable",
	signed_out: "unavailable",
	login_pending: "unavailable",
	account_ready: "unavailable",
	thread_capable: null,
} as const satisfies Record<Readiness, WorkbenchQueueState | null>;

/**
 * The transport state that outranks the queue's own status. The stream owner
 * reports a sequence gap as `stale`; the connection owner reports a dropped or
 * retrying socket, which is the only thing `disconnected` ever means; and
 * readiness is the host telling the browser how far its own Codex child has got
 * over a socket that is still up.
 */
function connectionState(state: BrowserWorkbenchState): WorkbenchQueueState | null {
	if (state.kind === "stream") return "stale";
	if (state.kind === "connection")
		return state.state === "reconnecting" || state.state === "backoff"
			? "reconnecting"
			: "disconnected";
	return READINESS_STATES[state.state];
}

/**
 * Resolve the one state that governs the whole region. Uncertainty and staleness
 * outrank an ordinary queue status, because both mean the queue on screen has
 * not been proven current — and a restart outranks everything, because the
 * queue on screen belonged to another child.
 */
export function resolveWorkbenchQueueState(
	input: WorkbenchQueueProjectionInput,
): WorkbenchQueueState {
	const snapshot = input.state.snapshot;
	if (snapshot === null) {
		if (input.state.kind === "connection" && input.state.state === "reconnecting") return "loading";
		return connectionState(input.state) ?? "loading";
	}
	if (isRestarted(input.presentedChild, childIdentityOf(snapshot.threadLink))) return "restarted";
	if (input.settlement?.state === "outcome_unknown") return "outcome_unknown";
	const connection = connectionState(input.state);
	if (connection !== null) return connection;
	if (snapshot.threadLink.state !== "executable") return "unavailable";
	return QUEUE_STATUS_STATES[snapshot.queue.status];
}

/** Whether a state means the queue on screen has not been proven current. */
export function isStaleWorkbenchQueueState(state: WorkbenchQueueState): boolean {
	return (
		state === "stale" ||
		state === "reconnecting" ||
		state === "restarted" ||
		state === "outcome_unknown" ||
		state === "session_stopped" ||
		state === "session_incompatible" ||
		state === "loading"
	);
}
