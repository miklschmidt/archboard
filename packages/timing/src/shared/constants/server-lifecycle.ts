// Starting and stopping an Archboard server (ADR 0021): how long a start waits
// to be ready, how long a stop drains, and how long `archboard stop` watches the
// server go.

import { durations } from "#shared/constants/durations.ts";

/** `SERVER_LIFECYCLE_MS.httpStopGrace`, named once so that `stopPidfileWait` can be twice it. */
const HTTP_STOP_GRACE_MS = 250;

/** An Archboard server starting, draining and stopping. */
const SERVER_LIFECYCLE_MS = durations({
	/** Public server readiness classification. Pulls against mandatory Codex startup readiness. */
	startupReadiness: 8000,
	/**
	 * Longest a stop attempt waits for admitted request parsing and explicit
	 * mutation work to settle before refusing teardown and restoring admission.
	 *
	 * It stays below the CLI's five-second stop observation window, so a stuck
	 * request produces a healthy, inspectable refusal rather than looking like a
	 * dead server. A disconnected board-lock waiter does not spend this budget: its request
	 * signal cancels the BOARD_LOCK_MS.poll wait immediately.
	 */
	mutationDrain: 1000,
	/**
	 * Grace for existing HTTP connections after write admission closes. It stays
	 * below the CLI health probe so a stuck keep-alive is forced closed before the
	 * next stop observation. WebSocket clients close in their own earlier owner.
	 */
	httpStopGrace: HTTP_STOP_GRACE_MS,
	/**
	 * How long `archboard stop` waits for the pidfile of a process that no longer
	 * answers to go away before it reports the process as stuck. A server stops
	 * answering when it closes its listener but removes its pidfile only after the
	 * close finishes, which takes up to SERVER_LIFECYCLE_MS.httpStopGrace, so this is
	 * twice that grace.
	 */
	stopPidfileWait: 2 * HTTP_STOP_GRACE_MS,
	/** Gap between two looks at that pidfile, short against SERVER_LIFECYCLE_MS.stopPidfileWait. */
	stopPidfilePoll: 50,
	/**
	 * How long `archboard stop` waits for a server it signalled to stop answering
	 * before it reports that the server did not stop. The server drains write
	 * admission, then closes its listener before Codex process cleanup finishes.
	 * Observing /health stop answering does not prove that the child and
	 * its group have been reaped. This bounds only the CLI observation, independently
	 * of CODEX_PROCESS_MS.composedShutdown. A timeout report does not interrupt the server's
	 * owned cleanup or remove its pidfile.
	 */
	stopConfirm: 5000,
	/** Gap between two health probes while `archboard stop` waits for SERVER_LIFECYCLE_MS.stopConfirm. */
	stopProbePoll: 200,
});

export { SERVER_LIFECYCLE_MS };
