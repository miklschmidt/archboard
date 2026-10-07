/**
 * Measure overlapping operations once, without counting time idle between them.
 * @returns The operation wrapper and elapsed wall time.
 */
function createElapsedClock() {
	let active = 0;
	let started = 0;
	let elapsed = 0;
	return {
		/**
		 * Time work until it settles, including failures.
		 * @param work The server operation.
		 * @returns Its answer.
		 */
		async measure<T>(work: () => Promise<T>): Promise<T> {
			if (active++ === 0) started = performance.now();
			try {
				return await work();
			} finally {
				if (--active === 0) elapsed += performance.now() - started;
			}
		},
		/**
		 * Time of work that already settled.
		 * @returns Milliseconds.
		 */
		elapsedMs: () => elapsed,
	};
}

export { createElapsedClock };
