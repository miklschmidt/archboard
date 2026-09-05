// Which one state governs the whole queue region. Uncertainty and staleness
// outrank an ordinary queue status, because both mean the queue on screen has
// not been proven current, and a restart outranks everything, because the
// queue on screen belonged to another child.

import type { BrowserSnapshot } from "@/shared/codex-browser-model";
import type {
	WorkbenchQueueChildIdentity,
	WorkbenchQueueEntry,
	WorkbenchQueueProjectionInput,
	WorkbenchQueueState,
} from "@/ui/workbench-queue/contracts";
import type { WorkbenchTransportState } from "@/ui/workbench-queue/transport-port";

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

/** Statuses whose submission the host is no longer holding as pending work. */
const SETTLED_ENTRY_STATUSES: ReadonlySet<WorkbenchQueueEntry["status"]> = new Set([
	"completed",
	"failed",
	"empty",
]);

const STALE_STATES: ReadonlySet<WorkbenchQueueState> = new Set([
	"stale",
	"reconnecting",
	"restarted",
	"outcome_unknown",
	"session_stopped",
	"session_incompatible",
	"loading",
]);

type Readiness = Extract<WorkbenchTransportState, { readonly kind: "readiness" }>["state"];

/**
 * Every readiness arm the host can publish, and what it means for the queue.
 *
 * A readiness state always arrives over a live socket, so none of these arms
 * is `disconnected`: they say something about the host's Codex session, not
 * about this pane's connection. `null` hands the decision to the queue's own
 * status. The exhaustive map is the point: a new readiness arm fails
 * type-check here rather than falling through to an ordinary label.
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
 * Whether the host no longer holds this entry as pending work.
 * @param status The entry status.
 * @returns True for completed, failed and empty.
 */
function isSettledEntryStatus(status: WorkbenchQueueEntry["status"]): boolean {
	return SETTLED_ENTRY_STATUSES.has(status);
}

/**
 * The child identity a thread link names, when it names one.
 * @param link The published thread link, or null before a snapshot.
 * @returns The child and epoch, or null for an unbound or inspect-only link.
 */
function childIdentityOf(
	link: BrowserSnapshot["threadLink"] | null,
): WorkbenchQueueChildIdentity | null {
	if (link?.state !== "executable") {
		return null;
	}
	return { childId: link.childId, epoch: link.epoch };
}

/**
 * Whether two child identities name the same child epoch.
 * @param left One identity, or null.
 * @param right The other identity, or null.
 * @returns True when both are null or both name the same child and epoch.
 */
function sameChild(
	left: WorkbenchQueueChildIdentity | null,
	right: WorkbenchQueueChildIdentity | null,
): boolean {
	if (left === null || right === null) {
		return left === right;
	}
	return left.childId === right.childId && left.epoch === right.epoch;
}

/**
 * A restart is the one state the wire cannot spell on its own: the queue looks
 * ordinary, but it belongs to a child that replaced the one the person was
 * reading. Comparing the presented child with the snapshot's is the only
 * authoritative way to see it (ADR 0019).
 * @param presented The child the queue on screen was presented for.
 * @param current The child the snapshot names now.
 * @returns True when the child changed.
 */
function isRestarted(
	presented: WorkbenchQueueChildIdentity | null | undefined,
	current: WorkbenchQueueChildIdentity | null,
): boolean {
	if (presented === null || presented === undefined || current === null) {
		return false;
	}
	return !sameChild(presented, current);
}

/**
 * The connection-owner state for a dropped or retrying socket.
 * @param state The connection state.
 * @returns Reconnecting while the socket retries, else disconnected.
 */
function connectionOwnerState(
	state: Extract<WorkbenchTransportState, { readonly kind: "connection" }>,
): WorkbenchQueueState {
	return state.state === "reconnecting" || state.state === "backoff"
		? "reconnecting"
		: "disconnected";
}

/**
 * The transport state that outranks the queue's own status. The stream owner
 * reports a sequence gap as stale; the connection owner reports a dropped or
 * retrying socket, which is the only thing disconnected ever means; readiness
 * is the host telling the browser how far its Codex child has got over a
 * socket that is still up.
 * @param state The transport state.
 * @returns The governing state, or null when the queue's own status decides.
 */
function connectionState(state: WorkbenchTransportState): WorkbenchQueueState | null {
	if (state.kind === "stream") {
		return "stale";
	}
	if (state.kind === "connection") {
		return connectionOwnerState(state);
	}
	return READINESS_STATES[state.state];
}

/**
 * The state before any snapshot has arrived.
 * @param state The transport state, which carries no snapshot.
 * @returns Loading while the first connection is made, else the connection state.
 */
function stateWithoutSnapshot(state: WorkbenchTransportState): WorkbenchQueueState {
	if (state.kind === "connection" && state.state === "reconnecting") {
		return "loading";
	}
	return connectionState(state) ?? "loading";
}

/**
 * The state once nothing outranks the queue: an inexecutable link has no
 * queue, else the queue's own status decides.
 * @param state The transport state.
 * @param snapshot The published snapshot.
 * @returns The governing state.
 */
function stateWithSnapshot(
	state: WorkbenchTransportState,
	snapshot: BrowserSnapshot,
): WorkbenchQueueState {
	const connection = connectionState(state);
	if (connection !== null) {
		return connection;
	}
	if (snapshot.threadLink.state !== "executable") {
		return "unavailable";
	}
	return QUEUE_STATUS_STATES[snapshot.queue.status];
}

/**
 * Resolve the one state that governs the whole region.
 * @param input The projection input.
 * @returns The governing state.
 */
function resolveWorkbenchQueueState(input: WorkbenchQueueProjectionInput): WorkbenchQueueState {
	const snapshot = input.state.snapshot;
	if (snapshot === null) {
		return stateWithoutSnapshot(input.state);
	}
	if (isRestarted(input.presentedChild, childIdentityOf(snapshot.threadLink))) {
		return "restarted";
	}
	if (input.settlement?.state === "outcome_unknown") {
		return "outcome_unknown";
	}
	return stateWithSnapshot(input.state, snapshot);
}

/**
 * Whether a state means the queue on screen has not been proven current.
 * @param state The governing state.
 * @returns True when nothing on screen may be treated as current.
 */
function isStaleWorkbenchQueueState(state: WorkbenchQueueState): boolean {
	return STALE_STATES.has(state);
}

export {
	childIdentityOf,
	isSettledEntryStatus,
	isStaleWorkbenchQueueState,
	resolveWorkbenchQueueState,
};
