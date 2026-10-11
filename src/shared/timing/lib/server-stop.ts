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

export { SERVER_HTTP_STOP_GRACE_MS, SERVER_STOP_PIDFILE_POLL_MS, SERVER_STOP_PIDFILE_WAIT_MS };
