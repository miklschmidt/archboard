// What the shell reads again on its own: the clocks a person reads at a glance,
// and how long the browser keeps what the server answered.

import { handed, span } from "#shared/constants/uses.ts";

/**
 * Time passing, as the shell says it (TASK-302).
 *
 * The navigator says how long ago an agent last said what it was doing, and
 * the agent dock how long a turn has run. Neither is a deadline: each is a clock
 * a person reads at a glance. The age is coarse ("now", "12s", "4m"), so a
 * slower tick is enough and re-renders the navigator less often; the elapsed
 * time counts seconds, so it ticks every second while a turn runs and not at
 * all otherwise. The quiet threshold is when a running turn that has reported
 * nothing new is worth pointing out: long enough that thinking, a slow build
 * or a long test run is not called stuck, short enough that a person glancing
 * back learns it before they would have given up on it.
 */
const SHELL_CLOCK = {
	/** Time to read an informational toast before it leaves the canvas. */
	"shell.notice": handed(6000),
	/** How often the navigator re-reads how long ago each agent spoke. */
	"shell.ageTick": handed(5000),
	/** How often the agent dock counts a running turn's seconds. */
	"shell.elapsedTick": handed(1000),
	/** How long a running turn reports nothing new before the agent dock says it is quiet. */
	"shell.quiet": span(120_000),
};

/** What the browser keeps of the server's answers (TASK-167). */
const MODEL_CACHE = {
	/**
	 * How long an answer nobody reads any more stays in the cache. It pulls
	 * against the tab's memory rather than the server: it is what lets a model
	 * come back showing its last preview instead of an empty card.
	 */
	"modelCache.gc": handed(5 * 60_000),
	/** Notice vault/configuration edits promptly without scanning the whole vault on every frame. */
	"modelCache.vaultCheck": handed(5_000),
	/**
	 * How long a read that met a write waits before it reads again. A write holds the model for
	 * the moment it lands, about 20 ms, and a read in that moment is refused as busy. The reader
	 * keeps its picture and asks again, up to `modelLock.wait` in all, as an agent that
	 * waits for a model does. A quarter second is soon enough that the written model follows the
	 * write at once, and few enough reads that a model held past the cap costs about twenty.
	 */
	"modelCache.busyRetry": handed(250),
};

export { MODEL_CACHE, SHELL_CLOCK };
