import { type Delay, type Tick, lengthOf } from "#shared/constants/waits.ts";

/**
 * Run something once after a declared delay. The timer carries the delay's name, so a test
 * preload can shorten it by name.
 * @param wait The delay.
 * @param run What to run.
 * @returns Cancels the run, if it has not happened.
 */
function after(wait: Delay, run: () => void): () => void {
	const timer = setTimeout(run, lengthOf(wait), wait);
	return () => clearTimeout(timer);
}

/**
 * Run something at a declared cadence, first after one tick. The timer carries the cadence's
 * name, so a test preload can shorten it by name.
 * @param wait The cadence.
 * @param run What to run on each tick.
 * @returns Stops the cadence.
 */
function every(wait: Tick, run: () => void): () => void {
	const timer = setInterval(run, lengthOf(wait), wait);
	return () => clearInterval(timer);
}

export { after, every };
