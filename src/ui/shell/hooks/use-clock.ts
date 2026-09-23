// A clock that re-renders its reader at a fixed tick while it is running, for
// text that says how long ago something happened or how long it has gone on.

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
		const timer = window.setInterval(() => setNow(Date.now()), tickMs);
		return () => window.clearInterval(timer);
	}, [tickMs, running]);
	return now;
}

export { useClock };
