// Starting and stopping an Archboard server (ADR 0021): how long a start waits
// to be ready, how long a stop drains, and how long `archboard stop` watches the
// server go.

import { bound, polled } from "#shared/constants/uses.ts";

/** `server.httpStopGrace`, named once so that `server.stopPidfileWait` can be twice it. */
const HTTP_STOP_GRACE_MS = 250;

/** An Archboard server starting, draining and stopping. */
const SERVER_LIFECYCLE = {
	/** Public server readiness classification. Pulls against mandatory Codex startup readiness. */
	"server.startupReadiness": polled(8000, "the started Archboard server to answer as itself"),
	/**
	 * Longest a stop attempt waits for admitted request parsing and explicit
	 * mutation work to settle before refusing teardown and restoring admission.
	 *
	 * It stays below the CLI's five-second stop observation window, so a stuck
	 * request produces a healthy, inspectable refusal rather than looking like a
	 * dead server. A disconnected model-lock waiter does not spend this budget: its request
	 * signal cancels its wait immediately.
	 */
	"server.mutationDrain": bound(1000, "admitted writes to settle before the server stops"),
	/**
	 * Grace for existing HTTP connections after write admission closes. It stays
	 * below the CLI health probe so a stuck keep-alive is forced closed before the
	 * next stop observation. WebSocket clients close in their own earlier owner.
	 */
	"server.httpStopGrace": bound(HTTP_STOP_GRACE_MS, "open HTTP connections to close"),
	/**
	 * How long `archboard stop` waits for the pidfile of a process that no longer
	 * answers to go away before it reports the process as stuck. A server stops
	 * answering when it closes its listener but removes its pidfile only after the
	 * close finishes, which takes up to `server.httpStopGrace`, so this is twice that grace.
	 */
	"server.stopPidfileWait": polled(
		2 * HTTP_STOP_GRACE_MS,
		"the pidfile of a server that stopped answering to go away",
	),
	/**
	 * How long `archboard stop` waits for a server it signalled to stop answering
	 * before it reports that the server did not stop. The server drains write
	 * admission, then closes its listener before Codex process cleanup finishes.
	 * Observing /health stop answering does not prove that the child and
	 * its group have been reaped. This bounds only the CLI observation, independently
	 * of `codex.composedShutdown`. A timeout report does not interrupt the server's
	 * owned cleanup or remove its pidfile.
	 */
	"server.stopConfirm": polled(5000, "the signalled Archboard server to stop answering"),
};

export { SERVER_LIFECYCLE };
