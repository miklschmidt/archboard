import { type Delay, type Tick, lengthOf } from "#shared/constants/waits.ts";

/**
 * Let a timer not be the reason a process stays alive, where the runtime has processes.
 * @param timer The timer.
 */
function unref(timer: unknown): void {
	if (typeof timer === "object" && timer !== null && "unref" in timer) {
		if (typeof timer.unref === "function") timer.unref();
	}
}

/**
 * Run something once after a declared delay. The timer carries the delay's name, so a test
 * preload can shorten it by name. It is never the reason a process stays alive.
 * @param wait The delay.
 * @param run What to run.
 * @returns Cancels the run, if it has not happened.
 */
function after(wait: Delay, run: () => void): () => void {
	// The name rides on the timer for a preload to read; `run` never receives it.
	const timer = setTimeout(() => run(), lengthOf(wait), wait);
	unref(timer);
	return () => clearTimeout(timer);
}

/**
 * Run something at a declared cadence, first after one tick. The timer carries the cadence's
 * name, so a test preload can shorten it by name. It is never the reason a process stays alive.
 * @param wait The cadence.
 * @param run What to run on each tick.
 * @returns Stops the cadence.
 */
function every(wait: Tick, run: () => void): () => void {
	const timer = setInterval(() => run(), lengthOf(wait), wait);
	unref(timer);
	return () => clearInterval(timer);
}

export { after, every };
