import { afterEach, beforeEach, describe, expect, jest, test } from "bun:test";

import { after, every, pollUntil, TimedOut, within } from "#shared/constants/timing.ts";

/**
 * Let the promise chains the fake timers just released run to their next timer.
 */
async function settle(): Promise<void> {
	for (let turn = 0; turn < 10; turn++) await Promise.resolve();
}

/**
 * Move the fake clock to each next timer, letting chained work run between, until a promise
 * settles.
 * @param pending The promise.
 * @returns How it settled.
 */
async function drive<T>(pending: Promise<T>): Promise<PromiseSettledResult<T>> {
	const seen: { outcome?: PromiseSettledResult<T> } = {};
	pending.then(
		(value) => (seen.outcome = { status: "fulfilled", value }),
		(reason: unknown) => (seen.outcome = { status: "rejected", reason }),
	);
	await settle();
	for (let step = 0; seen.outcome === undefined && step < 1000; step++) {
		jest.advanceTimersToNextTimer();
		await settle();
	}
	if (seen.outcome === undefined) throw new Error("The wait never settled.");
	return seen.outcome;
}

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

describe("within", () => {
	test("answers the work's value and leaves no timer behind", async () => {
		await expect(within("server.httpStopGrace", () => Promise.resolve("done"))).resolves.toBe(
			"done",
		);
		expect(jest.getTimerCount()).toBe(0);
	});

	test("times out with the wait's name, length and wording, and aborts the work", async () => {
		let workSignal: AbortSignal | undefined;
		const outcome = await drive(
			within("server.mutationDrain", (signal) => {
				workSignal = signal;
				return new Promise(() => {});
			}),
		);
		expect(outcome.status).toBe("rejected");
		const timedOut = (outcome as PromiseRejectedResult).reason as TimedOut;
		expect(timedOut).toBeInstanceOf(TimedOut);
		expect(timedOut.wait).toBe("server.mutationDrain");
		expect(timedOut.message).toMatch(
			/^Timed out after .+ waiting for admitted writes to settle before the server stops\.$/,
		);
		expect(workSignal?.aborted).toBe(true);
		expect(workSignal?.reason).toBe(timedOut);
	});

	test("an override sets the bound, and the message says its length as a person reads it", async () => {
		for (const [length, words] of [
			[250, "250 ms"],
			[1500, "1.5 s"],
			[90_000, "1.5 min"],
			[4 * 3_600_000, "4 h"],
		] as const) {
			const start = performance.now();
			const outcome = await drive(
				within("server.mutationDrain", () => new Promise(() => {}), { ms: length }),
			);
			const timedOut = (outcome as PromiseRejectedResult).reason as TimedOut;
			expect(performance.now() - start).toBe(length);
			expect(timedOut.ms).toBe(length);
			expect(timedOut.message).toStartWith(`Timed out after ${words} waiting for`);
		}
	});

	test("the caller's signal aborts the work and rejects with the caller's reason", async () => {
		const caller = new AbortController();
		let workSignal: AbortSignal | undefined;
		const pending = within(
			"server.mutationDrain",
			(signal) => {
				workSignal = signal;
				return new Promise(() => {});
			},
			{ signal: caller.signal },
		);
		caller.abort(new Error("the request went away"));
		await expect(pending).rejects.toThrow("the request went away");
		expect(workSignal?.aborted).toBe(true);
		expect(jest.getTimerCount()).toBe(0);
	});

	test("a work that throws at once rejects with its error", async () => {
		await expect(
			within("server.mutationDrain", () => {
				throw new Error("refused");
			}),
		).rejects.toThrow("refused");
		expect(jest.getTimerCount()).toBe(0);
	});
});

describe("pollUntil", () => {
	test("answers the first look that holds", async () => {
		let looks = 0;
		const outcome = await drive(
			pollUntil("server.stopConfirm", () => (++looks === 4 ? "gone" : undefined)),
		);
		expect(outcome).toEqual({ status: "fulfilled", value: "gone" });
		expect(jest.getTimerCount()).toBe(0);
	});

	test("looks often at first and never hammers a slow condition", async () => {
		const at: number[] = [];
		const start = performance.now();
		await drive(
			pollUntil("server.stopConfirm", () => {
				at.push(performance.now() - start);
			}),
		);
		const pauses = at.slice(1).map((time, index) => time - (at[index] ?? 0));
		expect(pauses[0]).toBeLessThanOrEqual(20);
		expect(Math.max(...pauses)).toBeLessThanOrEqual(250);
		expect(at.length).toBeLessThan(40);
	});

	test("looks once more when the wait runs out, and a condition that holds then is no timeout", async () => {
		// Once the wait's own timer has fired and no pause is pending, the look is the last one.
		const outcome = await drive(
			pollUntil("server.stopConfirm", () => (jest.getTimerCount() === 0 ? "late" : undefined)),
		);
		expect(outcome).toEqual({ status: "fulfilled", value: "late" });
	});

	test("an unsuccessful look in flight at expiry is followed by a final look", async () => {
		let looks = 0;
		const first = Promise.withResolvers<undefined>();
		const pending = pollUntil("server.stopPidfileWait", () =>
			++looks === 1 ? first.promise : "gone",
		);
		jest.advanceTimersToNextTimer();
		expect(looks).toBe(1);
		first.resolve(undefined);
		await expect(pending).resolves.toBe("gone");
		expect(looks).toBe(2);
		expect(jest.getTimerCount()).toBe(0);
	});

	test("times out with the wait's wording after its last look fails", async () => {
		const outcome = await drive(pollUntil("server.stopConfirm", () => undefined));
		const timedOut = (outcome as PromiseRejectedResult).reason as TimedOut;
		expect(timedOut.wait).toBe("server.stopConfirm");
		expect(timedOut.message).toMatch(
			/^Timed out after .+ waiting for the signalled Archboard server to stop answering\.$/,
		);
		expect(jest.getTimerCount()).toBe(0);
	});

	test("the caller's signal ends the wait with the caller's reason", async () => {
		const caller = new AbortController();
		const pending = pollUntil("server.stopConfirm", () => undefined, { signal: caller.signal });
		await settle();
		caller.abort(new Error("interrupted"));
		await expect(pending).rejects.toThrow("interrupted");
		expect(jest.getTimerCount()).toBe(0);
	});

	test("cancellation ends a wait during a look and observes its later rejection", async () => {
		const caller = new AbortController();
		const look = Promise.withResolvers<undefined>();
		const pending = pollUntil("server.stopConfirm", () => look.promise, { signal: caller.signal });
		const reason = new Error("request cancelled during a look");
		caller.abort(reason);
		await expect(pending).rejects.toBe(reason);
		expect(jest.getTimerCount()).toBe(0);
		look.reject(new Error("the look later failed"));
		await settle();
	});
});

test("every bound carries its wait's name to the timer, so a preload can shorten it by name", async () => {
	const names: unknown[] = [];
	const schedule = globalThis.setTimeout;
	globalThis.setTimeout = ((handler: () => void, delay?: number, ...args: unknown[]) => {
		names.push(args[0]);
		return schedule(handler, delay, ...args);
	}) as typeof globalThis.setTimeout;
	try {
		await within("server.httpStopGrace", () => Promise.resolve());
		await pollUntil("server.stopConfirm", () => true);
	} finally {
		globalThis.setTimeout = schedule;
	}
	expect(names).toEqual(["server.httpStopGrace", "server.stopConfirm"]);
});

describe("after and every", () => {
	test("an awaited delay keeps the process alive while background timers let it exit", () => {
		const result = Bun.spawnSync({
			cmd: [
				process.execPath,
				"--eval",
				`import { after, every } from "@archboard/timing";
				after("claim.activityLinger", () => console.log("lingered"));
				every("modelLock.watch", () => console.log("watched"));
				after("modelLock.stealGuard", () => console.log("settled"));`,
			],
			timeout: 2000,
		});
		expect(result.exitCode).toBe(0);
		expect(result.stdout.toString()).toBe("settled\n");
	});

	test("run their work without arguments, and stop when cancelled", () => {
		const heard: unknown[][] = [];
		const cancel = after("modelLock.stealGuard", (...args: unknown[]) => heard.push(args));
		const stop = every("modelLock.watch", (...args: unknown[]) => heard.push(args));
		jest.advanceTimersToNextTimer();
		jest.advanceTimersToNextTimer();
		jest.advanceTimersToNextTimer();
		expect(heard).toEqual([[], [], []]);
		stop();
		cancel();
		expect(jest.getTimerCount()).toBe(0);
	});
});
