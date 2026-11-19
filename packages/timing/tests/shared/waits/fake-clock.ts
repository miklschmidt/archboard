import type { Clock } from "#shared/waits/clock.ts";

/** A clock that moves only when a test advances it, and records every sleep. */
interface FakeClock extends Clock {
	/** The delays asked of `after`, in order. */
	readonly sleeps: number[];
	/** Move time on, running each timer that falls due, in order. */
	readonly advance: (ms: number) => Promise<void>;
	/** Move time on without running any timer, as a slow probe does. */
	readonly spend: (ms: number) => void;
	/** Run every pending timer, moving time to each, until none is left or a limit passes. */
	readonly runAll: (limit?: number) => Promise<void>;
}

/**
 * A fake clock that starts at a moment.
 * @param startMs The time now.
 * @returns The clock.
 */
function fakeClock(startMs = 1_000_000): FakeClock {
	let now = startMs;
	let next = 0;
	const timers = new Map<number, { at: number; run: () => void }>();
	const sleeps: number[] = [];
	/**
	 * Let promise reactions settle.
	 */
	const flush = async (): Promise<void> => {
		for (let turn = 0; turn < 20; turn += 1) await Promise.resolve();
	};
	/**
	 * Run the earliest timer due by a moment.
	 * @param until The moment.
	 * @returns Whether one ran.
	 */
	const runNext = async (until: number): Promise<boolean> => {
		const due = [...timers.entries()]
			.filter(([, timer]) => timer.at <= until)
			.toSorted(([a, left], [b, right]) => left.at - right.at || a - b)[0];
		if (due === undefined) return false;
		const [id, timer] = due;
		timers.delete(id);
		now = Math.max(now, timer.at);
		timer.run();
		await flush();
		return true;
	};
	return {
		sleeps,
		now: () => now,
		after: (ms, run) => {
			sleeps.push(ms);
			const id = next;
			next += 1;
			timers.set(id, { at: now + Math.max(0, ms), run });
			return () => {
				timers.delete(id);
			};
		},
		advance: async (ms) => {
			await flush();
			const until = now + ms;
			while (await runNext(until));
			now = until;
			await flush();
		},
		spend: (ms) => {
			now += ms;
		},
		runAll: async (limit = 1_000_000) => {
			await flush();
			while (await runNext(startMs + limit));
		},
	};
}

export { fakeClock };
export type { FakeClock };
