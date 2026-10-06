// The period of hotspots, as a second entrypoint of the module: `timing.ts` is at its
// length limit, and only the history lens and its answer read this one.

/**
 * The default period of hotspots and change coupling (ADR 0045): the year before the commit time
 * of a checkout's HEAD, counted as 365 days. It pulls against two things. A shorter period leaves
 * most parts below the thresholds that change coupling applies to the same commits. A longer one
 * lets the history of code rewritten long ago decide the answer. On this repository a year holds
 * every commit that changed the parts the design note measured.
 */
export const LOCALITY_DEFAULT_PERIOD_MS = 365 * 24 * 60 * 60 * 1000;
