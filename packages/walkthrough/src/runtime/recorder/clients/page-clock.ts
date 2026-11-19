// The clock the recorder waits on a page with. It is monotonic, so a change of
// the system clock during a recording never cuts a wait short or stretches it.

import type { Clock } from "@archboard/timing";

/** The process's monotonic clock and its timers. */
const PAGE_CLOCK: Clock = Object.freeze({
	/**
	 * The time now.
	 * @returns Milliseconds on the monotonic clock.
	 */
	now: () => performance.now(),
	/**
	 * Run once after a delay.
	 * @param ms The delay.
	 * @param run What to run.
	 * @returns Cancels it.
	 */
	after: (ms: number, run: () => void) => {
		const timer = setTimeout(run, ms);
		return () => {
			clearTimeout(timer);
		};
	},
});

export { PAGE_CLOCK };
