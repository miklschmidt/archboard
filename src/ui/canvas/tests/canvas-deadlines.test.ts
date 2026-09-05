import { describe, expect, test } from "bun:test";

import { LOCK_RENEW_MS, PANE_DEBOUNCE_MS } from "@/shared/timing/timing";
import {
	createHoldRenewalDeadline,
	createPaneReportDeadline,
	type CanvasDeadlineClock,
} from "@/ui/canvas/canvas-deadlines";
import { scheduleRenewalForOwnedHoldAttempt, type HoldAttempt } from "@/ui/canvas/hold-attempt";

/** A clock the test advances by hand. */
class ManualClock implements CanvasDeadlineClock {
	#now = 0;
	#next = 0;
	readonly #scheduled = new Map<number, { at: number; callback: () => void }>();

	/**
	 * Arm a timer.
	 * @param delayMs How long until it fires.
	 * @param callback What fires.
	 * @returns The handle.
	 */
	set(delayMs: number, callback: () => void): number {
		const handle = ++this.#next;
		this.#scheduled.set(handle, { at: this.#now + delayMs, callback });
		return handle;
	}

	/**
	 * Cancel a timer.
	 * @param handle The handle `set` returned.
	 */
	clear(handle: unknown): void {
		if (typeof handle === "number") {
			this.#scheduled.delete(handle);
		}
	}

	/**
	 * The next timer due by a time.
	 * @param until The time.
	 * @returns The handle and timer, or undefined.
	 */
	#due(until: number): [number, { at: number; callback: () => void }] | undefined {
		return [...this.#scheduled.entries()]
			.filter(([, scheduled]) => scheduled.at <= until)
			.toSorted((left, right) => left[1].at - right[1].at || left[0] - right[0])[0];
	}

	/**
	 * Move time forward, firing what comes due.
	 * @param elapsedMs How far.
	 */
	advance(elapsedMs: number): void {
		const until = this.#now + elapsedMs;
		for (let due = this.#due(until); due !== undefined; due = this.#due(until)) {
			this.#now = due[1].at;
			this.#scheduled.delete(due[0]);
			due[1].callback();
		}
		this.#now = until;
	}
}

describe("pane report deadline", () => {
	test("replaces changes and sends once at the 300 ms debounce boundary", () => {
		const clock = new ManualClock();
		const deadline = createPaneReportDeadline(clock);
		let reports = 0;
		/** Count a report. */
		function send(): void {
			reports += 1;
		}
		deadline.schedule(send);
		clock.advance(PANE_DEBOUNCE_MS - 1);
		deadline.schedule(send);
		clock.advance(PANE_DEBOUNCE_MS - 1);
		expect(reports).toBe(0);
		expect(deadline.pending).toBeTrue();
		clock.advance(1);
		expect(reports).toBe(1);
		expect(deadline.pending).toBeFalse();
	});

	test("an immediate report cancels the pending debounce", () => {
		const clock = new ManualClock();
		const deadline = createPaneReportDeadline(clock);
		let reports = 0;
		/** Count a report. */
		function send(): void {
			reports += 1;
		}
		deadline.schedule(send);
		deadline.schedule(send, true);
		expect(reports).toBe(1);
		clock.advance(PANE_DEBOUNCE_MS);
		expect(reports).toBe(1);
	});
});

describe("human hold renewal deadline", () => {
	test("stale A1 settlement cannot schedule over A2, while A2 renews at 1,000 ms", () => {
		const clock = new ManualClock();
		const deadline = createHoldRenewalDeadline(clock);
		let generation = 0;
		const firstPromise = Promise.resolve();
		const first: HoldAttempt = { board: "a", generation, promise: firstPromise };
		let current: HoldAttempt | null = first;
		let holds = 1;

		generation += 2;
		const secondPromise = Promise.resolve();
		const second: HoldAttempt = { board: "a", generation, promise: secondPromise };
		current = second;
		holds += 1;

		/**
		 * Settle an attempt the way the pane does.
		 * @param attempt The attempt.
		 * @param promise Its promise.
		 * @returns Whether a renewal was scheduled.
		 */
		function settle(attempt: HoldAttempt, promise: Promise<unknown>): boolean {
			return scheduleRenewalForOwnedHoldAttempt(current, attempt, promise, generation, () => {
				current = null;
				deadline.schedule(LOCK_RENEW_MS, () => {
					holds += 1;
				});
			});
		}

		expect(settle(first, firstPromise)).toBeFalse();
		clock.advance(LOCK_RENEW_MS);
		expect(current).toBe(second);
		expect(deadline.pending).toBeFalse();
		expect(holds).toBe(2);

		expect(settle(second, secondPromise)).toBeTrue();
		expect(current).toBeNull();
		expect(deadline.pending).toBeTrue();
		clock.advance(LOCK_RENEW_MS - 1);
		expect(holds).toBe(2);
		clock.advance(1);
		expect(holds).toBe(3);
		expect(deadline.pending).toBeFalse();
	});

	test("cancelling a renewal leaves no later callback", () => {
		const clock = new ManualClock();
		const deadline = createHoldRenewalDeadline(clock);
		let renewals = 0;
		deadline.schedule(LOCK_RENEW_MS, () => {
			renewals += 1;
		});
		deadline.cancel();
		clock.advance(LOCK_RENEW_MS);
		expect(renewals).toBe(0);
		expect(deadline.pending).toBeFalse();
	});
});
