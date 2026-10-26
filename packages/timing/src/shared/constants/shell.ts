// What the shell reads again on its own: the clocks a person reads at a glance,
// and how long the browser keeps what the server answered.

import { durations } from "#shared/constants/durations.ts";

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
const SHELL_CLOCK_MS = durations({
	/** How often the navigator re-reads how long ago each agent spoke. */
	ageTick: 5000,
	/** How often the agent dock counts a running turn's seconds. */
	elapsedTick: 1000,
	/** How long a running turn reports nothing new before the agent dock says it is quiet. */
	quiet: 120_000,
});

/** What the browser keeps of the server's answers (TASK-167). */
const BOARD_CACHE_MS = durations({
	/**
	 * How long the board listing stays fresh. The listing is small and every
	 * event that can change it invalidates it by name, so this window is only the
	 * floor under a burst of them. It is the one thing read again when the tab
	 * comes back to the foreground, since nothing announces that the vault gained
	 * a note. A board a pane holds is drawn from that pane and never read here.
	 */
	listingStale: 30_000,
	/**
	 * How long an answer nobody reads any more stays in the cache. It pulls
	 * against the tab's memory rather than the server: it is what lets a board
	 * come back showing its last preview instead of an empty card.
	 */
	gc: 5 * 60_000,
	/** Notice vault/configuration edits promptly without scanning the whole vault on every frame. */
	vaultCheck: 5_000,
});

export { SHELL_CLOCK_MS, BOARD_CACHE_MS };
