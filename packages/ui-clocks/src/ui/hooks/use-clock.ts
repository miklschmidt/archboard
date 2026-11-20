// A clock that re-renders its reader at a fixed tick while it is running, for
// text that says how long ago something happened or how long it has gone on.
// Ticks land on whole multiples of the tick, so two clocks with one tick agree:
// the agent dock and the conversation never show a turn's time a second apart.

import { useEffect, useState } from "react";

/**
 * The current time, read again every tick while running.
 * @param tickMs How often to read it.
 * @param running Whether the clock runs; a stopped clock keeps its last reading.
 * @returns The time in milliseconds.
 */
function useClock(tickMs: number, running = true): number {
	const [now, setNow] = useState(Date.now);
	useEffect(() => {
		if (!running) return undefined;
		let timer = 0;
		/** Read the time, and wait for the next whole tick. */
		const tick = (): void => {
			setNow(Date.now());
			timer = window.setTimeout(tick, tickMs - (Date.now() % tickMs));
		};
		// Read at once: a clock that was stopped must not show its old reading.
		timer = window.setTimeout(tick, 0);
		return () => window.clearTimeout(timer);
	}, [tickMs, running]);
	return now;
}

export { useClock };
