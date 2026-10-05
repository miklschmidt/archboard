// What the kit holds while it runs: a take's server and its Chromium. Both outlive the kit's own
// process, since Chromium runs in a process group of its own and the server is a daemon, so a
// Ctrl-C would leave them running. While anything is held, SIGINT and SIGTERM stop all of it and
// then end the kit with the signal's exit status. The handlers are removed once nothing is held.

/** What stops one held thing. */
type Stop = () => Promise<void>;

/** The exit status of a run a signal ended: 128 and the signal's number. */
const SIGNAL_EXIT = { SIGINT: 130, SIGTERM: 143 } as const;

type Signal = keyof typeof SIGNAL_EXIT;

const SIGNALS: readonly Signal[] = ["SIGINT", "SIGTERM"];

/** Everything held now, each stop safe to call twice. */
const held = new Set<Stop>();

/**
 * Stop everything held, then end the kit with the signal's exit status.
 * @param signal The signal that arrived.
 */
async function stopAndExit(signal: Signal): Promise<void> {
	console.error(`${signal}: stopping the servers and browsers the kit started.`);
	const stopped = await Promise.allSettled([...held].map(async (stop) => stop()));
	for (const result of stopped) {
		if (result.status === "rejected") console.error(String(result.reason));
	}
	process.exit(SIGNAL_EXIT[signal]);
}

/**
 * The one handler of both signals, kept so it can be removed again.
 * @param signal The signal that arrived.
 */
function onSignal(signal: Signal): void {
	void stopAndExit(signal);
}

/**
 * A stop that does its work once, however often it is called.
 * @param stop The stop.
 * @returns The stop, done once.
 */
function once(stop: Stop): Stop {
	let stopping: Promise<void> | undefined;
	return async () => {
		stopping ??= stop();
		return stopping;
	};
}

/**
 * Run a body while holding something, and stop the held thing when the body ends: when it
 * finishes, when it fails, or when SIGINT or SIGTERM arrives first.
 * @param stop What stops the held thing.
 * @param body What runs while it is held.
 * @returns What the body returned.
 */
async function holding<Result>(stop: Stop, body: () => Promise<Result>): Promise<Result> {
	const stopOnce = once(stop);
	if (held.size === 0) for (const signal of SIGNALS) process.on(signal, onSignal);
	held.add(stopOnce);
	try {
		return await body();
	} finally {
		held.delete(stopOnce);
		if (held.size === 0) for (const signal of SIGNALS) process.off(signal, onSignal);
		await stopOnce();
	}
}

export { holding };
