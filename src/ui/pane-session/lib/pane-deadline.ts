// The one replaceable deadline a pane keeps: the debounce before it tells the
// server what it is showing.
//
// A pane report is what the server answers `browser panes` from, so it must be
// current; it is also raised by every resize, focus change and board move, so
// sending one per event would be a request per animation frame. The debounce is
// the compromise, and `immediate` is the escape for the one case that cannot
// wait — a pane arriving on a board, which the next CLI turn reads.

import { PANE_DEBOUNCE_MS } from "@/shared/timing/timing";

/** A clock the deadline schedules against; the browser's by default. */
interface PaneDeadlineClock {
	set(delayMs: number, callback: () => void): unknown;
	clear(handle: unknown): void;
}

/**
 * The browser's clock, handing out numeric keys so a handle needs no cast back.
 * @returns A clock over `setTimeout`.
 */
function createBrowserClock(): PaneDeadlineClock {
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
	clock: PaneDeadlineClock = createBrowserClock(),
): PaneReportDeadline {
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
	 * Replace the pending report with this one.
	 * @param send What sends the report.
	 * @param immediate Send now rather than after the debounce.
	 */
	function schedule(send: () => void, immediate = false): void {
		cancel();
		if (immediate) {
			send();
			return;
		}
		handle = clock.set(PANE_DEBOUNCE_MS, () => {
			handle = null;
			send();
		});
	}
	return {
		/**
		 * Whether a deadline is armed.
		 * @returns True while one is pending.
		 */
		get pending() {
			return handle !== null;
		},
		schedule,
		cancel,
	};
}

export { createPaneReportDeadline, type PaneDeadlineClock, type PaneReportDeadline };
