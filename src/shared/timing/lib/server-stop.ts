/**
 * Grace for existing HTTP connections after write admission closes. It stays
 * below the CLI health probe so a stuck keep-alive is forced closed before the
 * next stop observation. WebSocket clients close in their own earlier owner.
 */
const SERVER_HTTP_STOP_GRACE_MS = 250;

/**
 * How long `archboard stop` waits for the pidfile of a process that no longer
 * answers to go away before it reports the process as stuck. A server stops
 * answering when it closes its listener but removes its pidfile only after the
 * close finishes, which takes up to SERVER_HTTP_STOP_GRACE_MS, so this is
 * twice that grace.
 */
const SERVER_STOP_PIDFILE_WAIT_MS = 2 * SERVER_HTTP_STOP_GRACE_MS;

/** Gap between two looks at that pidfile, short against SERVER_STOP_PIDFILE_WAIT_MS. */
const SERVER_STOP_PIDFILE_POLL_MS = 50;

/**
 * How long `archboard stop` waits for a server it signalled to stop answering
 * before it reports that the server did not stop. The server drains write
 * admission, then closes its listener before Codex process cleanup finishes.
 * Observing /health stop answering does not prove that the child and
 * its group have been reaped. This bounds only the CLI observation, independently
 * of CODEX_COMPOSED_SHUTDOWN_MS. A timeout report does not interrupt the server's
 * owned cleanup or remove its pidfile.
 */
const SERVER_STOP_CONFIRM_MS = 5000;

/** Gap between two health probes while `archboard stop` waits for SERVER_STOP_CONFIRM_MS. */
const SERVER_STOP_PROBE_POLL_MS = 200;

export {
	SERVER_HTTP_STOP_GRACE_MS,
	SERVER_STOP_CONFIRM_MS,
	SERVER_STOP_PIDFILE_POLL_MS,
	SERVER_STOP_PIDFILE_WAIT_MS,
	SERVER_STOP_PROBE_POLL_MS,
};
