// Server-owned board rendering (ADR 0020): the private Chromium that draws a
// board to PNG or SVG, and the native clipboard a CLI copy hands the image to.
//
// The four renderer bounds keep the flat names the renderer imports while it is
// rewritten. Group them by their owner when the rewrite lands.

import { durations } from "#shared/constants/durations.ts";

/**
 * Bound for one serialized PNG or SVG job in the private renderer. This is intentionally half the proof harness's 20-second
 * fault deadline. Product work renders one immutable request and reports its
 * named page phase when this bound expires.
 */
const SEMANTIC_RASTER_JOB_TIMEOUT_MS = 10_000;

/**
 * Bound for each startup phase of the private Chromium: its control port, then
 * the renderer page. Startup is lazy, so it delays the first Board render only.
 * It pulls against how soon an operator learns that Chromium cannot start. Ten
 * seconds completed three cold starts under a half-CPU quota (TASK-162), but
 * hosted Linux cold starts exceeded it in 2 of 5 gate runs (October 2026, TASK-470).
 */
const SEMANTIC_RASTER_STARTUP_TIMEOUT_MS = 30_000;

/**
 * Bound for each renderer TERM/KILL phase. Two phases fit inside the CLI
 * interrupt grace, leaving time to remove the private profile after the group
 * is proved absent.
 */
const SEMANTIC_RASTER_CLEANUP_MS = 1000;

/**
 * Bound for one DevTools command whose caller names none. A command to a
 * private local Chromium answers in milliseconds, so this only decides how
 * long a wedged browser is waited on before the caller hears so. It matches
 * the renderer's job bound, which a cold page's commands fit inside.
 */
const HEADLESS_CHROMIUM_CALL_MS = SEMANTIC_RASTER_JOB_TIMEOUT_MS;

/** The CLI's copy of a rendered board to the native clipboard. */
const IMAGE_CLIPBOARD_MS = durations({
	/** Bounds native clipboard startup after rasterizer teardown; local copies take milliseconds, but a large image gets five seconds. */
	startup: 5000,
	/** Retire a Linux clipboard owner within one second of replacement, without polling on every event-loop turn. */
	ownerPoll: 1000,
});

export {
	SEMANTIC_RASTER_JOB_TIMEOUT_MS,
	SEMANTIC_RASTER_STARTUP_TIMEOUT_MS,
	SEMANTIC_RASTER_CLEANUP_MS,
	HEADLESS_CHROMIUM_CALL_MS,
	IMAGE_CLIPBOARD_MS,
};
