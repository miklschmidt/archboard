// How long the code check waits for a language server to stop, and how far back the
// history lens reads (ADR 0045, ADR 0057). The code check's language servers wait until
// they finish or their caller cancels them, so only their cleanup has a deadline
// (TASK-436.02). The lens runs only on a request, so its period pulls against a request
// that waits and against an answer that has to stay comparable, never against a timer.

/**
 * From a language server's shutdown to its process exit, then kill the server and its
 * process group. No further answer is needed during cleanup. TypeScript 7.0.2 took 19 to
 * 27 ms on 2026-10-06; 2 seconds lets normal shutdown finish before escalation.
 */
const LANGUAGE_SERVER_STOP_MS = 2000;

/**
 * The default period of hotspots and change coupling: the year before the
 * commit time of a checkout's HEAD, counted as 365 days. It pulls against two
 * things. A shorter period leaves most parts below the thresholds that change
 * coupling applies to the same commits. A longer one lets the history of code
 * rewritten long ago decide the answer. On this repository a year holds every
 * commit that changed the parts the design note measured.
 */
const LOCALITY_DEFAULT_PERIOD_MS = 365 * 24 * 60 * 60 * 1000;

export { LANGUAGE_SERVER_STOP_MS, LOCALITY_DEFAULT_PERIOD_MS };
