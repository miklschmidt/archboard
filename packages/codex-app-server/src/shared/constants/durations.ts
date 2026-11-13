// The `codex app-server` child and the requests to its session.
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
// within the composed cap. The voice's realtime stop is the voice's own duration,
// and a test of the voice checks that it fits inside this cap.

/** The `codex app-server` child: its restart backoff and its ordered shutdown. */
const CODEX_PROCESS_MS = Object.freeze({
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
} satisfies Record<string, number>);

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
const CODEX_SESSION_MS = Object.freeze({
	/**
	 * How long an explanation waits for the turn of a message that an idle thread took from the
	 * queue by itself, before it tells the reader to look at the conversation.
	 */
	explanationTurnStart: 15_000,
	/** How often an answer that Codex writes reaches the panel: a reader sees it arrive in steps. */
	explanationText: 150,
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
} satisfies Record<string, number>);

export { CODEX_PROCESS_MS, CODEX_SESSION_MS, codexRestartDelayMs };
