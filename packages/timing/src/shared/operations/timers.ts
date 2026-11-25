import { type Delay, type Tick, lengthOf, WAITS } from "#shared/constants/waits.ts";

/**
 * Let the process exit while a background timer is pending.
 * @param wait The delay or cadence.
 * @param timer The timer.
 */
function unrefBackground(wait: Delay | Tick, timer: unknown): void {
	if (!("background" in WAITS[wait])) return;
	if (typeof timer === "object" && timer !== null && "unref" in timer) {
		if (typeof timer.unref === "function") timer.unref();
	}
}

/**
 * Run something once after a declared delay. The timer carries the delay's name, so a test
 * preload can shorten it by name. A background delay lets its process exit.
 * @param wait The delay.
 * @param run What to run.
 * @returns Cancels the run, if it has not happened.
 */
function after(wait: Delay, run: () => void): () => void {
	// The name rides on the timer for a preload to read; `run` never receives it.
	const timer = setTimeout(() => run(), lengthOf(wait), wait);
	unrefBackground(wait, timer);
	return () => clearTimeout(timer);
}

/**
 * Run something at a declared cadence, first after one tick. The timer carries the cadence's
 * name, so a test preload can shorten it by name. A background cadence lets its process exit.
 * @param wait The cadence.
 * @param run What to run on each tick.
 * @returns Stops the cadence.
 */
function every(wait: Tick, run: () => void): () => void {
	const timer = setInterval(() => run(), lengthOf(wait), wait);
	unrefBackground(wait, timer);
	return () => clearInterval(timer);
}

export { after, every };
