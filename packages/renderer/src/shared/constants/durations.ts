// Server-owned model rendering (ADR 0020): the private Chromium that draws a
// model to PNG or SVG, and the native clipboard a CLI copy hands the image to.
//
// The four renderer bounds keep the flat names the renderer imports while it is
// rewritten. Group them by their owner when the rewrite lands.

/**
 * Bound for one serialized PNG or SVG job in the private renderer. This is intentionally half the proof harness's 20-second
 * fault deadline. Product work renders one immutable request and reports its
 * named page phase when this bound expires.
 */
const SEMANTIC_RASTER_JOB_TIMEOUT_MS = 10_000;

/**
 * Bound for each startup phase of the private Chromium: its control port, then
 * the renderer page. Startup is lazy, so it delays the first Model render only.
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

// How long a drawn diagram takes to tell an exchange.
//
// The only duration here a person watches rather than waits out, so what it
// pulls against is attention: too long and a reader who looked away never sees
// the beginning come round again, so the page reads as stalled. A pulse flies at
// a speed (a distance a second), which is not a duration and lives with the
// renderer that draws it.

/**
 * The longest a whole exchange's cycle may take before every pulse in it flies
 * faster to keep to it.
 *
 * Past this the exchange reads as stalled rather than slow, so a long one
 * compresses: every message still gets a turn, and the pulses fly faster
 * together. Pulls against the speed of one crossing, which is what says where
 * the message goes.
 */
const FLOW_CYCLE_CAP_MS = 16_000;

/**
 * How long a picture takes to swap its cards drawn near (chip, name and
 * responsibility) for the cards seen from far away (a large tile, a larger name
 * and the start of the responsibility), and back. The chip moves and grows into
 * the tile and the words move between their places while they fade (TASK-428).
 * Both views fade over the whole of it, one in as the other goes out, so the
 * words never fade out together. On a painted model the swap starts the moment the
 * camera crosses the line, so it runs with a zoom or a flight (TASK-562).
 *
 * Pulls against the eye that follows the chip. Shorter than about 200 ms the
 * chip jumps rather than travels, and the change of the words reads as a cut.
 * Longer than about 400 ms the reader, who has stopped zooming to read, waits
 * for the words to settle, and reads two sets of words through each other for
 * too long. It also pulls against the cost: every card's chip and words move in
 * the same frames.
 */
const FAR_VIEW_SWAP_MS = 280;

export {
	FAR_VIEW_SWAP_MS,
	FLOW_CYCLE_CAP_MS,
	HEADLESS_CHROMIUM_CALL_MS,
	SEMANTIC_RASTER_CLEANUP_MS,
	SEMANTIC_RASTER_JOB_TIMEOUT_MS,
	SEMANTIC_RASTER_STARTUP_TIMEOUT_MS,
};
