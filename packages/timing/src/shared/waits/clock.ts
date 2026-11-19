// The clock a wait reads and sleeps on: the time now, and a timer that can be
// cancelled. Production reads the runtime's clock; a test passes its own.

/** How a wait tells time and sleeps. */
interface Clock {
	/** The time now, in milliseconds; epoch milliseconds on the system clock. */
	readonly now: () => number;
	/**
	 * Run once after a delay. A clock may run it before it returns.
	 * @returns Cancels the run, when it has not happened yet.
	 */
	readonly after: (ms: number, run: () => void) => () => void;
}

/**
 * The runtime's clock. It reads `Date.now` and `setTimeout` when it is called,
 * not when this module loads, so a process that replaces them is obeyed.
 */
const SYSTEM_CLOCK: Clock = Object.freeze({
	/**
	 * The time now.
	 * @returns Milliseconds since the epoch.
	 */
	now: () => Date.now(),
	/**
	 * Run once after a delay, on the runtime's timers.
	 * @param ms The delay.
	 * @param run What to run.
	 * @returns Cancels it.
	 */
	after: (ms: number, run: () => void) => {
		const timer = globalThis.setTimeout(run, ms);
		return () => {
			globalThis.clearTimeout(timer);
		};
	},
});

/**
 * Sleep on a clock, waking early when a signal aborts.
 * @param clock The clock.
 * @param ms How long.
 * @param signal Wakes the sleep when it aborts.
 * @returns True when the signal aborted, before or during the sleep.
 */
function sleep(clock: Clock, ms: number, signal: AbortSignal | undefined): Promise<boolean> {
	if (signal?.aborted === true) return Promise.resolve(true);
	return new Promise<boolean>((resolve) => {
		const state: { settled: boolean; cancel?: () => void } = { settled: false };
		/**
		 * End the sleep once, dropping its timer and its listener.
		 * @param aborted Whether the signal ended it.
		 */
		const finish = (aborted: boolean): void => {
			if (state.settled) return;
			state.settled = true;
			state.cancel?.();
			signal?.removeEventListener("abort", onAbort);
			resolve(aborted);
		};
		/** Wake because the signal aborted. */
		const onAbort = (): void => {
			finish(true);
		};
		const cancel = clock.after(ms, () => {
			finish(false);
		});
		// A clock may run its timer before `after` returns; then the sleep is over already.
		if (state.settled) {
			cancel();
			return;
		}
		state.cancel = cancel;
		signal?.addEventListener("abort", onAbort, { once: true });
	});
}

export { SYSTEM_CLOCK, sleep };
export type { Clock };
