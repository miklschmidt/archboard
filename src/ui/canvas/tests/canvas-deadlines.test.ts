import { describe, expect, test } from "bun:test";

import { LOCK_RENEW_MS, PANE_DEBOUNCE_MS } from "../../../shared/timing/timing.ts";
import {
	createHoldRenewalDeadline,
	createPaneReportDeadline,
	type CanvasDeadlineClock,
} from "../canvas-deadlines.ts";

class ManualClock implements CanvasDeadlineClock {
	#now = 0;
	#next = 0;
	readonly #scheduled = new Map<number, { at: number; callback: () => void }>();

	set(delayMs: number, callback: () => void): number {
		const handle = ++this.#next;
		this.#scheduled.set(handle, { at: this.#now + delayMs, callback });
		return handle;
	}

	clear(handle: unknown): void {
		this.#scheduled.delete(handle as number);
	}

	advance(elapsedMs: number): void {
		const until = this.#now + elapsedMs;
		while (true) {
			const due = [...this.#scheduled.entries()]
				.filter(([, scheduled]) => scheduled.at <= until)
				.toSorted((left, right) => left[1].at - right[1].at || left[0] - right[0])[0];
			if (!due) break;
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
		deadline.schedule(() => (reports += 1));
		clock.advance(PANE_DEBOUNCE_MS - 1);
		deadline.schedule(() => (reports += 1));
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
		deadline.schedule(() => (reports += 1));
		deadline.schedule(() => (reports += 1), true);
		expect(reports).toBe(1);
		clock.advance(PANE_DEBOUNCE_MS);
		expect(reports).toBe(1);
	});
});

describe("human hold renewal deadline", () => {
	test("admits one renewal and runs it at the 1,000 ms boundary", () => {
		const clock = new ManualClock();
		const deadline = createHoldRenewalDeadline(clock);
		let renewals = 0;
		expect(deadline.schedule(LOCK_RENEW_MS, () => (renewals += 1))).toBeTrue();
		expect(deadline.schedule(LOCK_RENEW_MS, () => (renewals += 1))).toBeFalse();
		clock.advance(LOCK_RENEW_MS - 1);
		expect(renewals).toBe(0);
		clock.advance(1);
		expect(renewals).toBe(1);
		expect(deadline.pending).toBeFalse();
	});

	test("cancelling a renewal leaves no later callback", () => {
		const clock = new ManualClock();
		const deadline = createHoldRenewalDeadline(clock);
		let renewals = 0;
		deadline.schedule(LOCK_RENEW_MS, () => (renewals += 1));
		deadline.cancel();
		clock.advance(LOCK_RENEW_MS);
		expect(renewals).toBe(0);
		expect(deadline.pending).toBeFalse();
	});
});
