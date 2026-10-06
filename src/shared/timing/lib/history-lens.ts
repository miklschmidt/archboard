// How long the history lens reads Git, and how far back it reads (ADR 0045).
// The lens runs only on a request, so these pull against a request that waits
// and against an answer that has to stay comparable, never against a timer.

/**
 * Outer bound for one Git command of the history lens: a walk of the commits
 * that changed bound files, the history of one board file, or a batch of board
 * file versions. On this repository a walk of a year (about 3,300 commits)
 * took 0.4 s on 2026-10-06, so this bounds a Git that hangs and never a walk
 * that is slow. The request that started it, or a stop, cancels it sooner.
 */
const HISTORY_LENS_GIT_TIMEOUT_MS = 60_000;

/**
 * The default period of hotspots and change coupling: the year before the
 * commit time of a checkout's HEAD, counted as 365 days. It pulls against two
 * things. A shorter period leaves most parts below the thresholds that change
 * coupling applies to the same commits. A longer one lets the history of code
 * rewritten long ago decide the answer. On this repository a year holds every
 * commit that changed the parts the design note measured.
 */
const LOCALITY_DEFAULT_PERIOD_MS = 365 * 24 * 60 * 60 * 1000;

export { HISTORY_LENS_GIT_TIMEOUT_MS, LOCALITY_DEFAULT_PERIOD_MS };
