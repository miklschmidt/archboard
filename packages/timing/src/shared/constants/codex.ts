// Codex workbench policy.
//
// These are authored policy values, not consumer defaults. Their expiry
// classifications matter: an expiry bounds a retry, lease, readiness,
// freshness, approval, recovery, or shutdown operation, but never proves that
// a remote mutation failed. Consumers must use these names and must not add a
// local duration or an override hook.
//
// Restart delay doubles after each failed child attempt, caps at the maximum,
// and resets only after one account-ready session (`codexRestartDelayMs`).
// Shutdown is ordered around the child lifecycle: stop realtime, settle local
// waiters, close stdin, wait for EOF, TERM, then freeze and KILL the group, all
// within the composed cap.

import { durations } from "#shared/constants/durations.ts";

/** The `codex app-server` child: its restart backoff and its ordered shutdown. */
const CODEX_PROCESS_MS = durations({
	/** Retry-delay classification. Pulls against the first restart attempt. */
	restartBase: 1000,
	/** Retry-delay cap classification. Pulls against request settlement and the backoff ceiling. */
	restartMax: 30_000,
	/**
	 * Stdin EOF grace lets the child consume drained frames before TERM and ends on closure.
	 * Realtime stop, EOF and TERM leave one second of the composed cap for group absence proof.
	 */
	stdinEofGrace: 1000,
	/** TERM grace classification. Pulls against realtime stop before TERM-to-KILL escalation. */
	termGrace: 5000,
	/**
	 * How long KILL waits for the TERMed group to freeze. A group freezes in a few
	 * observation polls, but a member in a killable kernel wait never reads as stopped
	 * and still dies on KILL. Pulls against the absence-proof second the composed
	 * shutdown cap keeps, so a freeze that cannot finish leaves time to prove the
	 * killed group gone.
	 */
	groupFreeze: 500,
	/** Composed-shutdown cap classification. Pulls against realtime stop, stdin EOF grace, and TERM grace. */
	composedShutdown: 10_000,
});

/**
 * The delay before the next restart of a failed `codex app-server` child: the
 * base delay doubled once for every restart already attempted since the last
 * account-ready session, capped at the maximum.
 * @param restartAttempt Restarts already attempted since account readiness.
 * @returns The delay in milliseconds.
 */
function codexRestartDelayMs(restartAttempt: number): number {
	return Math.min(
		CODEX_PROCESS_MS.restartMax,
		CODEX_PROCESS_MS.restartBase * 2 ** Math.min(restartAttempt, 30),
	);
}

/** Requests to the app-server session, and how often its thread state is read. */
const CODEX_SESSION_MS = durations({
	/** Uncertainty-bound classification. Pulls against a lost non-idempotent response before `outcome_unknown`. */
	requestSettlement: 30_000,
	/**
	 * Bounds dynamic wait detection latency against app-server thread status
	 * reads. Request uncertainty must contain a whole number of polls so the last
	 * observation cannot cross the settlement boundary.
	 */
	waitTargetPoll: 250,
	/**
	 * Read-amplification floor classification. Pulls against the wait-target poll
	 * below and request settlement above.
	 *
	 * Serving a browser snapshot request re-reads the authoritative workhorse
	 * queue, which is a paginated app-server call. A client is free to ask for a
	 * snapshot as often as it likes, so the server coalesces concurrent re-reads and
	 * will not start a new one inside this floor. It sits at or above one
	 * wait-target poll, because a browser must not out-run the cadence the server
	 * observes thread state at, and far below request settlement, so a person's
	 * refresh still reads as immediate.
	 */
	queueRereadFloor: 1000,
});

/**
 * The voice: its realtime start, stop, recovery and the freshness it needs, and how soon the
 * browser's voice client opens its socket again.
 */
const CODEX_REALTIME_MS = durations({
	/** Realtime-readiness timeout classification. Pulls against permission-independent SDP/start readiness. */
	start: 15_000,
	/** Realtime-stop timeout classification. Pulls against TERM grace so realtime stops first. */
	stop: 3000,
	/** Realtime-recovery window classification. Pulls against context freshness while reconnecting. */
	recovery: 45_000,
	/** How long an announced context change stays fresh enough to deliver. Pulls against realtime recovery. */
	contextFreshness: 30_000,
	/**
	 * How long the voice client waits before opening its socket again after the
	 * socket is lost, and between failed attempts after that. Pulls against the tab
	 * session grace: a reload plus these redials must fit inside it, or the server
	 * ends the conversation before the client is back. It is also the beat of a
	 * retry, so a shorter value would hammer a server that is restarting.
	 */
	clientReconnect: 3000,
});

/** A browser command an agent leases, and the approvals a person answers. */
const CODEX_APPROVAL_MS = durations({
	/** Browser-command lease classification. Pulls against the public browser wait contract and approval expiry. */
	browserCommandLease: 150_000,
	/** Visual-approval expiry classification. Pulls against the browser-command lease. */
	expiry: 90_000,
	/** Spoken-approval gate expiry classification. Pulls against visual approval expiry. */
	spokenGate: 60_000,
});

/**
 * How long a browser tab's conversation outlives its last browser socket. Pulls against a
 * reload plus CODEX_REALTIME_MS.clientReconnect redials, which it must outlast or a reload loses the
 * conversation, and CODEX_APPROVAL_MS.expiry, which it must stay under so a closed tab's approvals
 * end as "tab session ended" rather than expiring unanswered.
 */
const TAB_SESSION_GRACE_MS = 60_000;

export {
	codexRestartDelayMs,
	CODEX_PROCESS_MS,
	CODEX_SESSION_MS,
	CODEX_REALTIME_MS,
	CODEX_APPROVAL_MS,
	TAB_SESSION_GRACE_MS,
};
