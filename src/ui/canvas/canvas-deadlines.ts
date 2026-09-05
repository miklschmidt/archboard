// The two replaceable deadlines a pane keeps besides its change reports: the
// debounce before a pane report, and the renewal of a human hold.

import { PANE_DEBOUNCE_MS } from "@/shared/timing/timing";

/** A clock the deadlines schedule against; the browser's by default. */
interface CanvasDeadlineClock {
	set(delayMs: number, callback: () => void): unknown;
	clear(handle: unknown): void;
}

/**
 * The browser's clock, handing out numeric keys so a handle needs no cast back.
 * @returns A clock over `setTimeout`.
 */
function createBrowserClock(): CanvasDeadlineClock {
	const timeouts = new Map<number, ReturnType<typeof setTimeout>>();
	let nextKey = 0;
	return {
		/**
		 * Schedule a callback.
		 * @param delayMs How long to wait.
		 * @param callback What to run.
		 * @returns The key that clears it.
		 */
		set(delayMs, callback) {
			const key = ++nextKey;
			timeouts.set(
				key,
				setTimeout(() => {
					timeouts.delete(key);
					callback();
				}, delayMs),
			);
			return key;
		},
		/**
		 * Cancel a scheduled callback.
		 * @param handle The key `set` returned.
		 */
		clear(handle) {
			if (typeof handle !== "number") {
				return;
			}
			const timeout = timeouts.get(handle);
			if (timeout !== undefined) {
				clearTimeout(timeout);
				timeouts.delete(handle);
			}
		},
	};
}

/** One deadline handle, cancellable and replaceable. */
interface DeadlineHandle {
	readonly pending: boolean;
	cancel(): void;
	set(delayMs: number, callback: () => void): void;
}

/**
 * A single owned timer over a clock.
 * @param clock The clock to schedule on.
 * @returns The handle.
 */
function createDeadlineHandle(clock: CanvasDeadlineClock): DeadlineHandle {
	let handle: unknown = null;
	/** Drop the pending timer, if any. */
	function cancel(): void {
		if (handle === null) {
			return;
		}
		clock.clear(handle);
		handle = null;
	}
	/**
	 * Arm the timer.
	 * @param delayMs How long to wait.
	 * @param callback What to run when it fires.
	 */
	function set(delayMs: number, callback: () => void): void {
		handle = clock.set(delayMs, () => {
			handle = null;
			callback();
		});
	}
	return {
		/**
		 * Whether a timer is armed.
		 * @returns True while one is pending.
		 */
		get pending() {
			return handle !== null;
		},
		cancel,
		set,
	};
}

/** The debounce between a pane change and its registry report. */
interface PaneReportDeadline {
	readonly pending: boolean;
	schedule(send: () => void, immediate?: boolean): void;
	cancel(): void;
}

/**
 * Own the replaceable debounce between a pane change and its registry report.
 * @param clock The clock to schedule on.
 * @returns The deadline.
 */
function createPaneReportDeadline(
	clock: CanvasDeadlineClock = createBrowserClock(),
): PaneReportDeadline {
	const handle = createDeadlineHandle(clock);
	/**
	 * Replace the pending report with this one.
	 * @param send What sends the report.
	 * @param immediate Send now rather than after the debounce.
	 */
	function schedule(send: () => void, immediate = false): void {
		handle.cancel();
		if (immediate) {
			send();
			return;
		}
		handle.set(PANE_DEBOUNCE_MS, send);
	}
	/** Drop the pending deadline. */
	function cancel(): void {
		handle.cancel();
	}
	return {
		/**
		 * Whether a deadline is armed.
		 * @returns True while one is pending.
		 */
		get pending() {
			return handle.pending;
		},
		schedule,
		cancel,
	};
}

/** The single renewal deadline for one pane's current human hold. */
interface HoldRenewalDeadline {
	readonly pending: boolean;
	/** Schedule a renewal unless one is already pending. */
	schedule(delayMs: number, renew: () => void): boolean;
	cancel(): void;
}

/**
 * Own the single renewal deadline for one pane's current human hold.
 * @param clock The clock to schedule on.
 * @returns The deadline.
 */
function createHoldRenewalDeadline(
	clock: CanvasDeadlineClock = createBrowserClock(),
): HoldRenewalDeadline {
	const handle = createDeadlineHandle(clock);
	/**
	 * Schedule a renewal unless one is already pending.
	 * @param delayMs How long until the renewal.
	 * @param renew What renews the hold.
	 * @returns Whether this call scheduled it.
	 */
	function schedule(delayMs: number, renew: () => void): boolean {
		if (handle.pending) {
			return false;
		}
		handle.set(delayMs, renew);
		return true;
	}
	/** Drop the pending deadline. */
	function cancel(): void {
		handle.cancel();
	}
	return {
		/**
		 * Whether a deadline is armed.
		 * @returns True while one is pending.
		 */
		get pending() {
			return handle.pending;
		},
		schedule,
		cancel,
	};
}

export {
	type CanvasDeadlineClock,
	type HoldRenewalDeadline,
	type PaneReportDeadline,
	createHoldRenewalDeadline,
	createPaneReportDeadline,
};
