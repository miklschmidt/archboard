// The server's memory of an answer, keyed on everything the answer derives
// from (ADR 0045).
//
// A request that finds its key reads the answer from memory. A request that
// arrives while the answer is being made waits for that work and starts no
// second one. The work stops only when every request that waits for it has
// gone: a caller that hangs up must not cancel the answer of another. The
// memory holds a few answers, the oldest leaving first, and goes with the
// process. It answers no question about what is on a board, so it is not a
// second copy of one.

/** One answer being made, and who waits for it. */
interface Work<T> {
	readonly controller: AbortController;
	readonly promise: Promise<T>;
	waiters: number;
	settled: boolean;
}

/** The memory of one kind of answer. */
interface AnswerMemory<T> {
	/**
	 * The answer for a key: kept, being made, or made now.
	 * @param key Everything the answer derives from.
	 * @param make Makes the answer; it stops when the signal aborts.
	 * @param signal The caller's. Aborting it makes the caller's wait throw its reason.
	 * @returns The answer.
	 */
	answer(key: string, make: (signal: AbortSignal) => Promise<T>, signal?: AbortSignal): Promise<T>;
}

/**
 * Wait for work on behalf of one caller. The last caller to go stops the work,
 * and its wait ends only once the work has settled, so a server that stops
 * and waits for its callers never leaves the work running behind it.
 * @param work The work.
 * @param signal The caller's signal, if the caller can hang up.
 * @returns The work's answer.
 */
async function waitFor<T>(
	work: Work<T>,
	signal: AbortSignal = new AbortController().signal,
): Promise<T> {
	signal.throwIfAborted();
	work.waiters += 1;
	const gone = Promise.withResolvers<never>();
	/**
	 * The caller hung up, so its wait ends with the reason it gave.
	 * @returns Nothing.
	 */
	const leave = () => gone.reject(signal.reason);
	signal.addEventListener("abort", leave, { once: true });
	try {
		return await Promise.race([work.promise, gone.promise]);
	} finally {
		signal.removeEventListener("abort", leave);
		work.waiters -= 1;
		if (work.waiters === 0 && !work.settled) {
			work.controller.abort(signal.reason);
			await work.promise.catch(() => undefined);
		}
	}
}

/**
 * A memory that keeps the newest answers.
 * @param limit How many answers it keeps.
 * @returns The memory.
 */
function createAnswerMemory<T>(limit: number): AnswerMemory<T> {
	const kept = new Map<string, T>();
	const making = new Map<string, Work<T>>();

	/**
	 * Keep an answer, and forget the oldest past the limit.
	 * @param key The answer's key.
	 * @param answer The answer.
	 */
	function remember(key: string, answer: T): void {
		kept.delete(key);
		kept.set(key, answer);
		for (const oldest of kept.keys()) {
			if (kept.size <= limit) break;
			kept.delete(oldest);
		}
	}

	/**
	 * Start making an answer.
	 * @param key The answer's key.
	 * @param make Makes it.
	 * @returns The work.
	 */
	function start(key: string, make: (signal: AbortSignal) => Promise<T>): Work<T> {
		const controller = new AbortController();
		const work: Work<T> = {
			controller,
			waiters: 0,
			settled: false,
			promise: make(controller.signal).then((answer) => {
				remember(key, answer);
				return answer;
			}),
		};
		// Every waiter may have gone, and then nobody reads a failure.
		work.promise
			.catch(() => undefined)
			.finally(() => {
				work.settled = true;
				if (making.get(key) === work) making.delete(key);
			});
		making.set(key, work);
		return work;
	}

	return {
		/**
		 * The answer for a key.
		 * @param key Everything the answer derives from.
		 * @param make Makes the answer.
		 * @param signal The caller's signal.
		 * @returns The answer.
		 */
		async answer(key, make, signal) {
			signal?.throwIfAborted();
			const done = kept.get(key);
			if (done !== undefined) {
				remember(key, done);
				return done;
			}
			const running = making.get(key);
			const work =
				running !== undefined && !running.controller.signal.aborted ? running : start(key, make);
			return await waitFor(work, signal);
		},
	};
}

export { type AnswerMemory, createAnswerMemory };
