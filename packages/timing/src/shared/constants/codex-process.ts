// The `codex app-server` child: its restart backoff and its ordered shutdown.
//
// These are authored policy values, not consumer defaults. Their expiry
// classifications matter: an expiry bounds a retry, lease, readiness,
// freshness, approval, recovery, or shutdown operation, but never proves that
// a remote mutation failed. Consumers must use these names and must not add a
// local duration or an override hook.
//
// Shutdown is ordered around the child lifecycle: stop realtime, settle local
// waiters, close stdin, wait for EOF, TERM, then freeze and KILL the group, all
// within the composed cap.

import { backoff, bound, delay, polled } from "#shared/constants/uses.ts";

/** `codex.composedShutdown`, named once so that the drain of a killed group can last as long. */
const COMPOSED_SHUTDOWN_MS = 10_000;

/** `codex.requestSettlement`, named once so that the child's readiness can wait as long. */
const REQUEST_SETTLEMENT_MS = 30_000;

/** The `codex app-server` child: its readiness, its restart backoff and its ordered shutdown. */
const CODEX_PROCESS = {
	/**
	 * Restart delay: it doubles after each failed child attempt from its first second, caps at the
	 * maximum, and resets only after one account-ready session. Its cap pulls against request
	 * settlement and the backoff ceiling.
	 */
	"codex.restart": backoff(1000, 30_000),
	/** How long a spawned child may take to acknowledge typed readiness: one request settlement. */
	"codex.readiness": delay(
		REQUEST_SETTLEMENT_MS,
		"the Codex app-server to acknowledge typed readiness",
	),
	/**
	 * Stdin EOF grace lets the child consume drained frames before TERM and ends on closure.
	 * Realtime stop, EOF and TERM leave one second of the composed cap for group absence proof.
	 */
	"codex.stdinEofGrace": bound(1000, "the Codex child to exit on stdin EOF"),
	/** TERM grace classification. Pulls against realtime stop before TERM-to-KILL escalation. */
	"codex.termGrace": polled(5000, "a TERMed Codex process group to exit"),
	/**
	 * How long KILL waits for the TERMed group to freeze. A group freezes in a few
	 * observation polls, but a member in a killable kernel wait never reads as stopped
	 * and still dies on KILL. Pulls against the absence-proof second the composed
	 * shutdown cap keeps, so a freeze that cannot finish leaves time to prove the
	 * killed group gone.
	 */
	"codex.groupFreeze": polled(500, "a TERMed Codex process group to freeze"),
	/** How long a killed group may take to disappear: the rest of the composed cap. */
	"codex.killDrain": polled(COMPOSED_SHUTDOWN_MS, "a killed Codex process group to disappear"),
	/** Composed-shutdown cap classification. Pulls against realtime stop, stdin EOF grace, and TERM grace. */
	"codex.composedShutdown": bound(
		COMPOSED_SHUTDOWN_MS,
		"the Codex child and its process group to shut down",
	),
};

export { CODEX_PROCESS };
